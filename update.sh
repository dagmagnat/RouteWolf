#!/bin/sh
# =============================================================================
#  RouteWolf - universal bootstrapper + nightly list agent
# =============================================================================
#  ДВА РЕЖИМА:
#
#  1) --auto  (так вызывает ТОЛЬКО cron в 02:00)
#     Лёгкий агент: проверяет, изменились ли списки.
#       * не изменились -> выходит, не тронув роутер          <- 95% ночей
#       * изменились    -> применяет РОДНЫМ кодом роутера
#     Тарбол проекта НЕ качается. Переустановки НЕТ. Записи во flash НЕТ.
#
#  2) без --auto  (человек запускает руками / команда из README / локальный репо)
#     Полностью прежнее поведение. Ничего не изменилось.
#
#  ЗАЧЕМ: раньше cron КАЖДУЮ ночь качал 600 КБ тарбола в /tmp (а это RAM!),
#  полностью переустанавливал проект, писал во flash и делал
#  2x firewall restart + 2x dnsmasq restart. На роутерах с 64 МБ ОЗУ
#  (Xiaomi 4C и подобные) это и есть источник тормозов и зависаний туннеля.
#
#  FAIL-OPEN: любая ошибка в агенте -> откат к прежнему поведению.
#             Хуже, чем было, стать не может.
# =============================================================================

# Никогда не ставить "set -e": под cron это тихая смерть без диагностики.
set +e

# --- Ночной автозапуск помечен флагом --auto. Только он идёт лёгким путём. ---
ROUTEWOLF_AUTO=0
for _a in "$@"; do [ "$_a" = "--auto" ] && ROUTEWOLF_AUTO=1; done

if [ "$ROUTEWOLF_AUTO" = "1" ]; then

    RW_LISTS="https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists"
    RW_STATE="/etc/routewolf"
    RW_HASH="$RW_STATE/lists.hash"
    RW_COUNT="$RW_STATE/lists.count"
    RW_WORK="/tmp/routewolf-listcheck"

    rw_log() { printf '[RouteWolf] %s\n' "$*"; }

    # Применение списков делает РОДНОЙ, уже проверенный код с флешки роутера.
    # Своей логики в критический путь не добавляем.
    rw_apply() {
        if [ -x /etc/init.d/routewolf ]; then /etc/init.d/routewolf start; return $?; fi
        if [ -x /etc/init.d/getdomains ]; then /etc/init.d/getdomains start; return $?; fi
        return 1
    }

    rw_fallback() {
        rw_log "!! $1"
        rw_log "!! откатываюсь к прежнему поведению (обычное обновление списков)"
        rw_apply
        rm -rf "$RW_WORK" 2>/dev/null
        exit 0
    }

    # --- Какие списки нужны ИМЕННО ЭТОМУ роутеру (профиль full/lite/custom) ---
    RW_HAVE_CONF=0
    if   [ -f /etc/routewolf/user.conf ];        then . /etc/routewolf/user.conf 2>/dev/null;        RW_HAVE_CONF=1
    elif [ -f /etc/domain-routing-user.conf ];   then . /etc/domain-routing-user.conf 2>/dev/null;   RW_HAVE_CONF=1
    fi

    if [ "$RW_HAVE_CONF" = "0" ]; then
        DOMAINS_URL="$RW_LISTS/domains-dnsmasq-nfset.lst"
        IPV4_URL="$RW_LISTS/ipv4.lst"
        IPV6_URL="$RW_LISTS/ipv6.lst"
    fi

    if [ -z "${DOMAINS_URL:-}" ] && [ -z "${IPV4_URL:-}" ] && [ -z "${IPV6_URL:-}" ]; then
        rw_log "списки отключены в конфиге - делать нечего"
        exit 0
    fi

    rw_fetch() {
        _u="$1"; _o="$2"
        [ -n "$_u" ] || return 1
        rm -f "$_o" 2>/dev/null
        if [ -x /usr/sbin/routewolf-fetch.sh ]; then
            /usr/sbin/routewolf-fetch.sh "$_u" "$_o" >/dev/null 2>&1 && [ -s "$_o" ] && return 0
        fi
        if [ -x /bin/uclient-fetch ]; then
            /bin/uclient-fetch --no-check-certificate -O "$_o" "$_u" >/dev/null 2>&1 && [ -s "$_o" ] && return 0
        fi
        if command -v curl >/dev/null 2>&1; then
            curl -kfsSL --connect-timeout 15 --max-time 120 "$_u" -o "$_o" >/dev/null 2>&1 && [ -s "$_o" ] && return 0
        fi
        if command -v wget >/dev/null 2>&1; then
            wget -q --no-check-certificate -O "$_o" "$_u" >/dev/null 2>&1 && [ -s "$_o" ] && return 0
        fi
        return 1
    }

    # GitHub при ошибке отдаёт HTML. Если принять его за список и запомнить хеш,
    # роутер решит "всё свежее" и никогда не починится. Проверяем ДО запоминания.
    rw_sane() {
        _f="$1"
        [ -s "$_f" ] || return 1
        grep -qiE '<html|<!doctype|404: *not found' "$_f" && return 1
        grep -qE '^[^#[:space:]]' "$_f" || return 1
        return 0
    }

    rm -rf "$RW_WORK" 2>/dev/null
    mkdir -p "$RW_WORK" 2>/dev/null || rw_fallback "не могу создать $RW_WORK"

    [ -n "${DOMAINS_URL:-}" ] && { rw_fetch "$DOMAINS_URL" "$RW_WORK/1-domains.lst" || rw_fallback "не скачался список доменов"; }
    [ -n "${IPV4_URL:-}" ]    && { rw_fetch "$IPV4_URL"    "$RW_WORK/2-ipv4.lst"    || rw_fallback "не скачался список IPv4"; }
    [ -n "${IPV6_URL:-}" ]    && { rw_fetch "$IPV6_URL"    "$RW_WORK/3-ipv6.lst"    || rw_fallback "не скачался список IPv6"; }

    for _f in "$RW_WORK"/*.lst; do
        [ -e "$_f" ] || continue
        rw_sane "$_f" || rw_fallback "скачался мусор вместо списка (${_f##*/})"
    done

    # Защита от обрыва закачки: список внезапно похудел вдвое -> не верим.
    RW_NEW_COUNT=$(cat "$RW_WORK"/*.lst 2>/dev/null | grep -cE '^[^#[:space:]]')
    RW_OLD_COUNT=$(cat "$RW_COUNT" 2>/dev/null)
    if [ -n "$RW_OLD_COUNT" ] && [ "$RW_OLD_COUNT" -gt 20 ] 2>/dev/null; then
        if [ "$RW_NEW_COUNT" -lt "$((RW_OLD_COUNT / 2))" ] 2>/dev/null; then
            rw_log "!! подозрительно: было $RW_OLD_COUNT записей, стало $RW_NEW_COUNT"
            rw_log "!! похоже на обрыв загрузки - НЕ применяю, оставляю текущие списки"
            rm -rf "$RW_WORK" 2>/dev/null
            exit 0
        fi
    fi

    # --- Главное: изменилось ли хоть что-нибудь? ---
    RW_NEW_HASH=$(cat "$RW_WORK"/*.lst 2>/dev/null | md5sum 2>/dev/null | awk '{print $1}')
    RW_OLD_HASH=$(cat "$RW_HASH" 2>/dev/null)
    [ -n "$RW_NEW_HASH" ] || rw_fallback "не смог посчитать контрольную сумму"

    if [ "$RW_NEW_HASH" = "$RW_OLD_HASH" ]; then
        rw_log "списки не изменились ($RW_NEW_COUNT записей) - роутер не трогаю"
        rm -rf "$RW_WORK" 2>/dev/null
        exit 0
    fi

    rw_log "списки изменились -> применяю (было: ${RW_OLD_COUNT:-нет данных}, стало: $RW_NEW_COUNT)"
    rw_apply
    RW_RC=$?
    if [ "$RW_RC" -ne 0 ]; then
        rw_log "!! применение вернуло код $RW_RC - хеш НЕ запоминаю, повторю следующей ночью"
        rm -rf "$RW_WORK" 2>/dev/null
        exit 0
    fi

    # Хеш запоминаем ТОЛЬКО после успешного применения, иначе один сбой
    # навсегда заморозил бы роутер на битых списках.
    mkdir -p "$RW_STATE" 2>/dev/null
    printf '%s\n' "$RW_NEW_HASH"  > "$RW_HASH"  2>/dev/null
    printf '%s\n' "$RW_NEW_COUNT" > "$RW_COUNT" 2>/dev/null

    rw_log "готово: списки обновлены ($RW_NEW_COUNT записей)"
    rm -rf "$RW_WORK" 2>/dev/null
    exit 0
fi

# =============================================================================
#  Ниже - ИСХОДНЫЙ bootstrapper БЕЗ ИЗМЕНЕНИЙ.
#  Сюда попадает только ручной запуск: команда из README, локальный репозиторий.
#  Поведение полностью прежнее.
# =============================================================================
# RouteWolf universal bootstrapper for OpenWrt.
# It deliberately prefers /bin/uclient-fetch over a package named wget,
# because wget-nossl on some apk-based builds cannot download HTTPS.

ACTION="update"
REPO="dagmagnat/RouteWolf"
BRANCH="${ROUTEWOLF_BRANCH:-main}"
TMP_DIR="/tmp/routewolf-update"
[ "$ACTION" = "install" ] && TMP_DIR="/tmp/routewolf"
ARCHIVE_FILE="/tmp/routewolf-update.tar.gz"
[ "$ACTION" = "install" ] && ARCHIVE_FILE="/tmp/routewolf.tar.gz"
ARCHIVE_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"

SELF_NAME="${0##*/}"
DIR=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd)

# Local mode: run directly from an unpacked repository without downloading anything.
if [ "$SELF_NAME" = "update.sh" ] && [ -f "$DIR/routewolf-install.sh" ]; then
    chmod +x "$DIR/routewolf-install.sh" 2>/dev/null || true
    exec sh "$DIR/routewolf-install.sh" --update "$@"
fi

fetch_to_file() {
    _url="$1"
    _out="$2"
    rm -f "$_out"

    # OpenWrt's native HTTPS client. Calling the absolute path bypasses
    # a broken /usr/bin/wget alternative such as wget-nossl.
    if [ -x /bin/uclient-fetch ]; then
        /bin/uclient-fetch --no-check-certificate -O "$_out" "$_url" >/dev/null 2>&1 && [ -s "$_out" ] && return 0
        rm -f "$_out"
        /bin/uclient-fetch -O "$_out" "$_url" && [ -s "$_out" ] && return 0
        rm -f "$_out"
    fi

    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch --no-check-certificate -O "$_out" "$_url" >/dev/null 2>&1 && [ -s "$_out" ] && return 0
        rm -f "$_out"
        uclient-fetch -O "$_out" "$_url" && [ -s "$_out" ] && return 0
        rm -f "$_out"
    fi

    if command -v curl >/dev/null 2>&1; then
        curl -kfsSL --connect-timeout 15 --max-time 180 --retry 2 "$_url" -o "$_out" && [ -s "$_out" ] && return 0
        rm -f "$_out"
    fi

    if command -v wget >/dev/null 2>&1; then
        if wget --help 2>&1 | grep -q -- '--no-check-certificate'; then
            wget --no-check-certificate -O "$_out" "$_url" && [ -s "$_out" ] && return 0
        else
            wget -O "$_out" "$_url" && [ -s "$_out" ] && return 0
        fi
        rm -f "$_out"
    fi

    return 1
}

extract_archive() {
    _archive="$1"
    if command -v tar >/dev/null 2>&1; then
        tar -xzf "$_archive" -C /tmp >/dev/null 2>&1 && return 0
    fi
    if command -v busybox >/dev/null 2>&1; then
        busybox tar -xzf "$_archive" -C /tmp >/dev/null 2>&1 && return 0
    fi
    if command -v gzip >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then
        gzip -dc "$_archive" | tar -xf - -C /tmp >/dev/null 2>&1 && return 0
    fi
    return 1
}

echo "RouteWolf: downloading ${REPO}@${BRANCH}..."

rm -rf "$TMP_DIR" "$ARCHIVE_FILE"     "/tmp/RouteWolf-${BRANCH}" "/tmp/routewolf-${BRANCH}"     "/tmp/RouteWolf-main" "/tmp/routewolf-main"     "/tmp/routing-openwrt-${BRANCH}" "/tmp/routing-openwrt-main"

if ! fetch_to_file "$ARCHIVE_URL" "$ARCHIVE_FILE"; then
    echo "Error: no working HTTPS downloader could fetch RouteWolf."
    echo "Try the short OpenWrt command:"
    echo "  /bin/uclient-fetch --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/update.sh | sh"
    echo "If /bin/uclient-fetch is missing, install/use curl or upload the ZIP manually."
    exit 1
fi

if ! extract_archive "$ARCHIVE_FILE"; then
    echo "Error: failed to unpack the RouteWolf tar.gz archive."
    echo "BusyBox tar with gzip support is required; it is present in normal OpenWrt images."
    exit 1
fi
rm -f "$ARCHIVE_FILE" 2>/dev/null || true

if [ -d "/tmp/RouteWolf-${BRANCH}" ]; then
    mv "/tmp/RouteWolf-${BRANCH}" "$TMP_DIR"
elif [ -d "/tmp/routewolf-${BRANCH}" ]; then
    mv "/tmp/routewolf-${BRANCH}" "$TMP_DIR"
elif [ -d "/tmp/RouteWolf-main" ]; then
    mv "/tmp/RouteWolf-main" "$TMP_DIR"
elif [ -d "/tmp/routewolf-main" ]; then
    mv "/tmp/routewolf-main" "$TMP_DIR"
elif [ -d "/tmp/routing-openwrt-${BRANCH}" ]; then
    mv "/tmp/routing-openwrt-${BRANCH}" "$TMP_DIR"
elif [ -d "/tmp/routing-openwrt-main" ]; then
    mv "/tmp/routing-openwrt-main" "$TMP_DIR"
else
    echo "Error: archive was unpacked, but the RouteWolf source directory was not found."
    ls -la /tmp | grep -i 'route\|wolf' || true
    exit 1
fi

cd "$TMP_DIR" || exit 1
chmod +x install.sh update.sh uninstall.sh cleanup.sh routewolf-install.sh routewolf-uninstall.sh routewolf-check.sh 2>/dev/null || true
sh ./routewolf-install.sh --update "$@"
RC="$?"
cd / >/dev/null 2>&1 || true
rm -rf "$TMP_DIR" "$ARCHIVE_FILE" "/tmp/RouteWolf-${BRANCH}" "/tmp/routewolf-${BRANCH}" 2>/dev/null || true
exit "$RC"
