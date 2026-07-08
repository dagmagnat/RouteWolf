#!/bin/sh

#set -x
PROJECT_VERSION="v44-low-flash-safe"

# Project defaults for dagmagnat/routing-openwrt.
# Lists are read from GitHub RAW links. By default they are stored in this repository,
# but you can move lists to a separate repo later by changing DEFAULT_LISTS_REPO/BRANCH.
DEFAULT_PROJECT_REPO="dagmagnat/routing-openwrt"
DEFAULT_LISTS_REPO="${ROUTING_OPENWRT_LISTS_REPO:-dagmagnat/routing-openwrt}"
DEFAULT_LISTS_BRANCH="${ROUTING_OPENWRT_LISTS_BRANCH:-main}"
DEFAULT_LISTS_BASE_URL="https://raw.githubusercontent.com/${DEFAULT_LISTS_REPO}/${DEFAULT_LISTS_BRANCH}/lists"
DEFAULT_DOMAIN_LIST_URL="${ROUTING_OPENWRT_DOMAINS_URL:-${DEFAULT_LISTS_BASE_URL}/domains-dnsmasq-nfset.lst}"
DEFAULT_IPV4_LIST_URL="${ROUTING_OPENWRT_IPV4_URL:-${DEFAULT_LISTS_BASE_URL}/ipv4.lst}"
DEFAULT_IPV6_LIST_URL="${ROUTING_OPENWRT_IPV6_URL:-${DEFAULT_LISTS_BASE_URL}/ipv6.lst}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)
[ -d "$SCRIPT_DIR/lists" ] || SCRIPT_DIR="$(pwd)"

# Safe defaults. 1 = use, 0 = skip.
# Domain and IPv4 CIDR routing are enabled by default. IPv6, DNS redirect and blackhole are OFF by default
# so ordinary WAN internet is not broken if VPN/list/DNS is unavailable.
DEFAULT_USE_DOMAIN_LIST="1"
DEFAULT_USE_IPV4_LIST="1"
DEFAULT_IPV6_SUPPORT="0"
DEFAULT_DNS_REDIRECT="0"
DEFAULT_FAIL_MODE="open"
FORCE_REINSTALL="0"
[ "$1" = "--reinstall" ] && FORCE_REINSTALL="1"

# Universal downloader for OpenWrt/X-WRT/ImmortalWrt builds.
# Prefer the native client by absolute path so wget-nossl cannot shadow it.
wget_has_no_check() { wget --help 2>&1 | grep -q -- '--no-check-certificate'; }

download_url_to_file() {
    url="$1"
    out="$2"
    [ -n "$url" ] && [ -n "$out" ] || return 1
    rm -f "$out"

    if [ -x /bin/uclient-fetch ]; then
        /bin/uclient-fetch --no-check-certificate -O "$out" "$url" >/dev/null 2>&1 && [ -s "$out" ] && return 0
        rm -f "$out"
        /bin/uclient-fetch -O "$out" "$url" && [ -s "$out" ] && return 0
        rm -f "$out"
    fi

    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch --no-check-certificate -O "$out" "$url" >/dev/null 2>&1 && [ -s "$out" ] && return 0
        rm -f "$out"
        uclient-fetch -O "$out" "$url" && [ -s "$out" ] && return 0
        rm -f "$out"
    fi

    if command -v curl >/dev/null 2>&1; then
        curl -kfsSL --connect-timeout 15 --max-time 180 --retry 2 "$url" -o "$out" 2>/dev/null && [ -s "$out" ] && return 0
        rm -f "$out"
    fi

    if command -v wget >/dev/null 2>&1; then
        if wget_has_no_check; then
            wget --no-check-certificate -O "$out" "$url" && [ -s "$out" ] && return 0
        else
            wget -O "$out" "$url" && [ -s "$out" ] && return 0
        fi
        rm -f "$out"
    fi

    return 1
}

# Colors are used only for orientation during install.
# Green = success/active, yellow = warning/planned, red = cancel/error/delete, blue = section.
C_RESET="\033[0m"
C_RED="\033[31;1m"
C_GREEN="\033[32;1m"
C_YELLOW="\033[33;1m"
C_BLUE="\033[34;1m"
C_CYAN="\033[36;1m"

clear_screen() { command -v clear >/dev/null 2>&1 && clear; }

is_ru() { [ "${ROUTING_OPENWRT_LANG:-en}" = "ru" ]; }
msg() { if is_ru; then echo "$2"; else echo "$1"; fi; }
msgc() {
    _color="$1"; _en="$2"; _ru="$3"
    if is_ru; then printf "%b%s%b\n" "$_color" "$_ru" "$C_RESET"; else printf "%b%s%b\n" "$_color" "$_en" "$C_RESET"; fi
}
prompt() { if is_ru; then printf "%s" "$2"; else printf "%s" "$1"; fi; }

ui_header() {
    _title="$1"
    printf "%b========================================%b\n" "$C_BLUE" "$C_RESET"
    printf "%b        %s%b\n" "$C_CYAN" "$_title" "$C_RESET"
    printf "%b========================================%b\n" "$C_BLUE" "$C_RESET"
}

choose_language() {
    [ -n "${ROUTING_OPENWRT_LANG:-}" ] && return
    clear_screen
    printf "%bRouting OpenWrt%b\n" "$C_BLUE" "$C_RESET"
    echo "1) English"
    echo "2) Русский"
    while true; do
        printf "Select language / Выберите язык [2]: "
        read -r RO_LANG_CHOICE
        RO_LANG_CHOICE=${RO_LANG_CHOICE:-2}
        case "$RO_LANG_CHOICE" in
            1|en|EN|english|English) ROUTING_OPENWRT_LANG="en"; export ROUTING_OPENWRT_LANG; break ;;
            2|ru|RU|русский|Русский) ROUTING_OPENWRT_LANG="ru"; export ROUTING_OPENWRT_LANG; break ;;
            *) printf "%bChoose 1 or 2 / Выберите 1 или 2%b\n" "$C_RED" "$C_RESET" ;;
        esac
    done
    clear_screen
}

pause_screen() {
    echo ""
    if is_ru; then read -r -p "Нажмите Enter для продолжения..." _pause; else read -r -p "Press Enter to continue..." _pause; fi
}

is_back() { [ "$1" = "?" ] || [ "$1" = "back" ] || [ "$1" = "назад" ]; }

router_resource_summary() {
    FLASH_TOTAL_KB=$(df -k / 2>/dev/null | awk 'NR==2 {print $2+0}')
    FLASH_FREE_KB=$(df -k / 2>/dev/null | awk 'NR==2 {print $4+0}')
    RAM_TOTAL_KB=$(awk '/MemTotal/ {print $2+0}' /proc/meminfo 2>/dev/null)
    RAM_FREE_KB=$(awk '/MemAvailable/ {print $2+0}' /proc/meminfo 2>/dev/null)
    [ -n "$RAM_FREE_KB" ] || RAM_FREE_KB=$(awk '/MemFree/ {print $2+0}' /proc/meminfo 2>/dev/null)
    FLASH_TOTAL_MB=$((FLASH_TOTAL_KB/1024))
    FLASH_FREE_MB=$((FLASH_FREE_KB/1024))
    RAM_TOTAL_MB=$((RAM_TOTAL_KB/1024))
    RAM_FREE_MB=$((RAM_FREE_KB/1024))
    echo "Router resources / Ресурсы роутера: flash ${FLASH_TOTAL_MB}MB total, ${FLASH_FREE_MB}MB free; RAM ${RAM_TOTAL_MB}MB total, ${RAM_FREE_MB}MB available"
}

profile_local_file() {
    profile="$1"; kind="$2"
    case "$profile:$kind" in
        full:domains) echo "$SCRIPT_DIR/lists/domains-dnsmasq-nfset.lst" ;;
        full:ipv4) echo "$SCRIPT_DIR/lists/ipv4.lst" ;;
        full:ipv6) echo "$SCRIPT_DIR/lists/ipv6.lst" ;;
        *:domains) echo "$SCRIPT_DIR/lists/profiles/$profile/domains.lst" ;;
        *:ipv4) echo "$SCRIPT_DIR/lists/profiles/$profile/ipv4.lst" ;;
        *:ipv6) echo "$SCRIPT_DIR/lists/profiles/$profile/ipv6.lst" ;;
    esac
}

profile_url() {
    profile="$1"; kind="$2"
    case "$profile:$kind" in
        full:domains) echo "$DEFAULT_DOMAIN_LIST_URL" ;;
        full:ipv4) echo "$DEFAULT_IPV4_LIST_URL" ;;
        full:ipv6) echo "$DEFAULT_IPV6_LIST_URL" ;;
        *:domains) echo "$DEFAULT_LISTS_BASE_URL/profiles/$profile/domains.lst" ;;
        *:ipv4) echo "$DEFAULT_LISTS_BASE_URL/profiles/$profile/ipv4.lst" ;;
        *:ipv6) echo "$DEFAULT_LISTS_BASE_URL/profiles/$profile/ipv6.lst" ;;
    esac
}

profile_line_count() {
    f="$1"
    [ -f "$f" ] && wc -l < "$f" 2>/dev/null || echo 0
}

profile_size_kb() {
    f="$1"
    [ -f "$f" ] && du -k "$f" 2>/dev/null | awk '{print $1+0}' || echo 0
}

list_available_profiles() {
    echo full
    if [ -d "$SCRIPT_DIR/lists/profiles" ]; then
        for d in "$SCRIPT_DIR"/lists/profiles/*; do
            [ -d "$d" ] || continue
            name=$(basename "$d")
            [ -f "$d/domains.lst" ] || [ -f "$d/ipv4.lst" ] || continue
            echo "$name"
        done
    fi | sort -u | sed '/^full$/d'
}

choose_list_profile() {
    # Update mode must not ask and must not overwrite custom list URLs.
    if [ "$1" = "update" ]; then
        if [ -f /etc/domain-routing-user.conf ]; then
            . /etc/domain-routing-user.conf 2>/dev/null || true
            LIST_PROFILE=${LIST_PROFILE:-custom}
            IPV6_SUPPORT=${IPV6_SUPPORT:-0}
            echo "Keeping configured list profile / Сохраняю выбранный профиль списков: $LIST_PROFILE"
            echo "Domain list: ${DOMAINS_URL:-disabled}"
            echo "IPv4 list: ${IPV4_URL:-disabled}"
            [ "$IPV6_SUPPORT" = "1" ] && echo "IPv6 list: ${IPV6_URL:-disabled}" || echo "IPv6 support: disabled / выключено"
            return 0
        fi
        LIST_PROFILE="full"
        DOMAINS_URL="$DEFAULT_DOMAIN_LIST_URL"
        IPV4_URL="$DEFAULT_IPV4_LIST_URL"
        IPV6_SUPPORT="${DEFAULT_IPV6_SUPPORT:-0}"
        [ "$IPV6_SUPPORT" = "1" ] && IPV6_URL="$DEFAULT_IPV6_LIST_URL" || IPV6_URL=""
        echo "No previous list config found; using full defaults / Старый конфиг списков не найден; использую full"
        return 0
    fi

    router_resource_summary
    echo ""
    msgc "$C_BLUE" "Select route list profile" "Выберите профиль списков маршрутизации"

    : > /tmp/routing-openwrt-profiles
    idx=1
    for profile in $(list_available_profiles); do
        dfile=$(profile_local_file "$profile" domains)
        ifile=$(profile_local_file "$profile" ipv4)
        dlines=$(profile_line_count "$dfile")
        ilines=$(profile_line_count "$ifile")
        dk=$(profile_size_kb "$dfile")
        ik=$(profile_size_kb "$ifile")
        echo "$profile" >> /tmp/routing-openwrt-profiles
        case "$profile" in
            full) label="full / полный" ;;
            lite|white|whitelist) label="lite/white / облегчённый" ;;
            *) label="$profile" ;;
        esac
        printf "%s) %s  domains=%s, ipv4=%s, size≈%sKB\n" "$idx" "$label" "$dlines" "$ilines" "$((dk+ik))"
        idx=$((idx+1))
    done
    echo "c) $(prompt "Custom URLs" "Свои URL списков")"
    echo ""
    msg "$([ "$RAM_TOTAL_MB" -lt 80 ] && echo "Weak router detected: lite/white profile is recommended." || echo "Full profile is OK for normal routers.")" "$([ "$RAM_TOTAL_MB" -lt 80 ] && echo "Слабый роутер: рекомендуется lite/white профиль." || echo "Для обычных роутеров можно full профиль.")"
    msg "Custom lists may be plain domains/CIDR. The script converts them automatically." "Свои списки могут быть обычными доменами/CIDR. Скрипт сам конвертирует их в нужный формат."

    while true; do
        printf "%s" "$(prompt "Choice [1]: " "Выбор [1]: ")"
        read -r LIST_CHOICE
        LIST_CHOICE=${LIST_CHOICE:-1}
        case "$LIST_CHOICE" in
            c|C)
                LIST_PROFILE="custom"
                printf "%s" "$(prompt "Domain list URL (plain domains or dnsmasq/nftset): " "URL списка доменов (обычные домены или dnsmasq/nftset): ")"
                read -r DOMAINS_URL
                printf "%s" "$(prompt "IPv4 CIDR list URL [empty to disable]: " "URL IPv4 CIDR списка [пусто = выключить]: ")"
                read -r IPV4_URL
                IPV6_SUPPORT="0"; IPV6_URL=""
                break
            ;;
            *[!0-9]*|'') msgc "$C_RED" "Wrong choice." "Неверный выбор." ;;
            *)
                LIST_PROFILE=$(sed -n "${LIST_CHOICE}p" /tmp/routing-openwrt-profiles)
                [ -n "$LIST_PROFILE" ] || { msgc "$C_RED" "Wrong choice." "Неверный выбор."; continue; }
                DOMAINS_URL=$(profile_url "$LIST_PROFILE" domains)
                IPV4_URL=$(profile_url "$LIST_PROFILE" ipv4)
                IPV6_SUPPORT="${DEFAULT_IPV6_SUPPORT:-0}"
                if [ "$IPV6_SUPPORT" = "1" ]; then IPV6_URL=$(profile_url "$LIST_PROFILE" ipv6); else IPV6_URL=""; fi
                break
            ;;
        esac
    done

    [ -n "$DOMAINS_URL" ] && echo "Domain list: $DOMAINS_URL" || echo "Domain list: disabled / выключен"
    [ -n "$IPV4_URL" ] && echo "IPv4 list: $IPV4_URL" || echo "IPv4 list: disabled / выключен"
    [ "$IPV6_SUPPORT" = "1" ] && echo "IPv6 list: $IPV6_URL" || echo "IPv6 support: disabled / выключено"
}

read_multiline_config() {
    tmp_file="$1"
    : > "$tmp_file"
    msgc "$C_CYAN" "Paste full WireGuard/AmneziaWG config. End with a single line: END" "Вставьте полный конфиг WireGuard/AmneziaWG. Завершите отдельной строкой: END"
    while IFS= read -r line; do
        [ "$line" = "END" ] && break
        printf '%s
' "$line" >> "$tmp_file"
    done
}

read_multiline_openvpn_config() {
    tmp_file="$1"
    : > "$tmp_file"
    msgc "$C_CYAN" "Paste full OpenVPN .ovpn config. End with a single line: END" "Вставьте полный OpenVPN .ovpn конфиг. Завершите отдельной строкой: END"
    msg "If your .ovpn references external files (ca.crt, client.key, etc.), use inline blocks or add those files manually." "Если .ovpn ссылается на внешние файлы (ca.crt, client.key и т.д.), используйте inline-блоки или добавьте файлы вручную."
    while IFS= read -r line; do
        [ "$line" = "END" ] && break
        printf '%s\n' "$line" >> "$tmp_file"
    done
}

ovpn_detect_dev() {
    cfg="$1"
    dev=$(awk '
        /^[[:space:]]*#/ || /^[[:space:]]*;/ { next }
        tolower($1)=="dev" { print $2; exit }
    ' "$cfg" 2>/dev/null)
    dev=${dev:-tun0}
    [ "$dev" = "tun" ] && dev="tun0"
    echo "$dev"
}

ovpn_detect_gateway() {
    # OpenVPN TUN often needs an explicit next-hop gateway in table vpn.
    # Keep this cheap: no probes, no downloads. Prefer server-pushed /1 route,
    # then connected tun subnet + first host. This handles reconnects where the
    # server moves the client from 10.28.0.x/22 to 10.28.4.x/22, etc.
    dev="$1"
    [ -n "$dev" ] || dev="tun0"

    ip route show 0.0.0.0/1 2>/dev/null | awk -v d="$dev" '$2=="via" && $0 ~ " dev " d "( |$)" {print $3; exit}' | grep -m1 . && return 0
    ip route show 128.0.0.0/1 2>/dev/null | awk -v d="$dev" '$2=="via" && $0 ~ " dev " d "( |$)" {print $3; exit}' | grep -m1 . && return 0
    ip route show default 2>/dev/null | awk -v d="$dev" '$2=="via" && $0 ~ " dev " d "( |$)" {print $3; exit}' | grep -m1 . && return 0

    # Connected route is already normalized by the kernel, for example:
    # 10.28.4.0/22 dev tun0 scope link src 10.28.4.5
    ip -4 route show dev "$dev" scope link 2>/dev/null | awk 'NR==1 {split($1,n,"/"); split(n[1],o,"."); if (o[1] && o[2] && o[3]) {print o[1]"."o[2]"."o[3]"."(o[4]+1); exit}}' | grep -m1 . && return 0

    # Last fallback: same /24-ish subnet, .1.
    ip -4 addr show dev "$dev" 2>/dev/null | awk '/ inet / {split($2,a,"/"); split(a[1],o,"."); if (o[1] && o[2] && o[3]) {print o[1]"."o[2]"."o[3]".1"; exit}}'
}

ovpn_harden_route_only_config() {
    cfg="$1"
    [ -f "$cfg" ] || return 1
    # Keep OpenVPN from installing its own default route. routing-openwrt routes
    # only marked traffic through the separate vpn table.
    sed -i '/# routing-openwrt begin/,/# routing-openwrt end/d' "$cfg" 2>/dev/null || true
    cat >> "$cfg" <<'CFG'

# routing-openwrt begin
# Do not let OpenVPN take the whole router internet.
# routing-openwrt uses fwmark 0x1 + table vpn instead.
route-nopull
pull-filter ignore "redirect-gateway"
pull-filter ignore "redirect-private"
pull-filter ignore "route 0.0.0.0"
pull-filter ignore "route 128.0.0.0"
pull-filter ignore "dhcp-option DNS"
pull-filter ignore "block-outside-dns"
# Stable default: DCO is disabled because some OpenWrt/X-WRT builds reconnect
# endlessly with ovpn-dco. Use: rwrt dco on  (or rwrt dco off)
disable-dco
# routing-openwrt end
CFG
}


install_openvpn_packages() {
    msgc "$C_BLUE" "Checking OpenVPN packages" "Проверка пакетов OpenVPN"

    if pkg_is_installed openvpn-openssl || command -v openvpn >/dev/null 2>&1; then
        msgc "$C_GREEN" "OpenVPN is already installed" "OpenVPN уже установлен"
    else
        msg "Installing openvpn-openssl" "Установка openvpn-openssl"
        pkg_install openvpn-openssl || {
            msgc "$C_RED" "OpenVPN installation failed. Check package repository, DNS and router date/time." "Не удалось установить OpenVPN. Проверьте репозиторий пакетов, DNS и дату/время роутера."
            return 1
        }
    fi

    if pkg_is_installed luci-app-openvpn; then
        msgc "$C_GREEN" "LuCI OpenVPN app is already installed" "LuCI OpenVPN уже установлен"
    else
        msg "Installing optional luci-app-openvpn" "Установка дополнительного luci-app-openvpn"
        pkg_install luci-app-openvpn >/dev/null 2>&1 ||             msgc "$C_YELLOW" "luci-app-openvpn was not installed. This is not critical for CLI/paste mode." "luci-app-openvpn не установлен. Это не критично для режима вставки/CLI."
    fi

    # DCO is optional. Prefer the newer v2 package when it exists in this OpenWrt build;
    # otherwise try the older kmod-ovpn-dco. Do not fail OpenVPN setup if DCO is unavailable.
    if pkg_is_installed kmod-ovpn-dco-v2; then
        msgc "$C_GREEN" "OpenVPN DCO v2 kernel module is already installed" "Модуль OpenVPN DCO v2 уже установлен"
    elif pkg_is_installed kmod-ovpn-dco; then
        msgc "$C_GREEN" "OpenVPN DCO kernel module is already installed" "Модуль OpenVPN DCO уже установлен"
    else
        msg "Installing optional kmod-ovpn-dco-v2" "Установка дополнительного kmod-ovpn-dco-v2"
        if pkg_install kmod-ovpn-dco-v2 >/dev/null 2>&1; then
            msgc "$C_GREEN" "OpenVPN DCO v2 installed" "OpenVPN DCO v2 установлен"
        else
            msgc "$C_YELLOW" "kmod-ovpn-dco-v2 is unavailable; trying kmod-ovpn-dco" "kmod-ovpn-dco-v2 недоступен; пробую kmod-ovpn-dco"
            if pkg_install kmod-ovpn-dco >/dev/null 2>&1; then
                msgc "$C_GREEN" "OpenVPN DCO installed" "OpenVPN DCO установлен"
            else
                msgc "$C_YELLOW" "OpenVPN DCO is unavailable or failed to install. OpenVPN will continue in normal userspace mode." "OpenVPN DCO недоступен или не установился. OpenVPN продолжит работу в обычном userspace-режиме."
            fi
        fi
    fi

    # Optional helper for certificate work/server configs. Skip silently if already present.
    if pkg_is_installed openvpn-easy-rsa; then
        msgc "$C_GREEN" "openvpn-easy-rsa is already installed" "openvpn-easy-rsa уже установлен"
    else
        msg "Installing optional openvpn-easy-rsa" "Установка дополнительного openvpn-easy-rsa"
        pkg_install openvpn-easy-rsa >/dev/null 2>&1 ||             msgc "$C_YELLOW" "openvpn-easy-rsa was not installed. This is not critical for client routing." "openvpn-easy-rsa не установлен. Это не критично для клиентской маршрутизации."
    fi

    return 0
}

ovpn_remove_full_tunnel_routes() {
    dev="$1"
    [ -n "$dev" ] || dev="tun0"
    ip route show 2>/dev/null | grep -E "^(0\.0\.0\.0/1|128\.0\.0\.0/1).* dev ${dev}( |$)" | while IFS= read -r route_line; do
        ip route del $route_line >/dev/null 2>&1 || true
    done
}

ovpn_find_config_for_dev() {
    dev="$1"
    tmp="/tmp/routing-openwrt-openvpn-configs"
    : > "$tmp"

    uci show openvpn 2>/dev/null | sed -n "s/.*\.config='\([^']*\)'.*/\1/p" >> "$tmp"
    ls /etc/openvpn/*.ovpn /etc/openvpn/*.conf 2>/dev/null >> "$tmp"

    cfg_match=""
    sort -u "$tmp" 2>/dev/null | while IFS= read -r cfg; do
        [ -f "$cfg" ] || continue
        awk -v dev="$dev" '
            /^[[:space:]]*#/ || /^[[:space:]]*;/ { next }
            tolower($1)=="dev" && ($2==dev || ($2=="tun" && dev ~ /^tun/)) { found=1 }
            END { exit found ? 0 : 1 }
        ' "$cfg" >/dev/null 2>&1 && { echo "$cfg"; exit 0; }
    done | head -n 1 > "$tmp.match"
    cfg_match=$(cat "$tmp.match" 2>/dev/null)
    if [ -n "$cfg_match" ]; then
        rm -f "$tmp" "$tmp.match"
        echo "$cfg_match"
        return 0
    fi

    # If no exact dev match, use the only available OpenVPN config if there is exactly one.
    count=$(sort -u "$tmp" 2>/dev/null | while IFS= read -r cfg; do [ -f "$cfg" ] && echo "$cfg"; done | wc -l)
    if [ "$count" = "1" ]; then
        sort -u "$tmp" 2>/dev/null | while IFS= read -r cfg; do [ -f "$cfg" ] && echo "$cfg"; done | head -n 1
    fi
    rm -f "$tmp" "$tmp.match"
}

ovpn_prepare_route_only_existing() {
    dev="$1"
    [ -n "$dev" ] || dev="tun0"
    cfg=$(ovpn_find_config_for_dev "$dev")
    if [ -n "$cfg" ] && [ -f "$cfg" ]; then
        msg "Patching OpenVPN config for route-only mode: $cfg" "Исправляю OpenVPN-конфиг для точечной маршрутизации: $cfg"
        ovpn_harden_route_only_config "$cfg"
    else
        msgc "$C_YELLOW" "OpenVPN config file was not detected automatically. Full-tunnel routes will be removed at runtime, but it is better to add route-nopull to the .ovpn config." "OpenVPN-конфиг не определён автоматически. Full-tunnel маршруты будут удалены во время работы, но лучше добавить route-nopull в .ovpn конфиг."
    fi

    # Restart OpenVPN only after config patch. Capture pushed gateway before removing /1 routes.
    /etc/init.d/openvpn enable >/dev/null 2>&1 || true
    /etc/init.d/openvpn restart >/dev/null 2>&1 || true
    sleep 8
    OVPN_ROUTE_GW="$(ovpn_detect_gateway "$dev" | head -n 1)"
    [ -n "$OVPN_ROUTE_GW" ] && msg "OpenVPN route gateway: $OVPN_ROUTE_GW" "Шлюз маршрута OpenVPN: $OVPN_ROUTE_GW"
    ovpn_remove_full_tunnel_routes "$dev"
}


configure_openvpn_from_paste() {
    msgc "$C_GREEN" "Configure OpenVPN from pasted .ovpn" "Настройка OpenVPN из вставленного .ovpn"
    install_openvpn_packages || return 1

    mkdir -p /etc/openvpn
    OVPN_TMP="/tmp/routing-openwrt-client.ovpn"
    OVPN_CFG="/etc/openvpn/routing_openwrt.ovpn"
    read_multiline_openvpn_config "$OVPN_TMP"

    if grep -qi '^[[:space:]]*dev[[:space:]]\+tap' "$OVPN_TMP"; then
        msgc "$C_RED" "TAP configs are not supported. Use a TUN OpenVPN config." "TAP-конфиги не поддерживаются. Используйте OpenVPN TUN-конфиг."
        rm -f "$OVPN_TMP"
        return 1
    fi

    cp "$OVPN_TMP" "$OVPN_CFG"
    rm -f "$OVPN_TMP"
    ovpn_harden_route_only_config "$OVPN_CFG"

    OVPN_ROUTE_DEV=$(ovpn_detect_dev "$OVPN_CFG")
    [ -n "$OVPN_ROUTE_DEV" ] || OVPN_ROUTE_DEV="tun0"

    uci -q delete openvpn.routing_openwrt
    uci set openvpn.routing_openwrt='openvpn'
    uci set openvpn.routing_openwrt.enabled='1'
    uci set openvpn.routing_openwrt.config="$OVPN_CFG"
    uci commit openvpn

    uci -q delete network.ovpn0
    uci -q delete sing-box.main
    uci set network.OpenVPN='interface'
    uci set network.OpenVPN.proto='none'
    uci set network.OpenVPN.device="$OVPN_ROUTE_DEV"
    uci commit network

    /etc/init.d/openvpn enable >/dev/null 2>&1 || true
    /etc/init.d/openvpn restart >/dev/null 2>&1 || true
    sleep 8
    OVPN_ROUTE_GW="$(ovpn_detect_gateway "$OVPN_ROUTE_DEV" | head -n 1)"
    [ -n "$OVPN_ROUTE_GW" ] && msg "OpenVPN route gateway: $OVPN_ROUTE_GW" "Шлюз маршрута OpenVPN: $OVPN_ROUTE_GW"
    ovpn_remove_full_tunnel_routes "$OVPN_ROUTE_DEV"

    msg "OpenVPN config saved to $OVPN_CFG" "OpenVPN-конфиг сохранён в $OVPN_CFG"
    msg "OpenVPN route device: $OVPN_ROUTE_DEV" "Интерфейс маршрутизации OpenVPN: $OVPN_ROUTE_DEV"
    TUNNEL="ovpn"
    route_vpn
    return 0
}

detect_openvpn_candidates() {
    {
        # Real kernel devices: tun0, tun1... Do not list plain "tun".
        ip -o link show 2>/dev/null | awk -F': ' '$2 ~ /^tun[0-9]+$/ { print $2 }'

        # OpenWrt network interfaces bound to tun devices.
        uci show network 2>/dev/null | sed -n "s/^network\.[^.]*\.device='\(tun[0-9][^']*\)'.*/\1/p"

        # OpenVPN configs may contain "dev tun". That is a type, not a device;
        # route through tun0 unless a real tun device is already visible.
        uci show openvpn 2>/dev/null | sed -n "s/.*\.config='\([^']*\)'.*/\1/p" | while read -r _cfg; do
            [ -f "$_cfg" ] || continue
            _dev=$(awk '
                /^[[:space:]]*#/ || /^[[:space:]]*;/ { next }
                tolower($1)=="dev" { print $2; exit }
            ' "$_cfg" 2>/dev/null)
            case "$_dev" in
                tun[0-9]*) echo "$_dev" ;;
                tun|'')
                    if ip -o link show 2>/dev/null | awk -F': ' '$2 ~ /^tun[0-9]+$/ {print $2; exit}' | grep -q .; then
                        ip -o link show 2>/dev/null | awk -F': ' '$2 ~ /^tun[0-9]+$/ {print $2; exit}'
                    else
                        echo "tun0"
                    fi
                ;;
            esac
        done
    } | sed '/^$/d' | sed '/^tun$/d' | sort -u
}

configure_openvpn_existing() {
    msgc "$C_GREEN" "Use an existing OpenVPN tunnel" "Использовать существующий OpenVPN-туннель"
    install_openvpn_packages || return 1
    msg "Create and start OpenVPN in LuCI first. Then return here and choose Check again." "Сначала создайте и запустите OpenVPN в LuCI. Затем вернитесь сюда и выберите Проверить ещё раз."

    while true; do
        OVPN_CANDIDATES="$(detect_openvpn_candidates)"
        if [ -z "$OVPN_CANDIDATES" ]; then
            msgc "$C_RED" "OpenVPN tunnel was not found." "OpenVPN-туннель не найден."
            echo "1) $(prompt "Check again" "Проверить ещё раз")"
            echo "2) $(prompt "Cancel" "Отмена")"
            printf "%s" "$(prompt "Choice [1]: " "Выбор [1]: ")"
            read -r OVPN_WAIT_CHOICE
            OVPN_WAIT_CHOICE=${OVPN_WAIT_CHOICE:-1}
            case "$OVPN_WAIT_CHOICE" in
                1) continue ;;
                2) return 1 ;;
                *) continue ;;
            esac
        fi

        msg "Detected OpenVPN tun devices/configs:" "Найденные OpenVPN tun-интерфейсы/конфиги:"
        i=1
        : > /tmp/routing-openwrt-ovpn-candidates
        echo "$OVPN_CANDIDATES" | while read -r dev; do
            echo "$dev" >> /tmp/routing-openwrt-ovpn-candidates
            echo "$i) $dev"
            i=$((i+1))
        done
        echo "r) $(prompt "Check again" "Проверить ещё раз")"
        echo "m) $(prompt "Enter device manually" "Ввести интерфейс вручную")"
        echo "c) $(prompt "Cancel" "Отмена")"
        printf "%s" "$(prompt "Choice [1]: " "Выбор [1]: ")"
        read -r OVPN_CHOICE
        OVPN_CHOICE=${OVPN_CHOICE:-1}
        case "$OVPN_CHOICE" in
            r|R) continue ;;
            c|C) return 1 ;;
            m|M)
                printf "%s" "$(prompt "Enter OpenVPN tun device [tun0]: " "Введите OpenVPN tun-интерфейс [tun0]: ")"
                read -r OVPN_ROUTE_DEV
                OVPN_ROUTE_DEV=${OVPN_ROUTE_DEV:-tun0}
                ;;
            *[!0-9]*|'')
                msgc "$C_RED" "Wrong choice." "Неверный выбор."
                continue
                ;;
            *)
                OVPN_ROUTE_DEV=$(sed -n "${OVPN_CHOICE}p" /tmp/routing-openwrt-ovpn-candidates)
                [ -n "$OVPN_ROUTE_DEV" ] || { msgc "$C_RED" "Wrong choice." "Неверный выбор."; continue; }
                ;;
        esac

        if ! ip link show "$OVPN_ROUTE_DEV" >/dev/null 2>&1; then
            msgc "$C_YELLOW" "Device is in config but not currently up. Routing will be configured, but OpenVPN must be started." "Интерфейс есть в конфиге, но сейчас не поднят. Маршрутизация будет настроена, но OpenVPN нужно запустить."
        fi

        # Manual OpenVPN mode must not create another duplicate interface (old ovpn0).
        # Create/update only a visible LuCI interface named OpenVPN and attach it to tun0/tun1.
        uci -q delete network.ovpn0
        uci set network.OpenVPN='interface'
        uci set network.OpenVPN.proto='none'
        uci set network.OpenVPN.device="$OVPN_ROUTE_DEV"
        uci commit network >/dev/null 2>&1 || true
        ovpn_prepare_route_only_existing "$OVPN_ROUTE_DEV"
        TUNNEL="ovpn"
        route_vpn
        return 0
    done
}

configure_openvpn_menu() {
    msgc "$C_BLUE" "OpenVPN setup" "Настройка OpenVPN"
    echo "1) $(prompt "Paste full .ovpn config now" "Вставить полный .ovpn конфиг сейчас")"
    echo "2) $(prompt "I already created OpenVPN manually" "Я уже создал OpenVPN вручную")"
    echo "3) $(prompt "Cancel" "Отмена")"
    while true; do
        printf "%s" "$(prompt "Choice [1]: " "Выбор [1]: ")"
        read -r OVPN_MODE
        OVPN_MODE=${OVPN_MODE:-1}
        case "$OVPN_MODE" in
            1) configure_openvpn_from_paste && return 0; return 1 ;;
            2) configure_openvpn_existing && return 0; return 1 ;;
            3) return 1 ;;
            *) msgc "$C_RED" "Choose 1, 2 or 3." "Выберите 1, 2 или 3." ;;
        esac
    done
}

check_singbox_requirements() {
    DISK_TOTAL_MB=$(df -m / 2>/dev/null | awk 'NR==2 {print $2+0}')
    DISK_FREE_MB=$(df -m / 2>/dev/null | awk 'NR==2 {print $4+0}')
    RAM_TOTAL_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)
    [ -n "$DISK_TOTAL_MB" ] || DISK_TOTAL_MB=0
    [ -n "$DISK_FREE_MB" ] || DISK_FREE_MB=0
    [ -n "$RAM_TOTAL_MB" ] || RAM_TOTAL_MB=0

    if is_ru; then
        echo "Ресурсы роутера: flash всего=${DISK_TOTAL_MB}MB, свободно=${DISK_FREE_MB}MB, RAM=${RAM_TOTAL_MB}MB"
    else
        echo "Router resources: flash total=${DISK_TOTAL_MB}MB, free=${DISK_FREE_MB}MB, RAM=${RAM_TOTAL_MB}MB"
    fi

    # The official sing-box-tiny package is about 10 MB compressed and much larger
    # after installation. Keep a safety reserve for package extraction and upgrades.
    if [ "$DISK_TOTAL_MB" -lt 64 ] || [ "$DISK_FREE_MB" -lt 40 ] || [ "$RAM_TOTAL_MB" -lt 128 ]; then
        msgc "$C_RED" \
            "Not enough resources for Sing-box/Outline. Required: 64MB flash, 40MB free flash and 128MB RAM." \
            "Недостаточно памяти для Sing-box/Outline. Требуется: flash от 64MB, свободно от 40MB и RAM от 128MB."
        msgc "$C_YELLOW" \
            "Use WireGuard, AmneziaWG or OpenVPN on a 16MB-flash router." \
            "На роутере с flash 16MB используйте WireGuard, AmneziaWG или OpenVPN."
        return 1
    fi
    return 0
}

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

singbox_shell_quote() {
    # Escape a value so it can be stored inside single quotes in a sourced shell config.
    printf "%s" "$1" | sed "s/'/'\\\\''/g"
}


singbox_parse_vless_url() {
    uri="$1"
    case "$uri" in
        vless://*) ;;
        *) return 1 ;;
    esac

    main="${uri#vless://}"
    main="${main%%\?*}"
    main="${main%%#*}"
    SING_UUID="${main%@*}"
    server_port="${main#*@}"
    SING_SERVER="${server_port%%:*}"
    SING_PORT="${server_port##*:}"

    query="${uri#*\?}"
    [ "$query" = "$uri" ] && query=""
    query="${query%%#*}"

    SING_FLOW=""
    SING_FP="chrome"
    SING_PBK=""
    SING_SECURITY=""
    SING_SID=""
    SING_SNI=""
    SING_SPX=""
    SING_TYPE="tcp"

    OLD_IFS="$IFS"
    IFS='&'
    for pair in $query; do
        key="${pair%%=*}"
        val="${pair#*=}"
        val=$(url_decode_sed "$val")
        case "$key" in
            flow) SING_FLOW="$val" ;;
            fp) SING_FP="$val" ;;
            pbk) SING_PBK="$val" ;;
            security) SING_SECURITY="$val" ;;
            sid) SING_SID="$val" ;;
            sni) SING_SNI="$val" ;;
            spx) SING_SPX="$val" ;;
            type) SING_TYPE="$val" ;;
        esac
    done
    IFS="$OLD_IFS"

    [ -n "$SING_UUID" ] && [ -n "$SING_SERVER" ] && [ -n "$SING_PORT" ] || return 1
    case "$SING_PORT" in *[!0-9]*|'') return 1 ;; esac
    return 0
}

singbox_first_vless_from_subscription() {
    url="$1"
    tmp="/tmp/routing-openwrt-singbox-sub.txt"
    decoded="/tmp/routing-openwrt-singbox-sub.decoded"
    rm -f "$tmp" "$decoded"
    download_url_to_file "$url" "$tmp" || return 1

    tr ' \r' '\n' < "$tmp" | grep '^vless://' | head -n 1 > "$decoded.line"
    if [ -s "$decoded.line" ]; then
        cat "$decoded.line"
        rm -f "$tmp" "$decoded" "$decoded.line"
        return 0
    fi

    if command -v base64 >/dev/null 2>&1; then
        base64 -d "$tmp" > "$decoded" 2>/dev/null || base64 -D "$tmp" > "$decoded" 2>/dev/null || true
    elif command -v openssl >/dev/null 2>&1; then
        openssl base64 -d -in "$tmp" -out "$decoded" 2>/dev/null || true
    fi

    if [ -s "$decoded" ]; then
        tr ' \r' '\n' < "$decoded" | grep '^vless://' | head -n 1
        rm -f "$tmp" "$decoded" "$decoded.line"
        return 0
    fi

    rm -f "$tmp" "$decoded" "$decoded.line"
    return 1
}

singbox_write_vless_config() {
    mkdir -p /etc/sing-box
    cfg="/etc/sing-box/config.json"

    uuid=$(json_escape "$SING_UUID")
    server=$(json_escape "$SING_SERVER")
    flow=$(json_escape "$SING_FLOW")
    sni=$(json_escape "$SING_SNI")
    fp=$(json_escape "${SING_FP:-chrome}")
    pbk=$(json_escape "$SING_PBK")
    sid=$(json_escape "$SING_SID")
    spx=$(json_escape "$SING_SPX")

    cat > "$cfg" <<EOF
{
  "log": {
    "level": "warn"
  },
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "sbtun0",
      "address": ["172.19.0.1/30"],
      "mtu": 9000,
      "auto_route": false,
      "strict_route": false,
      "stack": "system"
    }
  ],
  "outbounds": [
    {
      "type": "vless",
      "tag": "proxy",
      "server": "$server",
      "server_port": $SING_PORT,
      "uuid": "$uuid",
      "flow": "$flow",
      "tls": {
        "enabled": true,
        "server_name": "$sni",
        "utls": {
          "enabled": true,
          "fingerprint": "$fp"
        },
        "reality": {
          "enabled": true,
          "public_key": "$pbk",
          "short_id": "$sid"
        }
      },
      "transport": {
        "type": "tcp"
      }
    },
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "auto_detect_interface": true,
    "final": "proxy"
  }
}
EOF
    chmod 600 "$cfg" 2>/dev/null || true
}

install_singbox_packages() {
    msgc "$C_BLUE" "Checking Sing-box/Outline requirements" "Проверка требований Sing-box/Outline"
    check_singbox_requirements || return 1

    if pkg_is_installed sing-box-tiny || pkg_is_installed sing-box || command -v sing-box >/dev/null 2>&1; then
        msgc "$C_GREEN" "Sing-box engine is already installed" "Движок Sing-box уже установлен"
    else
        msg "Installing sing-box-tiny from the OpenWrt package feed" "Установка sing-box-tiny из репозитория OpenWrt"
        pkg_install sing-box-tiny || pkg_install sing-box || {
            msgc "$C_RED" \
                "Failed to install sing-box. Check the OpenWrt package repository and free flash space." \
                "Не удалось установить sing-box. Проверьте репозиторий OpenWrt и свободное место во flash."
            return 1
        }
    fi

    pkg_is_installed kmod-tun || pkg_install kmod-tun >/dev/null 2>&1 || true
    return 0
}

configure_singbox_service() {
    mkdir -p /etc/config /etc/sing-box

    if ! uci -q get sing-box.main >/dev/null 2>&1; then
        uci set sing-box.main='sing-box'
    fi
    uci set sing-box.main.enabled='1'
    uci set sing-box.main.user='root'
    uci set sing-box.main.conffile='/etc/sing-box/config.json'
    uci set sing-box.main.workdir='/usr/share/sing-box'
    uci commit sing-box 2>/dev/null || true

    if command -v sing-box >/dev/null 2>&1; then
        sing-box check -c /etc/sing-box/config.json >/tmp/routing-openwrt-singbox-check.log 2>&1 || {
            msgc "$C_RED" "sing-box config check failed. See /tmp/routing-openwrt-singbox-check.log" "Проверка sing-box конфига не прошла. Смотрите /tmp/routing-openwrt-singbox-check.log"
            return 1
        }
    fi

    /etc/init.d/sing-box enable >/dev/null 2>&1 || true
    /etc/init.d/sing-box restart >/dev/null 2>&1 || /etc/init.d/sing-box start >/dev/null 2>&1 || {
        msgc "$C_RED" "sing-box service failed to start." "Сервис sing-box не запустился."
        return 1
    }

    i=0
    while [ "$i" -lt 20 ]; do
        ip link show sbtun0 >/dev/null 2>&1 && break
        sleep 1
        i=$((i+1))
    done

    if ! ip link show sbtun0 >/dev/null 2>&1; then
        msgc "$C_RED" "sbtun0 was not created. Sing-box is not ready; ordinary WAN internet is unchanged." "sbtun0 не создан. Sing-box не готов; обычный WAN интернет не изменён."
        return 1
    fi

    SINGBOX_ROUTE_DEV="sbtun0"
    TUNNEL="singbox"
    route_vpn
    return 0
}

configure_singbox_menu() {
    msgc "$C_BLUE" "Sing-box setup" "Настройка Sing-box"
    msgc "$C_YELLOW" "Safe mode: sing-box auto_route is OFF. routing-openwrt will send only marked domains/IPs to sbtun0." "Безопасный режим: auto_route у sing-box выключен. routing-openwrt отправляет в sbtun0 только отмеченные домены/IP."
    echo "1) $(prompt "Paste VLESS Reality link" "Вставить ссылку VLESS Reality")"
    echo "2) $(prompt "Use subscription URL and take first VLESS link" "Использовать ссылку подписки и взять первую VLESS-ссылку")"
    echo "3) $(prompt "Cancel" "Отмена")"
    while true; do
        printf "%s" "$(prompt "Choice [1]: " "Выбор [1]: ")"
        read -r SB_MODE
        SB_MODE=${SB_MODE:-1}
        case "$SB_MODE" in
            1)
                printf "%s" "$(prompt "Paste vless:// link: " "Вставьте vless:// ссылку: ")"
                read -r SB_LINK
                ;;
            2)
                printf "%s" "$(prompt "Paste subscription URL: " "Вставьте ссылку подписки: ")"
                read -r SB_SUB
                SB_LINK=$(singbox_first_vless_from_subscription "$SB_SUB") || SB_LINK=""
                [ -n "$SB_LINK" ] || { msgc "$C_RED" "No VLESS link found in subscription." "В подписке не найдена VLESS-ссылка."; continue; }
                ;;
            3) return 1 ;;
            *) msgc "$C_RED" "Choose 1, 2 or 3." "Выберите 1, 2 или 3."; continue ;;
        esac

        if ! singbox_parse_vless_url "$SB_LINK"; then
            msgc "$C_RED" "Unsupported or invalid link. Currently only vless:// Reality links are supported." "Неподдерживаемая или неверная ссылка. Сейчас поддерживаются только vless:// Reality ссылки."
            continue
        fi

        if [ "$SING_SECURITY" != "reality" ]; then
            msgc "$C_RED" "Only VLESS Reality is supported in this first Sing-box mode." "В первом режиме Sing-box поддерживается только VLESS Reality."
            continue
        fi

        [ -n "$SING_PBK" ] && [ -n "$SING_SNI" ] || {
            msgc "$C_RED" "Reality public key or SNI is missing in the link." "В ссылке нет Reality public key или SNI."
            continue
        }

        install_singbox_packages || return 1
        singbox_write_vless_config
        configure_singbox_service || return 1
        msgc "$C_GREEN" "Sing-box routing is configured via sbtun0." "Маршрутизация Sing-box настроена через sbtun0."
        return 0
    done
}

outline_b64decode() {
    data=$(printf '%s' "$1" | tr '_-' '/+')
    rem=$(( ${#data} % 4 ))
    case "$rem" in
        0) ;;
        2) data="${data}==" ;;
        3) data="${data}=" ;;
        *) return 1 ;;
    esac

    if command -v base64 >/dev/null 2>&1; then
        printf '%s' "$data" | base64 -d 2>/dev/null && return 0
        printf '%s' "$data" | base64 -D 2>/dev/null && return 0
    fi
    if command -v openssl >/dev/null 2>&1; then
        printf '%s' "$data" | openssl base64 -d -A 2>/dev/null && return 0
    fi
    return 1
}

outline_url_decode() {
    # BusyBox-friendly decoder for characters normally found in SIP002 keys.
    printf '%s' "$1" | sed \
        -e 's/%25/%/g' -e 's/%2[Ff]/\//g' \
        -e 's/%3[Aa]/:/g' -e 's/%40/@/g' -e 's/%3[Dd]/=/g' \
        -e 's/%26/\&/g' -e 's/%23/#/g' -e 's/%2[Bb]/+/g' \
        -e 's/%2[Dd]/-/g' -e 's/%5[Ff]/_/g' -e 's/%2[Ee]/./g' \
        -e 's/%20/ /g'
}

outline_parse_key() {
    OUTLINE_KEY="$1"
    case "$OUTLINE_KEY" in
        ss://*) ;;
        ssconf://*|http://*|https://*)
            msgc "$C_RED" \
                "Dynamic Outline keys are not supported in this first version. Paste a static ss:// key." \
                "Динамические ключи Outline пока не поддерживаются. Вставьте статический ключ ss://."
            return 1
        ;;
        *) return 1 ;;
    esac

    raw="${OUTLINE_KEY#ss://}"
    raw="${raw%%#*}"
    query=""
    case "$raw" in
        *\?*) query="${raw#*\?}"; raw="${raw%%\?*}" ;;
    esac
    raw="${raw%/}"

    case "&$query&" in
        *'&prefix='*|*'&plugin='*|*'&transport='*)
            msgc "$C_RED" \
                "This Outline key uses prefix/plugin/transport extensions that the OpenWrt client mode does not support yet." \
                "Этот ключ Outline использует prefix/plugin/transport, которые пока не поддерживаются режимом OpenWrt."
            return 1
        ;;
    esac

    credentials_urlencoded=0
    case "$raw" in
        *@*)
            userinfo="${raw%@*}"
            endpoint="${raw##*@}"
            case "$userinfo" in
                *:*) credentials="$userinfo"; credentials_urlencoded=1 ;;
                *) credentials=$(outline_b64decode "$userinfo") || return 1 ;;
            esac
        ;;
        *)
            decoded=$(outline_b64decode "$raw") || return 1
            case "$decoded" in *@*) ;; *) return 1 ;; esac
            credentials="${decoded%@*}"
            endpoint="${decoded##*@}"
        ;;
    esac

    case "$credentials" in *:*) ;; *) return 1 ;; esac
    OUTLINE_METHOD="${credentials%%:*}"
    OUTLINE_PASSWORD="${credentials#*:}"
    if [ "$credentials_urlencoded" = "1" ]; then
        OUTLINE_METHOD=$(outline_url_decode "$OUTLINE_METHOD")
        OUTLINE_PASSWORD=$(outline_url_decode "$OUTLINE_PASSWORD")
    fi

    endpoint=$(outline_url_decode "$endpoint")
    case "$endpoint" in
        \[*\]:*)
            OUTLINE_SERVER="${endpoint#\[}"
            OUTLINE_SERVER="${OUTLINE_SERVER%%\]*}"
            OUTLINE_PORT="${endpoint##*:}"
        ;;
        *:*)
            OUTLINE_SERVER="${endpoint%:*}"
            OUTLINE_PORT="${endpoint##*:}"
        ;;
        *) return 1 ;;
    esac

    [ -n "$OUTLINE_METHOD" ] && [ -n "$OUTLINE_PASSWORD" ] && [ -n "$OUTLINE_SERVER" ] || return 1
    case "$OUTLINE_PORT" in *[!0-9]*|'') return 1 ;; esac
    [ "$OUTLINE_PORT" -ge 1 ] 2>/dev/null && [ "$OUTLINE_PORT" -le 65535 ] 2>/dev/null || return 1
    return 0
}

outline_save_source() {
    mkdir -p /etc/routewolf
    qkey=$(singbox_shell_quote "$OUTLINE_KEY")
    cat > /etc/routewolf/outline.conf <<EOF
OUTLINE_ACCESS_KEY='$qkey'
OUTLINE_ROUTE_MODE='routewolf-safe'
OUTLINE_TUN_DEVICE='outline0'
EOF
    chmod 600 /etc/routewolf/outline.conf 2>/dev/null || true
}

outline_write_config() {
    mkdir -p /etc/sing-box
    cfg='/etc/sing-box/config.json'
    if [ -f "$cfg" ]; then
        cp "$cfg" "/etc/sing-box/config.json.routewolf-backup" 2>/dev/null || true
    fi

    method=$(json_escape "$OUTLINE_METHOD")
    password=$(json_escape "$OUTLINE_PASSWORD")
    server=$(json_escape "$OUTLINE_SERVER")

    cat > "$cfg" <<EOF
{
  "log": {
    "level": "warn"
  },
  "inbounds": [
    {
      "type": "tun",
      "tag": "outline-tun",
      "interface_name": "outline0",
      "address": ["172.20.0.1/30"],
      "mtu": 1500,
      "auto_route": false,
      "strict_route": false,
      "stack": "system"
    }
  ],
  "outbounds": [
    {
      "type": "shadowsocks",
      "tag": "outline-proxy",
      "server": "$server",
      "server_port": $OUTLINE_PORT,
      "method": "$method",
      "password": "$password"
    },
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "auto_detect_interface": true,
    "final": "outline-proxy"
  }
}
EOF
    chmod 600 "$cfg" 2>/dev/null || true
}

configure_outline_service() {
    mkdir -p /etc/config /etc/sing-box

    if ! uci -q get sing-box.main >/dev/null 2>&1; then
        uci set sing-box.main='sing-box'
    fi
    uci set sing-box.main.enabled='1'
    uci set sing-box.main.user='root'
    uci set sing-box.main.conffile='/etc/sing-box/config.json'
    uci set sing-box.main.workdir='/usr/share/sing-box'
    uci commit sing-box 2>/dev/null || true

    sing-box check -c /etc/sing-box/config.json >/tmp/routewolf-outline-check.log 2>&1 || {
        msgc "$C_RED" \
            "Outline configuration check failed. See /tmp/routewolf-outline-check.log" \
            "Проверка конфигурации Outline не прошла. Смотрите /tmp/routewolf-outline-check.log"
        tail -n 20 /tmp/routewolf-outline-check.log 2>/dev/null || true
        return 1
    }

    /etc/init.d/sing-box enable >/dev/null 2>&1 || true
    /etc/init.d/sing-box restart >/dev/null 2>&1 || /etc/init.d/sing-box start >/dev/null 2>&1 || {
        msgc "$C_RED" "Outline client service failed to start." "Клиент Outline не запустился."
        return 1
    }

    i=0
    while [ "$i" -lt 25 ]; do
        ip link show outline0 >/dev/null 2>&1 && break
        sleep 1
        i=$((i+1))
    done
    if ! ip link show outline0 >/dev/null 2>&1; then
        msgc "$C_RED" \
            "outline0 was not created. The ordinary WAN internet was left unchanged." \
            "Интерфейс outline0 не создан. Обычный интернет через WAN оставлен без изменений."
        return 1
    fi

    OUTLINE_ROUTE_DEV='outline0'
    TUNNEL='outline'
    route_vpn
    return 0
}

configure_outline_menu() {
    ui_header "$(prompt "Outline setup" "Настройка Outline")"
    msgc "$C_YELLOW" \
        "Initial test mode: static ss:// keys only. RouteWolf uses the OpenWrt sing-box package as a Shadowsocks client engine." \
        "Начальный тестовый режим: только статические ключи ss://. RouteWolf использует пакет sing-box из OpenWrt как клиент Shadowsocks."
    msgc "$C_GREEN" \
        "Safe routing: auto_route is disabled; only domains/IPs selected by RouteWolf use Outline." \
        "Безопасная маршрутизация: auto_route отключён; через Outline идут только выбранные RouteWolf домены/IP."

    while true; do
        printf "%s" "$(prompt "Paste Outline ss:// access key (or c to cancel): " "Вставьте ключ Outline ss:// (или c для отмены): ")"
        read -r OUTLINE_KEY
        case "$OUTLINE_KEY" in c|C|cancel|отмена) return 1 ;; esac
        if ! outline_parse_key "$OUTLINE_KEY"; then
            msgc "$C_RED" \
                "Could not parse this Outline key. Use an ordinary static ss:// key from Outline Manager." \
                "Не удалось разобрать ключ Outline. Используйте обычный статический ключ ss:// из Outline Manager."
            continue
        fi

        install_singbox_packages || return 1
        outline_write_config
        outline_save_source
        configure_outline_service || return 1
        msgc "$C_GREEN" "Outline routing is configured through outline0." "Маршрутизация Outline настроена через outline0."
        return 0
    done
}

cfg_get_section_value() {
    section="$1"; key="$2"; file="$3"
    awk -v section="$section" -v key="$key" '
        /^[[:space:]]*\[/ { in_section=(index($0, "[" section "]") > 0); next }
        in_section {
            line=$0
            sub(/[[:space:]]*[#;].*/, "", line)
            split(line, a, "=")
            k=a[1]; v=substr(line, index(line, "=")+1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
            if (tolower(k)==tolower(key)) { print v; exit }
        }' "$file"
}

cfg_get_endpoint_host() { echo "$1" | sed 's#^\[##; s#\]##; s#:[0-9][0-9]*$##'; }
cfg_get_endpoint_port() { echo "$1" | sed -n 's#.*:\([0-9][0-9]*\)$#\1#p'; }

parse_awg_config_file() {
    cfg="$1"
    AWG_PRIVATE_KEY=$(cfg_get_section_value Interface PrivateKey "$cfg")
    AWG_IP=$(cfg_get_section_value Interface Address "$cfg")
    AWG_DNS=$(cfg_get_section_value Interface DNS "$cfg")
    AWG_JC=$(cfg_get_section_value Interface Jc "$cfg")
    AWG_JMIN=$(cfg_get_section_value Interface Jmin "$cfg")
    AWG_JMAX=$(cfg_get_section_value Interface Jmax "$cfg")
    AWG_S1=$(cfg_get_section_value Interface S1 "$cfg")
    AWG_S2=$(cfg_get_section_value Interface S2 "$cfg")
    AWG_H1=$(cfg_get_section_value Interface H1 "$cfg")
    AWG_H2=$(cfg_get_section_value Interface H2 "$cfg")
    AWG_H3=$(cfg_get_section_value Interface H3 "$cfg")
    AWG_H4=$(cfg_get_section_value Interface H4 "$cfg")
    AWG_S3=$(cfg_get_section_value Interface S3 "$cfg")
    AWG_S4=$(cfg_get_section_value Interface S4 "$cfg")
    AWG_I1=$(cfg_get_section_value Interface I1 "$cfg")
    AWG_I2=$(cfg_get_section_value Interface I2 "$cfg")
    AWG_I3=$(cfg_get_section_value Interface I3 "$cfg")
    AWG_I4=$(cfg_get_section_value Interface I4 "$cfg")
    AWG_I5=$(cfg_get_section_value Interface I5 "$cfg")
    AWG_PUBLIC_KEY=$(cfg_get_section_value Peer PublicKey "$cfg")
    AWG_PRESHARED_KEY=$(cfg_get_section_value Peer PresharedKey "$cfg")
    AWG_ALLOWED_IPS=$(cfg_get_section_value Peer AllowedIPs "$cfg")
    AWG_KEEPALIVE=$(cfg_get_section_value Peer PersistentKeepalive "$cfg")
    endpoint_full=$(cfg_get_section_value Peer Endpoint "$cfg")
    AWG_ENDPOINT=$(cfg_get_endpoint_host "$endpoint_full")
    AWG_ENDPOINT_PORT=$(cfg_get_endpoint_port "$endpoint_full")
    AWG_ENDPOINT_PORT=${AWG_ENDPOINT_PORT:-51820}
}


ask_yes_no_global() {
    prompt="$1"
    default_answer="$2"
    while true; do
        read -r -p "$prompt (y/n) [$default_answer]: " answer
        answer=${answer:-$default_answer}
        is_back "$answer" && return 2
        case "$answer" in
            y|Y|yes|YES|Yes|д|Д|да|ДА|Да) return 0 ;;
            n|N|no|NO|No|н|Н|нет|НЕТ|Нет) return 1 ;;
            *) echo "Please enter y or n / Введите y или n" ;;
        esac
    done
}

delete_uci_sections_by_name() {
    config="$1"
    type="$2"
    name="$3"
    while true; do
        idx=$(uci show "$config" 2>/dev/null | sed -n "s/^${config}\.@${type}\[\([0-9]*\)\]\.name='${name}'.*/\1/p" | head -n 1)
        [ -z "$idx" ] && break
        uci -q delete "${config}.@${type}[$idx]"
    done
}

delete_uci_sections_by_type() {
    config="$1"
    type="$2"
    while uci -q delete "${config}.@${type}[0]" 2>/dev/null; do :; done
}

detect_existing_routing_config() {
    EXISTING_TUNNEL=""
    EXISTING_IFACE=""

    if [ "$(uci -q get network.awg0.proto 2>/dev/null)" = "amneziawg" ]; then
        EXISTING_TUNNEL="awg"
        EXISTING_IFACE="awg0"
    elif [ "$(uci -q get network.wg0.proto 2>/dev/null)" = "wireguard" ]; then
        EXISTING_TUNNEL="wg"
        EXISTING_IFACE="wg0"
    elif [ -n "$(uci -q get openvpn.routing_openwrt.config 2>/dev/null)" ]; then
        EXISTING_TUNNEL="ovpn"
        EXISTING_IFACE="${OVPN_ROUTE_DEV:-tun0}"
    elif uci show network 2>/dev/null | grep -q '^network\.@amneziawg_awg0\['; then
        # Orphaned peer section without network.awg0 interface: previous broken cleanup/install.
        EXISTING_TUNNEL="0"
        EXISTING_IFACE="orphaned-awg0-peer"
    elif uci show network 2>/dev/null | grep -q '^network\.@wireguard_wg0\['; then
        EXISTING_TUNNEL="0"
        EXISTING_IFACE="orphaned-wg0-peer"
    elif [ -f /etc/domain-routing-route.conf ]; then
        old_route_dev=$(grep -m1 "^VPN_ROUTE_DEV=" /etc/domain-routing-route.conf 2>/dev/null | cut -d= -f2 | tr -d "'")
        old_route_dev=$(echo "$old_route_dev" | tr -d '"')
        case "$old_route_dev" in
            awg0) EXISTING_TUNNEL="awg"; EXISTING_IFACE="awg0" ;;
            wg0) EXISTING_TUNNEL="wg"; EXISTING_IFACE="wg0" ;;
            sbtun0) EXISTING_TUNNEL="singbox"; EXISTING_IFACE="sbtun0" ;;
            outline0) EXISTING_TUNNEL="outline"; EXISTING_IFACE="outline0" ;;
            tun*) EXISTING_TUNNEL="ovpn"; EXISTING_IFACE="$old_route_dev" ;;
        esac
    fi

    if [ -n "$EXISTING_TUNNEL" ]; then
        return 0
    fi

    if [ "$(uci -q get network.vpn_route.table 2>/dev/null)" = "vpn" ] ||        uci show network 2>/dev/null | grep -q "mark0x1" ||        uci show firewall 2>/dev/null | grep -q "name='mark_domains'" ||        [ -f /etc/domain-routing-user.conf ]; then
        EXISTING_TUNNEL="0"
        EXISTING_IFACE="unknown"
        return 0
    fi

    return 1
}

cleanup_existing_routing_config() {
    msgc "$C_YELLOW" "Removing old project tunnel/routing config..." "Удаляю старый конфиг туннеля/маршрутизации проекта..."

    # Stop the old monitor first so it cannot restart a tunnel while it is being replaced.
    /etc/init.d/routewolf-watchdog stop >/dev/null 2>&1 || true
    /etc/init.d/routewolf-watchdog disable >/dev/null 2>&1 || true
    /etc/init.d/routewolf-awg-watchdog stop >/dev/null 2>&1 || true
    /etc/init.d/routewolf-awg-watchdog disable >/dev/null 2>&1 || true
    sed -i '/routewolf-watchdog/d;/routewolf-awg-watchdog/d' /etc/crontabs/root 2>/dev/null || true
    rm -f /etc/init.d/routewolf-watchdog /etc/init.d/routewolf-awg-watchdog
    rm -f /usr/sbin/routewolf-watchdog.sh /usr/sbin/routewolf-awg-watchdog.sh
    rm -f /etc/routewolf/watchdog.conf

    uci -q delete network.wg0
    uci -q delete network.awg0
    uci -q delete network.ovpn0
    /etc/init.d/sing-box stop >/dev/null 2>&1 || true
    uci -q delete sing-box.main
    rm -f /etc/sing-box/config.json
    uci commit sing-box >/dev/null 2>&1 || true
    uci -q delete network.vpn_route
    delete_uci_sections_by_type network wireguard_wg0
    delete_uci_sections_by_type network amneziawg_awg0
    delete_uci_sections_by_name network rule mark0x1
    uci -q delete network.mark0x1
    uci -q delete network.routewolf_mark
    uci -q delete network.routewolf_internal_mark
    uci commit network 2>/dev/null || true

    delete_uci_sections_by_name firewall zone wg
    delete_uci_sections_by_name firewall zone awg
    delete_uci_sections_by_name firewall zone ovpn
    delete_uci_sections_by_name firewall zone singbox
    delete_uci_sections_by_name firewall zone outline
    delete_uci_sections_by_name firewall forwarding wg-lan
    delete_uci_sections_by_name firewall forwarding awg-lan
    delete_uci_sections_by_name firewall forwarding ovpn-lan
    delete_uci_sections_by_name firewall forwarding singbox-lan
    delete_uci_sections_by_name firewall forwarding outline-lan
    uci -q delete openvpn.routing_openwrt
    uci commit openvpn 2>/dev/null || true
    uci commit firewall 2>/dev/null || true

    rm -f /etc/domain-routing-route.conf
    rm -f /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute
    /etc/init.d/vpnroute disable >/dev/null 2>&1 || true
    rm -f /etc/init.d/vpnroute /usr/sbin/domain-routing-route.sh
}

handle_existing_routing_config() {
    detect_existing_routing_config || return 1

    msgc "$C_YELLOW" "Existing routing configuration detected." "Найден существующий конфиг маршрутизации."
    if [ -n "$EXISTING_IFACE" ]; then
        msg "Detected interface: $EXISTING_IFACE" "Найден интерфейс: $EXISTING_IFACE"
    fi
    echo "1) $(prompt "Skip tunnel setup and use existing config" "Пропустить настройку туннеля и использовать существующий") [$(prompt "default" "по умолчанию")]"
    echo "2) $(prompt "Replace old config and create a new one" "Заменить старый конфиг и настроить новый")"
    echo "3) $(prompt "Run diagnostics" "Запустить диагностику")"

    while true; do
        printf "%s" "$(prompt "Select [1]: " "Выберите [1]: ")"
        read -r existing_choice
        existing_choice=${existing_choice:-1}
        case "$existing_choice" in
            1)
                TUNNEL="$EXISTING_TUNNEL"
                [ -z "$TUNNEL" ] && TUNNEL=0
                if [ "$TUNNEL" != "0" ]; then
                    route_vpn
                    install_routewolf_watchdog
                fi
                msgc "$C_GREEN" "Tunnel setup skipped" "Настройка туннеля пропущена"
                return 0
                ;;
            2)
                cleanup_existing_routing_config
                return 1
                ;;
            3)
                run_diagnostics_now
                ;;
            *) msgc "$C_RED" "Choose 1, 2 or 3" "Выберите 1, 2 или 3" ;;
        esac
    done
}



# OpenWrt 24.10 and older use opkg; OpenWrt 25.12 and newer use apk.
# Keep all package operations behind these helpers.
detect_pkg_manager() {
    if command -v apk >/dev/null 2>&1; then
        PKG_MANAGER="apk"
    elif command -v opkg >/dev/null 2>&1; then
        PKG_MANAGER="opkg"
    else
        echo "Error: neither apk nor opkg was found on this OpenWrt system."
        exit 1
    fi
}


APK_FETCH_READY=0
APK_SAFE_PATH=""
APK_FETCH_MODE=""

apk_first_repo_url() {
    for _repo_file in /etc/apk/repositories.d/distfeeds.list /etc/apk/repositories; do
        [ -f "$_repo_file" ] || continue
        awk 'BEGIN { FS="[[:space:]]+" } /^[[:space:]]*#/ { next } { for (i=1; i<=NF; i++) if ($i ~ /^https?:\/\//) { print $i; exit } }' "$_repo_file"
        return 0
    done
    return 1
}

apk_fetch_test() {
    _fetcher="$1"
    _url="$2"
    _tmp="/tmp/routewolf-apk-fetch-test.$$"
    rm -f "$_tmp"
    case "$_fetcher" in
        native)
            wget -q -T 30 -O "$_tmp" "$_url" >/dev/null 2>&1
            ;;
        uclient)
            /bin/uclient-fetch -q -T 30 -O "$_tmp" "$_url" >/dev/null 2>&1
            ;;
        curl)
            curl -fsSL --connect-timeout 15 --max-time 45 -o "$_tmp" "$_url" >/dev/null 2>&1
            ;;
        *) return 1 ;;
    esac
    _rc=$?
    [ "$_rc" -eq 0 ] && [ -s "$_tmp" ]
    _rc=$?
    rm -f "$_tmp"
    return "$_rc"
}

create_curl_wget_wrapper() {
    mkdir -p /tmp/routewolf-apk-bin || return 1
    cat > /tmp/routewolf-apk-bin/wget <<'ROUTEWOLF_WGET_EOF'
#!/bin/sh
out="-"
timeout="60"
insecure="0"
url=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        -O) shift; out="$1" ;;
        -T) shift; timeout="$1" ;;
        -q|--quiet) ;;
        --no-check-certificate) insecure="1" ;;
        --timeout=*) timeout="${1#*=}" ;;
        --) shift; url="$1"; break ;;
        -*) ;;
        *) url="$1" ;;
    esac
    shift
done
[ -n "$url" ] || exit 2
set -- -fL --connect-timeout "$timeout" --max-time "$timeout"
[ "$insecure" = "1" ] && set -- "$@" -k
if [ "$out" = "-" ]; then
    exec curl "$@" "$url"
else
    exec curl "$@" -o "$out" "$url"
fi
ROUTEWOLF_WGET_EOF
    chmod 755 /tmp/routewolf-apk-bin/wget
}

prepare_apk_fetcher() {
    [ "$APK_FETCH_READY" = "1" ] && return 0

    APK_SAFE_PATH="$PATH"
    _repo_url="$(apk_first_repo_url 2>/dev/null)"
    if [ -z "$_repo_url" ]; then
        APK_FETCH_READY=1
        APK_FETCH_MODE="native"
        return 0
    fi

    if apk_fetch_test native "$_repo_url"; then
        APK_FETCH_READY=1
        APK_FETCH_MODE="native"
        return 0
    fi

    if [ -x /bin/uclient-fetch ] && apk_fetch_test uclient "$_repo_url"; then
        mkdir -p /tmp/routewolf-apk-bin || return 1
        ln -sf /bin/uclient-fetch /tmp/routewolf-apk-bin/wget || return 1
        APK_SAFE_PATH="/tmp/routewolf-apk-bin:$PATH"
        APK_FETCH_READY=1
        APK_FETCH_MODE="uclient-fetch"
        msgc "$C_YELLOW" \
            "The system wget cannot download OpenWrt HTTPS feeds. RouteWolf will use uclient-fetch without changing system files." \
            "Системный wget не может скачать HTTPS-репозитории OpenWrt. RouteWolf временно использует uclient-fetch, не изменяя системные файлы."
        return 0
    fi

    if command -v curl >/dev/null 2>&1 && apk_fetch_test curl "$_repo_url"; then
        create_curl_wget_wrapper || return 1
        APK_SAFE_PATH="/tmp/routewolf-apk-bin:$PATH"
        APK_FETCH_READY=1
        APK_FETCH_MODE="curl"
        msgc "$C_YELLOW" \
            "The system wget is broken. RouteWolf will use a temporary curl-based APK downloader." \
            "Системный wget неисправен. RouteWolf временно использует загрузчик APK на основе curl."
        return 0
    fi

    msgc "$C_RED" \
        "Cannot download an OpenWrt package index over HTTPS with wget, uclient-fetch or curl." \
        "Не удалось скачать индекс пакетов OpenWrt по HTTPS через wget, uclient-fetch или curl."
    msgc "$C_RED" \
        "Check WAN, DNS, date/time and whether wget-nossl shadows /bin/uclient-fetch." \
        "Проверьте WAN, DNS, дату/время и не перекрывает ли wget-nossl системный /bin/uclient-fetch."
    return 1
}

apk_run() {
    prepare_apk_fetcher || return 1
    env PATH="$APK_SAFE_PATH" apk "$@"
}

pkg_update() {
    detect_pkg_manager
    case "$PKG_MANAGER" in
        apk) apk_run update ;;
        opkg) opkg update ;;
    esac
}

pkg_install() {
    detect_pkg_manager
    case "$PKG_MANAGER" in
        apk) apk_run add "$@" ;;
        opkg) opkg install "$@" ;;
    esac
}

pkg_remove() {
    detect_pkg_manager
    case "$PKG_MANAGER" in
        apk) apk_run del "$@" ;;
        opkg) opkg remove "$@" ;;
    esac
}

pkg_is_installed() {
    detect_pkg_manager
    pkg="$1"
    case "$PKG_MANAGER" in
        apk) apk info -e "$pkg" >/dev/null 2>&1 ;;
        opkg) opkg list-installed | grep -q "^$pkg " ;;
    esac
}


routewolf_overlay_path() {
    if [ -d /overlay ]; then printf '%s\n' /overlay; else printf '%s\n' /; fi
}

routewolf_free_kb() {
    _rw_mnt="$(routewolf_overlay_path)"
    df -Pk "$_rw_mnt" 2>/dev/null | awk 'NR==2 {print $4+0}'
}

routewolf_total_kb() {
    _rw_mnt="$(routewolf_overlay_path)"
    df -Pk "$_rw_mnt" 2>/dev/null | awk 'NR==2 {print $2+0}'
}

routewolf_tmp_free_kb() {
    df -Pk /tmp 2>/dev/null | awk 'NR==2 {print $4+0}'
}

routewolf_apk_world_has() {
    _rw_pkg="$1"
    [ -f /etc/apk/world ] || return 1
    grep -Eq "^${_rw_pkg}([<>=~].*)?$" /etc/apk/world 2>/dev/null
}

routewolf_apk_world_remove() {
    _rw_pkg="$1"
    [ -f /etc/apk/world ] || return 0
    _rw_tmp="/tmp/routewolf-world.$$"
    cp /etc/apk/world "/tmp/routewolf-world.backup.$$" 2>/dev/null || true
    grep -Ev "^${_rw_pkg}([<>=~].*)?$" /etc/apk/world > "$_rw_tmp" 2>/dev/null || : > "$_rw_tmp"
    cat "$_rw_tmp" > /etc/apk/world || { rm -f "$_rw_tmp"; return 1; }
    rm -f "$_rw_tmp"
}

routewolf_clean_download_cache() {
    rm -rf /tmp/amneziawg /tmp/routewolf-awg-bin /tmp/routewolf-awg-customfeeds.list.* \
        /tmp/awg-openwrt-feed.pem /tmp/awg-openwrt-packages.adb \
        /tmp/routewolf-install.tar.gz /tmp/routewolf.zip 2>/dev/null || true
    rm -f /tmp/amneziawg-install.sh /tmp/routewolf-awg-install.log 2>/dev/null || true
    if [ "${PKG_MANAGER:-}" = "apk" ] || command -v apk >/dev/null 2>&1; then
        apk cache clean >/dev/null 2>&1 || true
    fi
}

routewolf_safe_cleanup() {
    detect_pkg_manager
    routewolf_clean_download_cache

    if [ "$PKG_MANAGER" = "apk" ]; then
        # Older RouteWolf builds added nano as a base component. If its install
        # failed, nano can remain in /etc/apk/world and every later `apk add`
        # tries to install it again, filling a small overlay.
        if routewolf_apk_world_has nano || pkg_is_installed nano; then
            msgc "$C_YELLOW" \
                "Removing legacy nano request left by an older RouteWolf installation..." \
                "Удаление старого запроса nano, оставленного предыдущей версией RouteWolf..."
            if ! apk del nano >/tmp/routewolf-cleanup.log 2>&1; then
                routewolf_apk_world_remove nano || return 1
            fi
        fi

        # Remove an unregistered file left by an interrupted extraction only.
        if [ -e /usr/bin/nano ] && ! pkg_is_installed nano; then
            rm -f /usr/bin/nano 2>/dev/null || true
        fi
        apk cache clean >/dev/null 2>&1 || true
    fi

    sync 2>/dev/null || true
    return 0
}

prepare_install_storage() {
    [ "${ROUTEWOLF_STORAGE_READY:-0}" = "1" ] && return 0
    detect_pkg_manager
    routewolf_clean_download_cache
    _rw_free="$(routewolf_free_kb)"
    _rw_total="$(routewolf_total_kb)"
    _rw_tmp="$(routewolf_tmp_free_kb)"
    [ -n "$_rw_free" ] || _rw_free=0
    [ -n "$_rw_total" ] || _rw_total=0
    [ -n "$_rw_tmp" ] || _rw_tmp=0

    _rw_need_offer=0
    [ "$_rw_free" -lt 3072 ] 2>/dev/null && _rw_need_offer=1
    if [ "$PKG_MANAGER" = "apk" ] && routewolf_apk_world_has nano; then
        _rw_need_offer=1
    fi

    if [ "$_rw_need_offer" = "1" ]; then
        ui_header "$(prompt "Storage preparation" "Подготовка памяти")"
        msg "Overlay free: $((_rw_free/1024)) MB; /tmp free: $((_rw_tmp/1024)) MB" \
            "Свободно в overlay: $((_rw_free/1024)) МБ; свободно в /tmp: $((_rw_tmp/1024)) МБ"
        msg "Old or interrupted package files may cause the next installation to fill the flash." \
            "Старые или прерванные установки пакетов могут снова заполнить flash-память."
        echo "1) $(prompt "Safely clean RouteWolf/package leftovers [default]" "Безопасно очистить остатки RouteWolf/пакетов [по умолчанию]")"
        echo "2) $(prompt "Continue without cleanup" "Продолжить без очистки")"
        echo "3) $(prompt "Exit" "Выйти")"
        ask_same_line "Choice [1]: " "Выбор [1]: " _rw_choice
        _rw_choice=${_rw_choice:-1}
        case "$_rw_choice" in
            1) routewolf_safe_cleanup || return 1 ;;
            2) : ;;
            *) return 1 ;;
        esac
    fi

    _rw_free="$(routewolf_free_kb)"
    [ -n "$_rw_free" ] || _rw_free=0
    if [ "$_rw_free" -lt 1536 ] 2>/dev/null; then
        msgc "$C_RED" \
            "Less than 1.5 MB remains in overlay. Installation is stopped before changing the system." \
            "В overlay осталось меньше 1,5 МБ. Установка остановлена до изменения системы."
        msg "Use: rw cleanup, remove unused packages, or reinstall a clean OpenWrt image." \
            "Используйте: rw cleanup, удалите ненужные пакеты или переустановите чистый образ OpenWrt."
        return 1
    fi

    msgc "$C_GREEN" \
        "Storage is ready: $((_rw_free/1024)) MB free in overlay." \
        "Память подготовлена: в overlay свободно $((_rw_free/1024)) МБ."
    ROUTEWOLF_STORAGE_READY=1
    export ROUTEWOLF_STORAGE_READY
    return 0
}

check_repo() {
    prepare_install_storage || return 1
    printf "\033[32;1mChecking OpenWrt package repository...\033[0m\n"
    if ! pkg_update; then
        printf "\033[31;1mPackage repository update failed. Installation stopped.\033[0m\n"
        printf "\033[33;1mOn OpenWrt 25.12 verify that wget-nossl does not shadow /bin/uclient-fetch.\033[0m\n"
        return 1
    fi
    return 0
}

install_routewolf_watchdog() {
    [ "${TUNNEL:-0}" != "0" ] || return 0

    WATCHDOG_TYPE="$TUNNEL"
    WATCHDOG_DEVICE="${VPN_ROUTE_DEV:-}"
    WATCHDOG_UCI_IFACE=""
    WATCHDOG_SERVICE=""

    case "$TUNNEL" in
        wg)
            WATCHDOG_DEVICE='wg0'
            WATCHDOG_UCI_IFACE='wg0'
            WATCHDOG_SERVICE='network'
            uci set network.wg0.auto='1' 2>/dev/null || true
            uci commit network >/dev/null 2>&1 || true
        ;;
        awg)
            WATCHDOG_DEVICE='awg0'
            WATCHDOG_UCI_IFACE='awg0'
            WATCHDOG_SERVICE='network'
            uci set network.awg0.auto='1' 2>/dev/null || true
            uci commit network >/dev/null 2>&1 || true
        ;;
        ovpn)
            WATCHDOG_DEVICE="${OVPN_ROUTE_DEV:-${VPN_ROUTE_DEV:-tun0}}"
            WATCHDOG_UCI_IFACE='OpenVPN'
            WATCHDOG_SERVICE='openvpn'
            /etc/init.d/openvpn enable >/dev/null 2>&1 || true
        ;;
        singbox)
            WATCHDOG_DEVICE="${SINGBOX_ROUTE_DEV:-sbtun0}"
            WATCHDOG_SERVICE='sing-box'
            /etc/init.d/sing-box enable >/dev/null 2>&1 || true
        ;;
        outline)
            WATCHDOG_DEVICE="${OUTLINE_ROUTE_DEV:-outline0}"
            WATCHDOG_SERVICE='sing-box'
            /etc/init.d/sing-box enable >/dev/null 2>&1 || true
        ;;
        *) return 0 ;;
    esac

    mkdir -p /etc/routewolf
    cat > /etc/routewolf/watchdog.conf <<EOF
WATCHDOG_TYPE='$WATCHDOG_TYPE'
WATCHDOG_DEVICE='$WATCHDOG_DEVICE'
WATCHDOG_UCI_IFACE='$WATCHDOG_UCI_IFACE'
WATCHDOG_SERVICE='$WATCHDOG_SERVICE'
WATCHDOG_URL='https://www.youtube.com/generate_204'
WATCHDOG_INTERVAL_MIN='30'
EOF
    chmod 600 /etc/routewolf/watchdog.conf 2>/dev/null || true

    cat << 'EOF' > /usr/sbin/routewolf-watchdog.sh
#!/bin/sh

CONF='/etc/routewolf/watchdog.conf'
[ -f "$CONF" ] && . "$CONF"
TYPE="${WATCHDOG_TYPE:-unknown}"
DEV="${WATCHDOG_DEVICE:-}"
UCI_IFACE="${WATCHDOG_UCI_IFACE:-}"
SERVICE="${WATCHDOG_SERVICE:-}"
TEST_URL="${WATCHDOG_URL:-https://www.youtube.com/generate_204}"
LOG_TAG='RouteWolf-watchdog'
LOCK='/tmp/routewolf-watchdog.lock'

log() { logger -t "$LOG_TAG" "$*" 2>/dev/null || echo "$LOG_TAG: $*"; }

lock_or_exit() {
    if mkdir "$LOCK" 2>/dev/null; then
        trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
    else
        exit 0
    fi
}

fail_open_cleanup() {
    # Never change the main WAN default route. Only clear RouteWolf's policy table.
    ip route del blackhole default table vpn metric 42767 >/dev/null 2>&1 || true
    ip -6 route del blackhole default table vpn metric 42767 >/dev/null 2>&1 || true
    ip route flush table vpn >/dev/null 2>&1 || true
}

route_repair() {
    [ -x /usr/sbin/routewolf-route.sh ] && /usr/sbin/routewolf-route.sh >/dev/null 2>&1 && return 0
    [ -x /usr/sbin/domain-routing-route.sh ] && /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 && return 0
    return 0
}

ensure_boot_enabled() {
    case "$TYPE" in
        wg|awg)
            [ -n "$UCI_IFACE" ] || return 0
            uci set network.$UCI_IFACE.auto='1' 2>/dev/null || true
            uci commit network >/dev/null 2>&1 || true
        ;;
        ovpn) /etc/init.d/openvpn enable >/dev/null 2>&1 || true ;;
        singbox|outline) /etc/init.d/sing-box enable >/dev/null 2>&1 || true ;;
    esac
}

restart_selected() {
    reason="$1"
    log "restart $TYPE/$DEV: $reason"
    fail_open_cleanup
    ensure_boot_enabled

    case "$TYPE" in
        wg|awg)
            ifdown "$UCI_IFACE" >/dev/null 2>&1 || true
            sleep 3
            ifup "$UCI_IFACE" >/dev/null 2>&1 || true
        ;;
        ovpn)
            /etc/init.d/openvpn restart >/dev/null 2>&1 || /etc/init.d/openvpn start >/dev/null 2>&1 || true
        ;;
        singbox|outline)
            /etc/init.d/sing-box restart >/dev/null 2>&1 || /etc/init.d/sing-box start >/dev/null 2>&1 || true
        ;;
    esac

    i=0
    while [ "$i" -lt 25 ]; do
        ip link show dev "$DEV" >/dev/null 2>&1 && ip link show dev "$DEV" 2>/dev/null | grep -q 'UP' && break
        sleep 1
        i=$((i+1))
    done
    route_repair
}

iface_ipv4() {
    ip -4 -o addr show dev "$DEV" 2>/dev/null | awk '{split($4,a,"/"); print a[1]; exit}'
}

check_device() {
    [ -n "$DEV" ] || return 1
    ip link show dev "$DEV" >/dev/null 2>&1 || return 1
    ip link show dev "$DEV" 2>/dev/null | grep -q 'UP' || return 1
    return 0
}

check_connectivity() {
    check_device || return 1
    src="$(iface_ipv4)"

    if command -v curl >/dev/null 2>&1; then
        curl -kfsS --interface "$DEV" --connect-timeout 8 --max-time 15 "$TEST_URL" >/dev/null 2>&1 && return 0
    fi

    if [ -n "$src" ] && command -v wget >/dev/null 2>&1 && wget --help 2>&1 | grep -q -- '--bind-address'; then
        if wget --help 2>&1 | grep -q -- '--no-check-certificate'; then
            wget --no-check-certificate --bind-address="$src" -T 15 -q -O /dev/null "$TEST_URL" >/dev/null 2>&1 && return 0
        else
            wget --bind-address="$src" -T 15 -q -O /dev/null "$TEST_URL" >/dev/null 2>&1 && return 0
        fi
    fi

    ping -I "$DEV" -c 2 -W 4 1.1.1.1 >/dev/null 2>&1 && return 0
    return 1
}

status() {
    echo "=== RouteWolf universal watchdog ==="
    echo "type: $TYPE"
    echo "device: $DEV"
    echo "service: $SERVICE"
    echo "test: $TEST_URL"
    echo "boot service: enabled by installer"
    echo "schedule: every ${WATCHDOG_INTERVAL_MIN:-30} minutes"
    echo "=== interface ==="
    ip addr show dev "$DEV" 2>/dev/null || echo "$DEV not found"
    echo "=== main WAN default (must remain available) ==="
    ip route show default 2>/dev/null || true
    echo "=== RouteWolf vpn table ==="
    ip route show table vpn 2>/dev/null || true
    echo "=== last watchdog log ==="
    logread 2>/dev/null | grep "$LOG_TAG" | tail -n 40 || true
}

run_check() {
    lock_or_exit
    ensure_boot_enabled
    route_repair

    check_connectivity && exit 0
    sleep 10
    check_connectivity && exit 0

    restart_selected 'two connectivity checks failed'
    if check_connectivity; then
        log "recovered: $TYPE/$DEV works after restart"
        exit 0
    fi

    fail_open_cleanup
    route_repair
    log "error: $TYPE/$DEV still unavailable after restart; WAN left in fail-open mode"
    exit 1
}

case "$1" in
    status) status ;;
    restart)
        lock_or_exit
        restart_selected 'manual request'
        status
    ;;
    boot)
        lock_or_exit
        ensure_boot_enabled
        sleep 30
        restart_selected 'router boot recovery'
        check_connectivity || log "boot recovery finished but tunnel test still fails; WAN remains fail-open"
    ;;
    check|test|"") run_check ;;
    *) echo "Usage: $0 [check|status|restart|boot]"; exit 1 ;;
esac
EOF
    chmod +x /usr/sbin/routewolf-watchdog.sh

    cat << 'EOF' > /etc/init.d/routewolf-watchdog
#!/bin/sh /etc/rc.common

START=99
STOP=10

start() {
    /usr/sbin/routewolf-watchdog.sh boot >/dev/null 2>&1 &
}

restart() {
    /usr/sbin/routewolf-watchdog.sh restart >/dev/null 2>&1 &
}
EOF
    chmod +x /etc/init.d/routewolf-watchdog

    # Remove the old AWG-only service to avoid two watchdogs fighting each other.
    /etc/init.d/routewolf-awg-watchdog stop >/dev/null 2>&1 || true
    /etc/init.d/routewolf-awg-watchdog disable >/dev/null 2>&1 || true
    rm -f /etc/init.d/routewolf-awg-watchdog

    cat << 'EOF' > /usr/sbin/routewolf-awg-watchdog.sh
#!/bin/sh
# Compatibility alias for older RouteWolf commands.
exec /usr/sbin/routewolf-watchdog.sh "$@"
EOF
    chmod +x /usr/sbin/routewolf-awg-watchdog.sh

    /etc/init.d/routewolf-watchdog enable >/dev/null 2>&1 || true
    touch /etc/crontabs/root 2>/dev/null || true
    sed -i '/routewolf-awg-watchdog/d;/routewolf-watchdog/d' /etc/crontabs/root 2>/dev/null || true
    echo '*/30 * * * * /usr/sbin/routewolf-watchdog.sh check >/dev/null 2>&1' >> /etc/crontabs/root
    /etc/init.d/cron enable >/dev/null 2>&1 || true
    /etc/init.d/cron restart >/dev/null 2>&1 || true
    /etc/init.d/routewolf-watchdog restart >/dev/null 2>&1 || true

    msgc "$C_GREEN" \
        "Tunnel watchdog enabled: boot recovery and a check every 30 minutes" \
        "Автоконтроль туннеля включён: восстановление после загрузки и проверка каждые 30 минут"
}

route_vpn () {
    if [ "$TUNNEL" = wg ]; then
        VPN_ROUTE_DEV="wg0"
        VPN_ROUTE_UCI_INTERFACE="wg0"
    elif [ "$TUNNEL" = awg ]; then
        VPN_ROUTE_DEV="awg0"
        VPN_ROUTE_UCI_INTERFACE="awg0"
    elif [ "$TUNNEL" = ovpn ]; then
        VPN_ROUTE_DEV="${OVPN_ROUTE_DEV:-tun0}"
        VPN_ROUTE_GW="${OVPN_ROUTE_GW:-$(ovpn_detect_gateway "$VPN_ROUTE_DEV" | head -n 1)}"
        VPN_ROUTE_UCI_INTERFACE="OpenVPN"
        # Keep a visible OpenWrt interface for LuCI/firewall zone assignment.
        # Do not create the old duplicate ovpn0 interface.
        uci -q delete network.ovpn0
        uci set network.OpenVPN='interface'
        uci set network.OpenVPN.proto='none'
        uci set network.OpenVPN.device="$VPN_ROUTE_DEV"
        uci commit network >/dev/null 2>&1 || true
    elif [ "$TUNNEL" = singbox ]; then
        VPN_ROUTE_DEV="${SINGBOX_ROUTE_DEV:-sbtun0}"
        VPN_ROUTE_UCI_INTERFACE=""
    elif [ "$TUNNEL" = outline ]; then
        VPN_ROUTE_DEV="${OUTLINE_ROUTE_DEV:-outline0}"
        VPN_ROUTE_UCI_INTERFACE=""
    elif [ "$TUNNEL" = tun2socks ]; then
        VPN_ROUTE_DEV="${TUN2SOCKS_ROUTE_DEV:-tun0}"
        VPN_ROUTE_UCI_INTERFACE=""
    else
        return 0
    fi

    grep -q "99 vpn" /etc/iproute2/rt_tables || echo '99 vpn' >> /etc/iproute2/rt_tables

    # Do NOT create a persistent UCI route here.
    # Older builds created network.vpn_route and then the helper added a second
    # route too. v20 keeps the table owned by domain-routing-route.sh only,
    # so there is a single route and fail-open behavior stays predictable.
    uci -q delete network.vpn_route
    uci -q delete network.vpn_route6
    uci -q delete network.vpn_route_internal
    uci -q delete network.vpn_route_blackhole
    uci -q delete network.vpn_route_blackhole6
    uci commit network >/dev/null 2>&1 || true

    cat << EOF > /etc/domain-routing-route.conf
VPN_ROUTE_DEV='$VPN_ROUTE_DEV'
EOF
    if [ -n "${VPN_ROUTE_GW:-}" ]; then
        echo "VPN_ROUTE_GW='$VPN_ROUTE_GW'" >> /etc/domain-routing-route.conf
    fi

    cat << 'EOF' > /usr/sbin/domain-routing-route.sh
#!/bin/sh

# Maintains the separate "vpn" routing table used only by marked traffic.
# Normal, unmarked internet uses the main routing table and is not changed.
# Default safety mode is FAIL-OPEN: if VPN is missing/down, table vpn is left empty
# and Linux policy routing falls back to the main WAN table. This prevents Android/iOS
# from showing "No internet" when connectivity-check domains are in the routing list.
# Leak-protection/fail-closed can be added later as an explicit optional mode.

[ -f /etc/domain-routing-route.conf ] && . /etc/domain-routing-route.conf
[ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf
[ -n "$VPN_ROUTE_DEV" ] || exit 0

TABLE="vpn"
grep -q "99 $TABLE" /etc/iproute2/rt_tables 2>/dev/null || echo "99 $TABLE" >> /etc/iproute2/rt_tables

ensure_rule() {
    # Keep exactly one IPv4 rule at priority 100. Older releases sometimes
    # left an auto-priority rule such as "1: fwmark 0x1 lookup vpn".
    ip rule show 2>/dev/null | awk '/fwmark 0x1(\/0x1)?/ && /lookup (vpn|99)/ {gsub(":", "", $1); if ($1 != 100) print $1}' |     while IFS= read -r old_prio; do
        [ -n "$old_prio" ] && ip rule del priority "$old_prio" >/dev/null 2>&1 || true
    done
    if ! ip rule show 2>/dev/null | grep -Eq '^100:.*fwmark 0x1(/0x1)?.*lookup (vpn|99)'; then
        ip rule del fwmark 0x1/0x1 table 99 priority 100 >/dev/null 2>&1 || true
        ip rule add fwmark 0x1/0x1 table 99 priority 100 >/dev/null 2>&1 || return 1
    fi

    if [ "$IPV6_SUPPORT" = "1" ]; then
        ip -6 rule show 2>/dev/null | awk '/fwmark 0x1(\/0x1)?/ && /lookup (vpn|99)/ {gsub(":", "", $1); if ($1 != 100) print $1}' |         while IFS= read -r old_prio; do
            [ -n "$old_prio" ] && ip -6 rule del priority "$old_prio" >/dev/null 2>&1 || true
        done
        if ! ip -6 rule show 2>/dev/null | grep -Eq '^100:.*fwmark 0x1(/0x1)?.*lookup (vpn|99)'; then
            ip -6 rule del fwmark 0x1/0x1 table 99 priority 100 >/dev/null 2>&1 || true
            ip -6 rule add fwmark 0x1/0x1 table 99 priority 100 >/dev/null 2>&1 || return 1
        fi
    fi
    return 0
}

fail_open_route() {
    # Remove stale blackhole or stale VPN default routes from earlier versions.
    ip route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
    ip route del default table "$TABLE" >/dev/null 2>&1 || true
    if [ "$IPV6_SUPPORT" = "1" ]; then
        ip -6 route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
        ip -6 route del default table "$TABLE" >/dev/null 2>&1 || true
    fi
}

remove_openvpn_full_tunnel_routes() {
    case "$VPN_ROUTE_DEV" in
        tun*)
            ip route show 2>/dev/null | grep -E "^(0\.0\.0\.0/1|128\.0\.0\.0/1).* dev ${VPN_ROUTE_DEV}( |$)" | while IFS= read -r route_line; do
                ip route del $route_line >/dev/null 2>&1 || true
            done
        ;;
    esac
}

detect_openvpn_gateway_runtime() {
    dev="$1"
    [ -n "$dev" ] || return 1

    ip route show 0.0.0.0/1 2>/dev/null | awk -v d="$dev" '$2=="via" && $0 ~ " dev " d "( |$)" {print $3; exit}' | grep -m1 . && return 0
    ip route show 128.0.0.0/1 2>/dev/null | awk -v d="$dev" '$2=="via" && $0 ~ " dev " d "( |$)" {print $3; exit}' | grep -m1 . && return 0
    ip route show default 2>/dev/null | awk -v d="$dev" '$2=="via" && $0 ~ " dev " d "( |$)" {print $3; exit}' | grep -m1 . && return 0

    # Preferred fallback: first host of the current connected tun subnet.
    # This avoids stale gateways after OpenVPN reconnects into another pool
    # (e.g. 10.28.0.3/22 -> 10.28.4.5/22 means gateway must become 10.28.4.1).
    ip -4 route show dev "$dev" scope link 2>/dev/null | awk 'NR==1 {split($1,n,"/"); split(n[1],o,"."); if (o[1] && o[2] && o[3]) {print o[1]"."o[2]"."o[3]"."(o[4]+1); exit}}' | grep -m1 . && return 0

    ip -4 addr show dev "$dev" 2>/dev/null | awk '/ inet / {split($2,a,"/"); split(a[1],o,"."); if (o[1] && o[2] && o[3]) {print o[1]"."o[2]"."o[3]".1"; exit}}'
}

persist_openvpn_gateway_runtime() {
    dev="$1"
    gw="$2"
    [ -n "$dev" ] || return 0
    [ -n "$gw" ] || return 0
    conf="/etc/domain-routing-route.conf"
    tmp="/tmp/domain-routing-route.conf.$$"
    {
        echo "VPN_ROUTE_DEV='$dev'"
        echo "VPN_ROUTE_GW='$gw'"
        if [ -f "$conf" ]; then
            grep -v -E '^(VPN_ROUTE_DEV|VPN_ROUTE_GW)=' "$conf" 2>/dev/null || true
        fi
    } > "$tmp"
    mv "$tmp" "$conf" 2>/dev/null || true
}

use_vpn_route() {
    # Always remove the old fail-closed blackhole before installing a working VPN route.
    ip route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
    remove_openvpn_full_tunnel_routes

    case "$VPN_ROUTE_DEV" in
        tun*)
            # Re-detect every run. OpenVPN may reconnect and receive a different
            # tun subnet/gateway; a stale VPN_ROUTE_GW breaks policy routing.
            RUNTIME_GW="$(detect_openvpn_gateway_runtime "$VPN_ROUTE_DEV" | head -n 1)"
            GW="${RUNTIME_GW:-${VPN_ROUTE_GW:-}}"
            if [ -n "$GW" ]; then
                if ip route replace default via "$GW" dev "$VPN_ROUTE_DEV" table "$TABLE" metric 10 >/dev/null 2>&1; then
                    [ "$GW" = "$VPN_ROUTE_GW" ] || persist_openvpn_gateway_runtime "$VPN_ROUTE_DEV" "$GW"
                else
                    # Do not keep a stale gateway. Fail-open by leaving table empty
                    # rather than installing a weak default dev tun0 route that may not work.
                    ip route del default table "$TABLE" >/dev/null 2>&1 || true
                    return 1
                fi
            else
                ip route del default table "$TABLE" >/dev/null 2>&1 || true
                return 1
            fi
        ;;
        *)
            ip route replace default dev "$VPN_ROUTE_DEV" table "$TABLE" scope link metric 10 >/dev/null 2>&1 || return 1
        ;;
    esac

    if [ "$IPV6_SUPPORT" = "1" ]; then
        ip -6 route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
        ip -6 route replace default dev "$VPN_ROUTE_DEV" table "$TABLE" metric 10 >/dev/null 2>&1 || true
    fi
    return 0
}

ensure_rule

i=0
while [ "$i" -lt 30 ]; do
    if ip link show dev "$VPN_ROUTE_DEV" >/dev/null 2>&1; then
        if ip link show dev "$VPN_ROUTE_DEV" | grep -q "UP"; then
            use_vpn_route && exit 0
        fi
    fi
    i=$((i + 1))
    sleep 1
done

fail_open_route
exit 0
EOF
    chmod +x /usr/sbin/domain-routing-route.sh

    cat << 'EOF' > /usr/sbin/domain-routing-status.sh
#!/bin/sh

[ -f /etc/domain-routing-route.conf ] && . /etc/domain-routing-route.conf
[ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf

echo "=== RouteWolf v41 status ==="
echo "VPN_ROUTE_DEV=${VPN_ROUTE_DEV:-not set}"
echo "VPN_ROUTE_GW=${VPN_ROUTE_GW:-not set}"
echo "IPV6_SUPPORT=${IPV6_SUPPORT:-0}"
echo "DOMAINS_URL=${DOMAINS_URL:-not set}"
echo "IPV4_URL=${IPV4_URL:-not set}"
echo ""
echo "=== main default route, unaffected by this project ==="
ip route show default 2>/dev/null || true
echo ""
echo "=== vpn policy route ==="
ip rule show 2>/dev/null | grep -E "fwmark 0x1|lookup vpn" || true
ip route show table vpn 2>/dev/null || true
echo ""
echo "=== vpn interface ==="
[ -n "$VPN_ROUTE_DEV" ] && ip addr show dev "$VPN_ROUTE_DEV" 2>/dev/null || echo "No VPN route device configured"
echo ""
echo "=== lists ==="
ls -lah /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst 2>/dev/null || true
echo ""
echo "=== firewall DNS redirect ==="
uci show firewall 2>/dev/null | grep -E "routing_openwrt_force_dns|src_dport='53'|dest_port='53'|dest_ip" || true
echo ""
echo "=== firewall marks ==="
nft list ruleset 2>/dev/null | grep -E "vpn_domains|vpn_subnets|mark_domains|mark_subnet" -n || true
echo ""
echo "=== quick checks ==="
echo "If table vpn shows blackhole default, it is stale from older builds: run /usr/sbin/domain-routing-route.sh."
echo "If mark counters stay at 0 while opening a site from LAN, the client is probably using DoH/Private DNS/cache or not going through br-lan."
EOF
    chmod +x /usr/sbin/domain-routing-status.sh

    cat << 'EOF' > /usr/sbin/routing-openwrt-healthcheck.sh
#!/bin/sh

# Daily self-healing check. It must never break ordinary WAN internet.
# It only restarts local services and reapplies the separate vpn table.

LOG_TAG="routing-openwrt-healthcheck"
log() { logger -t "$LOG_TAG" "$*" 2>/dev/null || echo "$LOG_TAG: $*"; }

[ -f /etc/domain-routing-route.conf ] && . /etc/domain-routing-route.conf
[ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf

# Sing-box safety: if sbtun0 is selected but sing-box is stopped, try to restart it.
# If it still does not create sbtun0, domain-routing-route.sh will keep table vpn empty
# and normal WAN internet will continue to work.
if [ "$VPN_ROUTE_DEV" = "sbtun0" ]; then
    if ! pidof sing-box >/dev/null 2>&1 || ! ip link show sbtun0 >/dev/null 2>&1; then
        log "sing-box missing or sbtun0 missing; restarting sing-box"
        /etc/init.d/sing-box restart >/dev/null 2>&1 || true
        sleep 5
    fi
fi

# Remove stale fail-closed leftovers from old builds.
ip route del blackhole default table vpn metric 42767 >/dev/null 2>&1 || true
ip -6 route del blackhole default table vpn metric 42767 >/dev/null 2>&1 || true

# If OpenVPN is selected, never allow server-pushed full-tunnel /1 routes to remain in main table.
case "$VPN_ROUTE_DEV" in
    tun*)
        ip route show 2>/dev/null | grep -E "^(0\.0\.0\.0/1|128\.0\.0\.0/1).* dev ${VPN_ROUTE_DEV}( |$)" | while IFS= read -r route_line; do
            ip route del $route_line >/dev/null 2>&1 || true
        done
    ;;
esac

# Make sure only the helper owns the vpn table.
ip route flush table vpn >/dev/null 2>&1 || true
/usr/sbin/domain-routing-route.sh >/dev/null 2>&1 || true

# Keep healthcheck light for weak routers: do not download lists here.
# Daily list refresh is handled by cron /etc/init.d/getdomains start.
# Restart dnsmasq only if its syntax test fails or working lists are missing.
if ! dnsmasq --test >/dev/null 2>&1; then
    log "dnsmasq test failed; restarting dnsmasq"
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
elif [ ! -s /tmp/dnsmasq.d/domains.lst ]; then
    log "domain list missing; refreshing lists and restarting dnsmasq"
    /etc/init.d/getdomains start >/dev/null 2>&1 || true
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
fi

# Reapply route after possible service changes.
/usr/sbin/domain-routing-route.sh >/dev/null 2>&1 || true

# Basic AWG/WG visibility log; no blocking actions.
if [ -n "$VPN_ROUTE_DEV" ] && ip link show "$VPN_ROUTE_DEV" >/dev/null 2>&1; then
    log "ok: $VPN_ROUTE_DEV exists; vpn table: $(ip route show table vpn 2>/dev/null | tr '\n' ' ')"
else
    log "vpn interface missing/down; fail-open keeps WAN unaffected"
fi
EOF
    chmod +x /usr/sbin/routing-openwrt-healthcheck.sh

    cat << 'EOF' > /etc/init.d/vpnroute
#!/bin/sh /etc/rc.common

START=98

start() {
    /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 &
}
EOF
    chmod +x /etc/init.d/vpnroute
    /etc/init.d/vpnroute enable

    cat << 'EOF' > /etc/hotplug.d/iface/30-vpnroute
#!/bin/sh

case "$ACTION" in
    ifup|ifupdate|add) /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 & ;;
esac
EOF
    chmod +x /etc/hotplug.d/iface/30-vpnroute
    cp /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute

    /etc/init.d/vpnroute start
}

add_mark() {
    # Policy routing is restored by /usr/sbin/routewolf-route.sh at boot and
    # on interface hotplug. Do not create a UCI `config rule` here: several
    # OpenWrt 24/25 builds reject that section with `uci: Invalid argument`.
    grep -qE '^[[:space:]]*99[[:space:]]+vpn([[:space:]]|$)' /etc/iproute2/rt_tables 2>/dev/null ||         echo '99 vpn' >> /etc/iproute2/rt_tables

    # Remove obsolete UCI rules from older releases so netifd cannot create a
    # duplicate rule with another priority.
    delete_uci_sections_by_name network rule mark0x1
    uci -q delete network.mark0x1
    uci -q delete network.routewolf_mark
    uci commit network >/dev/null 2>&1 || true

    printf "\033[32;1mConfigure RouteWolf runtime policy rule\033[0m\n"
    if [ -x /usr/sbin/routewolf-route.sh ]; then
        /usr/sbin/routewolf-route.sh >/tmp/routewolf-mark.log 2>&1 || {
            tail -n 20 /tmp/routewolf-mark.log 2>/dev/null || true
            return 1
        }
    else
        ip rule del fwmark 0x1/0x1 table 99 priority 100 >/dev/null 2>&1 || true
        ip rule add fwmark 0x1/0x1 table 99 priority 100 >/dev/null 2>&1 || return 1
    fi

    ip rule show 2>/dev/null | grep -Eq '^100:.*fwmark 0x1(/0x1)?.*lookup (vpn|99)' || return 1
    ip route del blackhole default table vpn metric 42767 >/dev/null 2>&1 || true
    return 0
}

add_tunnel() {
    clear_screen
    if [ "$FORCE_REINSTALL" = "1" ]; then
        echo "Forced reinstall requested / Запрошена принудительная переустановка"
        cleanup_existing_routing_config
    elif handle_existing_routing_config; then
        return
    fi
    clear_screen
    ui_header "$(prompt "Select a tunnel" "Выберите туннель")"
    if is_ru; then
        printf "1) %bAmneziaWG / Amnezia WireGuard%b     %b[работает]%b\n" "$C_GREEN" "$C_RESET" "$C_GREEN" "$C_RESET"
        printf "2) %bWireGuard%b                         %b[работает]%b\n" "$C_GREEN" "$C_RESET" "$C_GREEN" "$C_RESET"
        printf "3) %bOpenVPN%b                           %b[тестируется]%b\n" "$C_GREEN" "$C_RESET" "$C_YELLOW" "$C_RESET"
        printf "4) %bSing-box%b                          %b[экспериментально, VLESS Reality]%b\n" "$C_GREEN" "$C_RESET" "$C_YELLOW" "$C_RESET"
        printf "5) %bOutline%b                           %b[тестовый режим, статический ss://]%b\n" "$C_GREEN" "$C_RESET" "$C_YELLOW" "$C_RESET"
        printf "6) %bОтмена / выход%b\n" "$C_RED" "$C_RESET"
        printf "7) %bПропустить настройку туннеля%b\n" "$C_YELLOW" "$C_RESET"
    else
        printf "1) %bAmneziaWG / Amnezia WireGuard%b     %b[active]%b\n" "$C_GREEN" "$C_RESET" "$C_GREEN" "$C_RESET"
        printf "2) %bWireGuard%b                         %b[active]%b\n" "$C_GREEN" "$C_RESET" "$C_GREEN" "$C_RESET"
        printf "3) %bOpenVPN%b                           %b[testing]%b\n" "$C_GREEN" "$C_RESET" "$C_YELLOW" "$C_RESET"
        printf "4) %bSing-box%b                          %b[experimental, VLESS Reality]%b\n" "$C_GREEN" "$C_RESET" "$C_YELLOW" "$C_RESET"
        printf "5) %bOutline%b                           %b[test mode, static ss://]%b\n" "$C_GREEN" "$C_RESET" "$C_YELLOW" "$C_RESET"
        printf "6) %bCancel / exit%b\n" "$C_RED" "$C_RESET"
        printf "7) %bSkip tunnel setup%b\n" "$C_YELLOW" "$C_RESET"
    fi

    while true; do
        printf "%s" "$(prompt "Choice [1]: " "Выбор [1]: ")"
        read -r TUNNEL
        TUNNEL=${TUNNEL:-1}
        case "$TUNNEL" in
            1) TUNNEL=awg; break ;;
            2) TUNNEL=wg; break ;;
            3) TUNNEL=ovpn; break ;;
            4) TUNNEL=singbox; break ;;
            5) TUNNEL=outline; break ;;
            6) msgc "$C_RED" "Cancelled" "Отменено"; exit 1 ;;
            7) msgc "$C_YELLOW" "Skip tunnel setup" "Настройка туннеля пропущена"; TUNNEL=0; break ;;
            *) msgc "$C_RED" "Choose 1, 2, 3, 4, 5, 6 or 7." "Выберите 1, 2, 3, 4, 5, 6 или 7." ;;
        esac
    done

    if [ "$TUNNEL" = 'wg' ]; then
        printf "\033[32;1mConfigure WireGuard\033[0m\n"
        if pkg_is_installed wireguard-tools; then
            echo "Wireguard already installed"
        else
            echo "Installed wg..."
            pkg_install wireguard-tools
        fi

        route_vpn

        read -r -p "Enter the private key (from [Interface]):"$'\n' WG_PRIVATE_KEY

        while true; do
            read -r -p "Enter internal IP address with subnet, example 192.168.100.5/24 (from [Interface]):"$'\n' WG_IP
            if echo "$WG_IP" | egrep -oq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]+$'; then
                break
            else
                echo "This IP is not valid. Please repeat"
            fi
        done

        read -r -p "Enter the public key (from [Peer]):"$'\n' WG_PUBLIC_KEY
        read -r -p "If use PresharedKey, Enter this (from [Peer]). If your don't use leave blank:"$'\n' WG_PRESHARED_KEY
        read -r -p "Enter Endpoint host without port (Domain or IP) (from [Peer]):"$'\n' WG_ENDPOINT

        read -r -p "Enter Endpoint host port (from [Peer]) [51820]:"$'\n' WG_ENDPOINT_PORT
        WG_ENDPOINT_PORT=${WG_ENDPOINT_PORT:-51820}
        if [ "$WG_ENDPOINT_PORT" = '51820' ]; then
            echo $WG_ENDPOINT_PORT
        fi
        
        uci set network.wg0=interface
        uci set network.wg0.proto='wireguard'
        uci set network.wg0.private_key=$WG_PRIVATE_KEY
        uci set network.wg0.listen_port='51820'
        uci set network.wg0.addresses=$WG_IP

        if ! uci show network | grep -q wireguard_wg0; then
            uci add network wireguard_wg0
        fi
        uci set network.@wireguard_wg0[0]=wireguard_wg0
        uci set network.@wireguard_wg0[0].name='wg0_client'
        uci set network.@wireguard_wg0[0].public_key=$WG_PUBLIC_KEY
        uci set network.@wireguard_wg0[0].preshared_key=$WG_PRESHARED_KEY
        uci set network.@wireguard_wg0[0].route_allowed_ips='0'
        uci set network.@wireguard_wg0[0].persistent_keepalive='25'
        uci set network.@wireguard_wg0[0].endpoint_host=$WG_ENDPOINT
        uci set network.@wireguard_wg0[0].allowed_ips='0.0.0.0/0'
        uci set network.@wireguard_wg0[0].endpoint_port=$WG_ENDPOINT_PORT
        uci commit
    fi

    if [ "$TUNNEL" = 'ovpn' ]; then
        configure_openvpn_menu || {
            msgc "$C_RED" "OpenVPN setup cancelled" "Настройка OpenVPN отменена"
            TUNNEL=0
        }
    fi

    if [ "$TUNNEL" = 'singbox' ]; then
        configure_singbox_menu || {
            msgc "$C_RED" "Sing-box setup cancelled" "Настройка Sing-box отменена"
            TUNNEL=0
        }
    fi

    if [ "$TUNNEL" = 'outline' ]; then
        configure_outline_menu || {
            msgc "$C_RED" "Outline setup cancelled" "Настройка Outline отменена"
            TUNNEL=0
        }
    fi

    if [ "$TUNNEL" = 'wgForYoutube' ]; then
        add_internal_wg Wireguard
    fi

    if [ "$TUNNEL" = 'awgForYoutube' ]; then
        add_internal_wg AmneziaWG
    fi

    if [ "$TUNNEL" = 'awg' ]; then
        printf "\033[32;1mConfigure Amnezia WireGuard\033[0m\n"

        install_awg_packages || return 1

        route_vpn

        read -r -p "Paste full AmneziaWG config now? / Вставить полный конфиг AmneziaWG? (y/n) [y]: " PASTE_AWG_CONFIG
        PASTE_AWG_CONFIG=${PASTE_AWG_CONFIG:-y}
        if [ "$PASTE_AWG_CONFIG" = "y" ] || [ "$PASTE_AWG_CONFIG" = "Y" ]; then
            AWG_CFG_TMP="/tmp/awg-client.conf"
            read_multiline_config "$AWG_CFG_TMP"
            parse_awg_config_file "$AWG_CFG_TMP"
            rm -f "$AWG_CFG_TMP"
        else
            read -r -p "Enter the private key (from [Interface]):"$'\n' AWG_PRIVATE_KEY
            while true; do
                read -r -p "Enter internal IP address with subnet, example 192.168.100.5/24 (Address from [Interface]):"$'\n' AWG_IP
                if echo "$AWG_IP" | egrep -oq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]+$'; then break; else echo "This IP is not valid. Please repeat"; fi
            done
            read -r -p "Enter DNS value [optional] (from [Interface]):"$'\n' AWG_DNS
            read -r -p "Enter Jc value (from [Interface]):"$'\n' AWG_JC
            read -r -p "Enter Jmin value (from [Interface]):"$'\n' AWG_JMIN
            read -r -p "Enter Jmax value (from [Interface]):"$'\n' AWG_JMAX
            read -r -p "Enter S1 value (from [Interface]):"$'\n' AWG_S1
            read -r -p "Enter S2 value (from [Interface]):"$'\n' AWG_S2
            read -r -p "Enter H1 value (from [Interface]):"$'\n' AWG_H1
            read -r -p "Enter H2 value (from [Interface]):"$'\n' AWG_H2
            read -r -p "Enter H3 value (from [Interface]):"$'\n' AWG_H3
            read -r -p "Enter H4 value (from [Interface]):"$'\n' AWG_H4
            if [ "$AWG_VERSION" = "2.0" ]; then
                read -r -p "Enter S3 value [optional]:"$'\n' AWG_S3
                read -r -p "Enter S4 value [optional]:"$'\n' AWG_S4
                read -r -p "Enter I1 value [optional]:"$'\n' AWG_I1
                read -r -p "Enter I2 value [optional]:"$'\n' AWG_I2
                read -r -p "Enter I3 value [optional]:"$'\n' AWG_I3
                read -r -p "Enter I4 value [optional]:"$'\n' AWG_I4
                read -r -p "Enter I5 value [optional]:"$'\n' AWG_I5
            fi
            read -r -p "Enter the public key (from [Peer]):"$'\n' AWG_PUBLIC_KEY
            read -r -p "If use PresharedKey, enter it; otherwise leave blank:"$'\n' AWG_PRESHARED_KEY
            read -r -p "Enter Endpoint host without port (Domain or IP) (from [Peer]):"$'\n' AWG_ENDPOINT
            read -r -p "Enter Endpoint host port (from [Peer]) [51820]:"$'\n' AWG_ENDPOINT_PORT
            AWG_ENDPOINT_PORT=${AWG_ENDPOINT_PORT:-51820}
            read -r -p "Enter AllowedIPs [0.0.0.0/0]:"$'\n' AWG_ALLOWED_IPS
            AWG_ALLOWED_IPS=${AWG_ALLOWED_IPS:-0.0.0.0/0}
            read -r -p "Enter PersistentKeepalive [25]:"$'\n' AWG_KEEPALIVE
            AWG_KEEPALIVE=${AWG_KEEPALIVE:-25}
        fi

        if [ -z "$AWG_PRIVATE_KEY" ] || [ -z "$AWG_IP" ] || [ -z "$AWG_PUBLIC_KEY" ] || [ -z "$AWG_ENDPOINT" ]; then
            echo "Required AmneziaWG values are missing. Check pasted config."
            exit 1
        fi
        AWG_ALLOWED_IPS=${AWG_ALLOWED_IPS:-0.0.0.0/0}
        AWG_KEEPALIVE=${AWG_KEEPALIVE:-25}
        
        uci set network.awg0=interface
        uci set network.awg0.proto='amneziawg'
        uci set network.awg0.private_key="$AWG_PRIVATE_KEY"
        uci set network.awg0.listen_port='51820'
        uci set network.awg0.addresses="$AWG_IP"
        if [ -n "$AWG_DNS" ]; then
            uci -q delete network.awg0.dns
            OLD_IFS="$IFS"
            IFS=','
            for dns_server in $AWG_DNS; do
                IFS="$OLD_IFS"
                dns_server=$(echo "$dns_server" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                [ -n "$dns_server" ] && uci add_list network.awg0.dns="$dns_server"
                IFS=','
            done
            IFS="$OLD_IFS"
        fi

        uci set network.awg0.awg_jc="$AWG_JC"
        uci set network.awg0.awg_jmin="$AWG_JMIN"
        uci set network.awg0.awg_jmax="$AWG_JMAX"
        uci set network.awg0.awg_s1="$AWG_S1"
        uci set network.awg0.awg_s2="$AWG_S2"
        uci set network.awg0.awg_h1="$AWG_H1"
        uci set network.awg0.awg_h2="$AWG_H2"
        uci set network.awg0.awg_h3="$AWG_H3"
        uci set network.awg0.awg_h4="$AWG_H4"
        [ -n "$AWG_S3" ] && uci set network.awg0.awg_s3="$AWG_S3"
        [ -n "$AWG_S4" ] && uci set network.awg0.awg_s4="$AWG_S4"
        [ -n "$AWG_I1" ] && uci set network.awg0.awg_i1="$AWG_I1"
        [ -n "$AWG_I2" ] && uci set network.awg0.awg_i2="$AWG_I2"
        [ -n "$AWG_I3" ] && uci set network.awg0.awg_i3="$AWG_I3"
        [ -n "$AWG_I4" ] && uci set network.awg0.awg_i4="$AWG_I4"
        [ -n "$AWG_I5" ] && uci set network.awg0.awg_i5="$AWG_I5"

        if ! uci show network | grep -q amneziawg_awg0; then
            uci add network amneziawg_awg0
        fi

        uci set network.@amneziawg_awg0[0]=amneziawg_awg0
        uci set network.@amneziawg_awg0[0].name='awg0_client'
        uci set network.@amneziawg_awg0[0].public_key="$AWG_PUBLIC_KEY"
        uci set network.@amneziawg_awg0[0].preshared_key="$AWG_PRESHARED_KEY"
        uci set network.@amneziawg_awg0[0].route_allowed_ips='0'
        uci set network.@amneziawg_awg0[0].persistent_keepalive="$AWG_KEEPALIVE"
        uci set network.@amneziawg_awg0[0].endpoint_host="$AWG_ENDPOINT"
        uci set network.@amneziawg_awg0[0].allowed_ips="$AWG_ALLOWED_IPS"
        uci set network.@amneziawg_awg0[0].endpoint_port="$AWG_ENDPOINT_PORT"
        uci commit
    fi

    if [ "${TUNNEL:-0}" != "0" ]; then
        install_routewolf_watchdog
    fi

}

dnsmasqfull() {
    if pkg_is_installed dnsmasq-full; then
        printf "\033[32;1mdnsmasq-full already installed\033[0m\n"
    else
        printf "\033[34;1mInstalling dnsmasq-full\033[0m\n"
        detect_pkg_manager
        if [ "$PKG_MANAGER" = "apk" ]; then
            pkg_install dnsmasq-full || { pkg_remove dnsmasq; pkg_install dnsmasq-full; } || {
                printf "\033[31;1mFailed to install dnsmasq-full. Check package repository and free space.\033[0m\n"
                return 1
            }
        else
            cd /tmp/ || return 1
            opkg download dnsmasq-full || {
                printf "\033[31;1mFailed to download dnsmasq-full. Check internet, DNS and package repository.\033[0m\n"
                return 1
            }
            opkg remove dnsmasq && opkg install dnsmasq-full --cache /tmp/ || {
                printf "\033[31;1mFailed to replace dnsmasq with dnsmasq-full.\033[0m\n"
                return 1
            }
            if [ -f /etc/config/dhcp-opkg ]; then
                cp /etc/config/dhcp /etc/config/dhcp-old 2>/dev/null || true
                printf "\033[33;1mNew package config saved as /etc/config/dhcp-opkg; current /etc/config/dhcp was kept unchanged.\033[0m\n"
            fi
        fi
    fi
}
dnsmasqconfdir() {
    if [ "${VERSION_ID:-0}" -ge 24 ] 2>/dev/null; then
        if ! uci -q show dhcp.@dnsmasq[0] >/dev/null 2>&1; then
            printf "\033[31;1mdnsmasq section was not found in /etc/config/dhcp\033[0m\n"
            return 1
        fi

        if uci -q get dhcp.@dnsmasq[0].confdir 2>/dev/null | grep -q /tmp/dnsmasq.d; then
            printf "\033[32;1mdnsmasq confdir is already set\033[0m\n"
        else
            printf "\033[34;1mSetting dnsmasq confdir\033[0m\n"
            uci set dhcp.@dnsmasq[0].confdir='/tmp/dnsmasq.d' || return 1
            uci commit dhcp || return 1
        fi
    fi
}
remove_forwarding() {
    if [ ! -z "$forward_id" ]; then
        while uci -q delete firewall.@forwarding[$forward_id]; do :; done
    fi
}

add_zone() {
    if [ "$TUNNEL" = "0" ]; then
        printf "\033[32;1mZone setting skipped\033[0m\n"
        return 0
    fi

    zone_name="$TUNNEL"
    zone_network=""
    zone_device=""

    case "$TUNNEL" in
        wg)
            zone_network="wg0"
        ;;
        awg)
            zone_network="awg0"
        ;;
        ovpn)
            zone_name="ovpn"
            zone_network="OpenVPN"
            VPN_ROUTE_DEV="${VPN_ROUTE_DEV:-${OVPN_ROUTE_DEV:-tun0}}"
            # Ensure LuCI shows OpenVPN as assigned to firewall zone ovpn.
            uci -q delete network.ovpn0
            uci set network.OpenVPN='interface'
            uci set network.OpenVPN.proto='none'
            uci set network.OpenVPN.device="$VPN_ROUTE_DEV"
            uci commit network >/dev/null 2>&1 || true
        ;;
        singbox)
            zone_device="${VPN_ROUTE_DEV:-${SINGBOX_ROUTE_DEV:-sbtun0}}"
        ;;
        outline)
            zone_name="outline"
            zone_device="${VPN_ROUTE_DEV:-${OUTLINE_ROUTE_DEV:-outline0}}"
        ;;
        *)
            zone_device="${VPN_ROUTE_DEV:-tun0}"
        ;;
    esac

    # Find existing zone by name, otherwise create one. Then force-correct its options.
    zone_id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@zone\[\([0-9]*\)\]\.name='${zone_name}'.*/\1/p" | head -n 1)
    if [ -z "$zone_id" ]; then
        printf "\033[32;1mCreate zone\033[0m\n"
        uci add firewall zone >/dev/null
        zone_ref="firewall.@zone[-1]"
    else
        printf "\033[32;1mZone already exists, fixing options\033[0m\n"
        zone_ref="firewall.@zone[$zone_id]"
    fi

    uci set "$zone_ref.name=$zone_name"
    uci set "$zone_ref.forward=REJECT"
    uci set "$zone_ref.output=ACCEPT"
    uci set "$zone_ref.input=REJECT"
    uci set "$zone_ref.masq=1"
    uci set "$zone_ref.mtu_fix=1"
    uci set "$zone_ref.family=ipv4"
    uci -q delete "$zone_ref.network"
    uci -q delete "$zone_ref.device"
    if [ -n "$zone_network" ]; then
        uci add_list "$zone_ref.network=$zone_network"
    elif [ -n "$zone_device" ]; then
        uci set "$zone_ref.device=$zone_device"
    fi
    uci commit firewall

    # Keep only one forwarding for the active tunnel zone.
    delete_uci_sections_by_name firewall forwarding "$zone_name-lan"
    if ! uci show firewall 2>/dev/null | grep -q "\.src='lan'" || ! uci show firewall 2>/dev/null | grep -q "\.dest='${zone_name}'"; then
        printf "\033[32;1mConfigured forwarding\033[0m\n"
        uci add firewall forwarding >/dev/null
        uci set firewall.@forwarding[-1]=forwarding
        uci set firewall.@forwarding[-1].name="$zone_name-lan"
        uci set firewall.@forwarding[-1].src='lan'
        uci set firewall.@forwarding[-1].dest="$zone_name"
        uci set firewall.@forwarding[-1].family='ipv4'
        uci commit firewall
    else
        printf "\033[32;1mForwarding already configured\033[0m\n"
    fi
}

show_manual() {
    if [ "$TUNNEL" = tun2socks ]; then
        printf "\033[42;1mZone for tun2socks configured. But you need to set up the tunnel yourself.\033[0m\n"
        echo "Use this manual: https://cli.co/VNZISEM"
    elif [ "$TUNNEL" = ovpn ]; then
        printf "\033[42;1mOpenVPN routing configured. If you used manual mode, make sure the OpenVPN tunnel is up.\033[0m\n"
        printf "\033[42;1mМаршрутизация OpenVPN настроена. Если был ручной режим, убедитесь, что OpenVPN-туннель поднят.\033[0m\n"
    elif [ "$TUNNEL" = outline ]; then
        msgc "$C_GREEN"             "Outline is running as a Shadowsocks client through outline0; only RouteWolf lists use it."             "Outline работает как клиент Shadowsocks через outline0; через него идут только списки RouteWolf."
    fi
}

add_set() {
    # Recreate project domain set/rule idempotently. This prevents fw4 errors like
    # "set vpn_domains: File exists" after previous broken installs or manual tests.
    delete_uci_sections_by_name firewall ipset vpn_domains
    delete_uci_sections_by_name firewall rule mark_domains

    printf "[32;1mCreate domain nft set and mark rule[0m
"
    uci add firewall ipset >/dev/null
    uci set firewall.@ipset[-1].name='vpn_domains'
    uci set firewall.@ipset[-1].match='dst_net'

    uci add firewall rule >/dev/null
    uci set firewall.@rule[-1]=rule
    uci set firewall.@rule[-1].name='mark_domains'
    uci set firewall.@rule[-1].src='lan'
    uci set firewall.@rule[-1].dest='*'
    uci set firewall.@rule[-1].proto='all'
    uci set firewall.@rule[-1].ipset='vpn_domains'
    uci set firewall.@rule[-1].set_mark='0x1'
    uci set firewall.@rule[-1].target='MARK'
    uci set firewall.@rule[-1].family='ipv4'
    uci commit firewall
}

add_dns_resolver() {
    echo "Configure DNSCrypt2 or Stubby? It does matter if your ISP is spoofing DNS requests"
    DISK=$(df -m / | awk 'NR==2{ print $2 }')
    if [[ "$DISK" -lt 32 ]]; then 
        printf "\033[31;1mYour router a disk have less than 32MB. It is not recommended to install DNSCrypt, it takes 10MB\033[0m\n"
    fi
    echo "Select:"
    echo "1) No [Default]"
    echo "2) DNSCrypt2 (10.7M)"
    echo "3) Stubby (36K)"

    while true; do
    read -r -p '' DNS_RESOLVER
        case $DNS_RESOLVER in 

        1) 
            echo "Skiped"
            break
            ;;

        2)
            DNS_RESOLVER=DNSCRYPT
            break
            ;;

        3) 
            DNS_RESOLVER=STUBBY
            break
            ;;

        *)
            echo "Choose from the following options"
            ;;
        esac
    done

    if [ "$DNS_RESOLVER" = 'DNSCRYPT' ]; then
        if pkg_is_installed dnscrypt-proxy2; then
            printf "\033[32;1mDNSCrypt2 already installed\033[0m\n"
        else
            printf "\033[32;1mInstalled dnscrypt-proxy2\033[0m\n"
            pkg_install dnscrypt-proxy2
            if grep -q "# server_names" /etc/dnscrypt-proxy2/dnscrypt-proxy.toml; then
                sed -i "s/^# server_names =.*/server_names = [\'google\', \'cloudflare\', \'scaleway-fr\', \'yandex\']/g" /etc/dnscrypt-proxy2/dnscrypt-proxy.toml
            fi

            printf "\033[32;1mDNSCrypt restart\033[0m\n"
            service dnscrypt-proxy restart
            printf "\033[32;1mDNSCrypt needs to load the relays list. Please wait\033[0m\n"
            sleep 30

            if [ -f /etc/dnscrypt-proxy2/relays.md ]; then
                uci set dhcp.@dnsmasq[0].noresolv="1"
                uci -q delete dhcp.@dnsmasq[0].server
                uci add_list dhcp.@dnsmasq[0].server="127.0.0.53#53"
                uci add_list dhcp.@dnsmasq[0].server='/use-application-dns.net/'
                uci commit dhcp
                
                printf "\033[32;1mDnsmasq restart\033[0m\n"

                /etc/init.d/dnsmasq restart
            else
                printf "\033[31;1mDNSCrypt not download list on /etc/dnscrypt-proxy2. Repeat install DNSCrypt by script.\033[0m\n"
            fi
    fi

    fi

    if [ "$DNS_RESOLVER" = 'STUBBY' ]; then
        printf "\033[32;1mConfigure Stubby\033[0m\n"

        if pkg_is_installed stubby; then
            printf "\033[32;1mStubby already installed\033[0m\n"
        else
            printf "\033[32;1mInstalled stubby\033[0m\n"
            pkg_install stubby

            printf "\033[32;1mConfigure Dnsmasq for Stubby\033[0m\n"
            uci set dhcp.@dnsmasq[0].noresolv="1"
            uci -q delete dhcp.@dnsmasq[0].server
            uci add_list dhcp.@dnsmasq[0].server="127.0.0.1#5453"
            uci add_list dhcp.@dnsmasq[0].server='/use-application-dns.net/'
            uci commit dhcp

            printf "\033[32;1mDnsmasq restart\033[0m\n"

            /etc/init.d/dnsmasq restart
        fi
    fi
}

add_packages() {
    # RouteWolf no longer installs editors or download utilities as mandatory
    # components. Normal OpenWrt images already provide the shell tools needed
    # by the installer, and extra packages can exhaust a 16 MB flash.
    prepare_install_storage || return 1

    if [ -x /bin/uclient-fetch ] || command -v uclient-fetch >/dev/null 2>&1 ||        command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1; then
        msgc "$C_GREEN"             "No additional base packages are required."             "Дополнительные базовые пакеты не требуются."
        return 0
    fi

    msgc "$C_RED"         "No downloader is available. A standard OpenWrt uclient-fetch installation is required."         "Не найден загрузчик. Требуется штатный uclient-fetch из OpenWrt."
    return 1
}


ensure_lan_dns_redirect() {
    # Force ordinary LAN DNS (TCP/UDP 53) to the router so dnsmasq can fill nftsets.
    # This does not affect DoH/DoT; users must disable Private DNS/Secure DNS in browsers/devices.
    LAN_IP=$(uci -q get network.lan.ipaddr 2>/dev/null)
    [ -z "$LAN_IP" ] && LAN_IP="192.168.1.1"

    delete_uci_sections_by_name firewall redirect routing_openwrt_force_dns

    uci add firewall redirect >/dev/null
    uci set firewall.@redirect[-1].name='routing_openwrt_force_dns'
    uci set firewall.@redirect[-1].src='lan'
    uci add_list firewall.@redirect[-1].proto='tcp'
    uci add_list firewall.@redirect[-1].proto='udp'
    uci set firewall.@redirect[-1].src_dport='53'
    uci set firewall.@redirect[-1].target='DNAT'
    uci set firewall.@redirect[-1].dest_ip="$LAN_IP"
    uci set firewall.@redirect[-1].dest_port='53'
    uci set firewall.@redirect[-1].family='ipv4'
    uci commit firewall
    echo "LAN DNS redirect enabled / DNS LAN перенаправляется на роутер: $LAN_IP:53"
}

install_diagnostics_script() {
    mkdir -p /usr/sbin
    cat << 'EOF' > /usr/sbin/routing-openwrt-diagnose.sh
#!/bin/sh

# routing-openwrt diagnostics. This command does not change ordinary WAN routing.
# It prints enough information to paste into an issue/chat for troubleshooting.

RED='\033[31;1m'; GREEN='\033[32;1m'; YELLOW='\033[33;1m'; BLUE='\033[34;1m'; RESET='\033[0m'
ok() { printf "%bOK%b: %s\n" "$GREEN" "$RESET" "$*"; }
warn() { printf "%bWARN%b: %s\n" "$YELLOW" "$RESET" "$*"; }
bad() { printf "%bERROR%b: %s\n" "$RED" "$RESET" "$*"; }
section() { printf "\n%b=== %s ===%b\n" "$BLUE" "$1" "$RESET"; }

[ -f /etc/domain-routing-route.conf ] && . /etc/domain-routing-route.conf
[ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf

section "routing-openwrt diagnostics"
echo "Version: v44-low-flash-safe"
echo "Date: $(date 2>/dev/null)"
echo "Model: $(ubus call system board 2>/dev/null | jsonfilter -e '@.model' 2>/dev/null || cat /tmp/sysinfo/model 2>/dev/null)"
echo "OpenWrt: $(ubus call system board 2>/dev/null | jsonfilter -e '@.release.description' 2>/dev/null)"

section "Detected tunnel"
DETECTED=""
DEV="${VPN_ROUTE_DEV:-}"
if [ -z "$DEV" ] && [ "$(uci -q get network.awg0.proto 2>/dev/null)" = "amneziawg" ]; then DEV="awg0"; fi
if [ -z "$DEV" ] && [ "$(uci -q get network.wg0.proto 2>/dev/null)" = "wireguard" ]; then DEV="wg0"; fi
if [ -z "$DEV" ] && ip link show sbtun0 >/dev/null 2>&1; then DEV="sbtun0"; fi
if [ -z "$DEV" ]; then DEV=$(ip -o link show 2>/dev/null | awk -F': ' '$2 ~ /^tun[0-9]/ {print $2; exit}'); fi
VPN_ROUTE_DEV="$DEV"

case "$DEV" in
    awg0) DETECTED="AmneziaWG" ;;
    wg0) DETECTED="WireGuard" ;;
    sbtun0) DETECTED="Sing-box" ;;
    tun*) DETECTED="OpenVPN" ;;
    *) DETECTED="unknown" ;;
esac

echo "Detected type: $DETECTED"
echo "Route device: ${DEV:-not found}"
[ -n "$DEV" ] && ip addr show dev "$DEV" 2>/dev/null || warn "VPN route device not found"

case "$DEV" in
    awg0)
        if command -v awg >/dev/null 2>&1; then
            awg show 2>/dev/null | grep -E 'interface:|peer:|endpoint|latest handshake|transfer|allowed ips' || true
            awg show 2>/dev/null | grep -q 'latest handshake' && ok "AmneziaWG has handshake" || warn "No AmneziaWG handshake shown"
        else
            bad "awg command not found"
        fi
        ;;
    wg0)
        if command -v wg >/dev/null 2>&1; then
            wg show 2>/dev/null | grep -E 'interface:|peer:|endpoint|latest handshake|transfer|allowed ips' || true
            wg show 2>/dev/null | grep -q 'latest handshake' && ok "WireGuard has handshake" || warn "No WireGuard handshake shown"
        else
            bad "wg command not found"
        fi
        ;;
    sbtun0)
        pidof sing-box >/dev/null 2>&1 && ok "sing-box process is running" || bad "sing-box process is not running"
        command -v sing-box >/dev/null 2>&1 && sing-box version 2>/dev/null | head -n 2 || true
        [ -f /etc/sing-box/config.json ] && sing-box check -c /etc/sing-box/config.json 2>/tmp/routing-openwrt-singbox-check.log && ok "sing-box config check OK" || warn "sing-box config check failed or config missing; see /tmp/routing-openwrt-singbox-check.log"
        ;;
    tun*)
        pidof openvpn >/dev/null 2>&1 && ok "OpenVPN process is running" || warn "OpenVPN process is not running"
        uci show openvpn 2>/dev/null | sed -n '1,20p'
        ;;
esac

LAN_IP="$(uci -q get network.lan.ipaddr 2>/dev/null)"
[ -n "$LAN_IP" ] || LAN_IP="192.168.1.1"

section "Normal WAN internet"
ip route show default 2>/dev/null || true
case "$DEV" in
    tun*)
        if ip route show 2>/dev/null | grep -E "^(0\.0\.0\.0/1|128\.0\.0\.0/1).* dev ${DEV}( |$)" >/dev/null; then
            bad "OpenVPN full-tunnel /1 routes found in main table. Add route-nopull/pull-filter or run /usr/sbin/domain-routing-route.sh"
        else
            ok "No OpenVPN full-tunnel /1 routes in main table"
        fi
    ;;
esac
if ping -c 2 -W 2 1.1.1.1 >/tmp/routing-openwrt-ping.log 2>&1; then ok "Ping 1.1.1.1 works"; else bad "Ping 1.1.1.1 failed"; cat /tmp/routing-openwrt-ping.log; fi
if nslookup openwrt.org "$LAN_IP" >/tmp/routing-openwrt-nslookup-wan.log 2>&1; then ok "Router DNS works through $LAN_IP"; else bad "Router DNS failed through $LAN_IP"; cat /tmp/routing-openwrt-nslookup-wan.log; fi

section "Router resources"
uptime 2>/dev/null || true
free -m 2>/dev/null || free 2>/dev/null || true
df -h / /tmp 2>/dev/null || df -h / 2>/dev/null || true
echo "Load command: /usr/sbin/routing-openwrt-load.sh"

section "Lists and dnsmasq"
ls -lah /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst 2>/dev/null || true
if [ -s /tmp/dnsmasq.d/domains.lst ]; then
    DOM_LINES=$(wc -l < /tmp/dnsmasq.d/domains.lst)
    [ "$DOM_LINES" -ge 5 ] && ok "Domain list exists: $DOM_LINES lines" || bad "Domain list is too small: $DOM_LINES lines. Run /etc/init.d/getdomains start and check GitHub raw list."
else
    bad "Domain list is missing or empty"
fi
if [ -s /tmp/lst/ipv4.lst ]; then
    IPV4_LINES=$(wc -l < /tmp/lst/ipv4.lst)
    [ "$IPV4_LINES" -ge 5 ] && ok "IPv4 CIDR list exists: $IPV4_LINES lines" || bad "IPv4 CIDR list is too small: $IPV4_LINES lines"
    grep -q '^203\.0\.113\.0/24$' /tmp/lst/ipv4.lst 2>/dev/null && bad "IPv4 list contains example TEST-NET 203.0.113.0/24. Replace it with real GitHub list."
else
    warn "IPv4 CIDR list is missing or empty"
fi
if dnsmasq --test >/tmp/routing-openwrt-dnsmasq-test.log 2>&1; then ok "dnsmasq syntax OK"; else bad "dnsmasq test failed"; cat /tmp/routing-openwrt-dnsmasq-test.log; fi
uci show dhcp 2>/dev/null | grep -E "dnsmasq.d|filter_aaaa" || true

section "Policy routing"
if [ -x /etc/init.d/routewolf-route ] && [ -x /usr/sbin/routewolf-route.sh ]; then
    ok "Policy rule persistence is provided by RouteWolf init/hotplug"
else
    bad "RouteWolf route restore service is missing; run: rw repair"
fi
ip rule show 2>/dev/null | grep -Eq '^100:.*fwmark 0x1(/0x1)?.*lookup (vpn|99)' &&     ok "Runtime fwmark rule is present at priority 100" || bad "Runtime fwmark rule is missing or has a stale priority"
ip rule show 2>/dev/null | grep -E 'fwmark 0x1|lookup vpn' || true
VPN_TABLE=$(ip route show table vpn 2>/dev/null)
printf '%s\n' "$VPN_TABLE"
echo "$VPN_TABLE" | grep -q 'blackhole' && bad "blackhole route found in table vpn; old broken fail-closed route must be removed"
if [ -n "$DEV" ] && ip link show dev "$DEV" 2>/dev/null | grep -q 'UP'; then
    echo "$VPN_TABLE" | grep -q "dev $DEV" && ok "table vpn routes marked traffic to $DEV" || bad "table vpn does not route to $DEV"
else
    [ -z "$VPN_TABLE" ] && ok "VPN device is down/missing and table vpn is empty: fail-open OK" || warn "VPN device is down/missing but table vpn is not empty"
fi

section "Firewall/nft marks"
nft list ruleset 2>/tmp/routing-openwrt-nft.err | grep -E 'vpn_domains|vpn_subnets|mark_domains|mark_subnet|routing_openwrt_force_dns' -n || warn "No routing-openwrt nft/firewall rules shown"
if nft list set inet fw4 vpn_domains >/tmp/routing-openwrt-vpn-domains-set 2>/dev/null; then
    ok "nft set vpn_domains exists"
    head -n 40 /tmp/routing-openwrt-vpn-domains-set
else
    bad "nft set vpn_domains does not exist"
fi
if nft list set inet fw4 vpn_subnets >/tmp/routing-openwrt-vpn-subnets-set 2>/dev/null; then
    ok "nft set vpn_subnets exists"
    head -n 20 /tmp/routing-openwrt-vpn-subnets-set
else
    warn "nft set vpn_subnets does not exist or IPv4 CIDR list was not applied"
fi

section "YouTube route test"
YOUTUBE_IP=$(nslookup youtube.com "$LAN_IP" 2>/tmp/routing-openwrt-youtube-nslookup.log | awk '/^Address: / && $2 ~ /^[0-9.]+$/ {print $2; exit}')
if [ -n "$YOUTUBE_IP" ]; then
    ok "youtube.com resolved by router to $YOUTUBE_IP"
    nft list set inet fw4 vpn_domains 2>/dev/null | grep -q "$YOUTUBE_IP" && ok "youtube.com IP is in vpn_domains" || warn "youtube.com IP is not visible in vpn_domains yet"
    echo "table vpn route for marked traffic:"
    ip route show table vpn 2>/dev/null || true
    if ip route show table vpn 2>/dev/null | grep -q "dev ${DEV}"; then
        ok "marked traffic uses table vpn through $DEV"
    else
        warn "table vpn does not show $DEV for marked traffic"
    fi
else
    bad "Could not resolve youtube.com through router DNS ($LAN_IP)"
    cat /tmp/routing-openwrt-youtube-nslookup.log 2>/dev/null
fi

section "Android TV / YouTube DNS path"
if uci show firewall 2>/dev/null | grep -q "name='routewolf_force_dns'\|name='routing_openwrt_force_dns'"; then
    ok "LAN DNS interception is enabled; ordinary TCP/UDP DNS is forced through router dnsmasq"
else
    warn "LAN DNS interception is disabled. Android TV or another client with hardcoded DNS may bypass dnsmasq and miss vpn_domains. Optional fix: rw dns on"
fi
check_tv_domain() {
    host="$1"
    ip="$(nslookup "$host" "$LAN_IP" 2>/dev/null | awk '/^Address: / && $2 ~ /^[0-9.]+$/ {print $2; exit}')"
    if [ -z "$ip" ]; then
        warn "$host did not resolve through router DNS"
        return
    fi
    if nft list set inet fw4 vpn_domains 2>/dev/null | grep -Fq "$ip"; then
        ok "$host -> $ip is present in vpn_domains"
    else
        warn "$host -> $ip is not visible in vpn_domains yet"
    fi
}
check_tv_domain www.youtube.com
check_tv_domain youtubei.googleapis.com
check_tv_domain i.ytimg.com
check_tv_domain redirector.googlevideo.com

section "LAN / Wi-Fi notes"
echo "LAN IP: $LAN_IP"
echo "LAN device: $(uci -q get network.lan.device 2>/dev/null)"
echo "Firewall LAN zone:"
uci show firewall 2>/dev/null | grep -E "zone.*name='lan'|network='lan'|network=.*lan" | head -n 20
MARK_LINES=$(nft list ruleset 2>/dev/null | grep -E 'mark_domains|mark_subnet' || true)
echo "$MARK_LINES"
echo "$MARK_LINES" | grep -q 'packets 0' && warn "Mark counters include 0 packets. Open YouTube from a LAN client and run diagnostics again. If still 0, client may use Private DNS/DoH or not pass through LAN zone."

section "Recommended repair commands"
echo "Update lists:          /etc/init.d/getdomains start"
echo "Repair route:          /usr/sbin/domain-routing-route.sh"
echo "Restart firewall/DNS:  /etc/init.d/firewall restart; /etc/init.d/dnsmasq restart"
echo "Full status:           /usr/sbin/domain-routing-status.sh"
echo "Paste this whole diagnostics output when asking for help."
EOF
    chmod +x /usr/sbin/routing-openwrt-diagnose.sh
}

run_diagnostics_now() {
    install_diagnostics_script
    /usr/sbin/routing-openwrt-diagnose.sh
    pause_screen
}

install_management_commands() {
    mkdir -p /usr/sbin
    install_diagnostics_script
    cat << 'EOF' > /usr/sbin/routing-openwrt-fetch.sh
#!/bin/sh
url="$1"; out="$2"
[ -n "$url" ] && [ -n "$out" ] || exit 2
rm -f "$out"
if [ -x /bin/uclient-fetch ]; then
    /bin/uclient-fetch -O "$out" "$url" && [ -s "$out" ] && exit 0
fi
if command -v curl >/dev/null 2>&1; then
    curl -kfsSL "$url" -o "$out" && [ -s "$out" ] && exit 0
fi
if command -v wget >/dev/null 2>&1; then
    wget -O "$out" "$url" && [ -s "$out" ] && exit 0
fi
exit 1
EOF
    chmod +x /usr/sbin/routing-openwrt-fetch.sh

    cat << 'EOF' > /usr/sbin/routing-openwrt-update.sh
#!/bin/sh
set -e
cd /tmp
/usr/sbin/routing-openwrt-fetch.sh https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh /tmp/routing-openwrt-update.sh
exec sh /tmp/routing-openwrt-update.sh
EOF
    chmod +x /usr/sbin/routing-openwrt-update.sh

    cat << 'EOF' > /usr/sbin/routing-openwrt-uninstall.sh
#!/bin/sh
set -e
cd /tmp
/usr/sbin/routing-openwrt-fetch.sh https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh /tmp/routing-openwrt-uninstall.sh
exec sh /tmp/routing-openwrt-uninstall.sh "$@"
EOF
    chmod +x /usr/sbin/routing-openwrt-uninstall.sh

    cat << 'EOF' > /usr/sbin/routing-openwrt-diagnose-update.sh
#!/bin/sh
/usr/sbin/routing-openwrt-diagnose.sh "$@"
EOF
    chmod +x /usr/sbin/routing-openwrt-diagnose-update.sh

    cat << 'EOF' > /usr/sbin/routing-openwrt-load.sh
#!/bin/sh
# Lightweight resource/load snapshot for weak OpenWrt routers.
echo "=== routing-openwrt load check ==="
date 2>/dev/null || true
echo

echo "=== uptime / load average ==="
uptime 2>/dev/null || true
echo

echo "=== memory ==="
free -m 2>/dev/null || free 2>/dev/null || true
echo

echo "=== flash ==="
df -h / /tmp 2>/dev/null || df -h 2>/dev/null || true
echo

echo "=== routing-openwrt lists ==="
wc -l /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst 2>/dev/null || true
ls -lh /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst 2>/dev/null || true
echo

echo "=== vpn policy route ==="
ip rule show 2>/dev/null | grep -E 'fwmark|lookup vpn' || true
ip route show table vpn 2>/dev/null || true
echo

echo "=== nft counters ==="
nft list ruleset 2>/dev/null | grep -E 'mark_domains|mark_subnet|vpn_domains|vpn_subnets' -n | head -n 40 || true
echo

echo "=== related processes ==="
ps 2>/dev/null | grep -Ei 'dnsmasq|openvpn|awg|wireguard|sing-box|vpnroute|routing-openwrt|getdomains|domain-routing' | grep -v grep || true
echo

echo "=== top snapshot ==="
(top -bn1 2>/dev/null || top -n 1 2>/dev/null) | head -n 20 || true
EOF
    chmod +x /usr/sbin/routing-openwrt-load.sh

    cat << 'EOF' > /usr/sbin/rwrt
#!/bin/sh
# Short routing-openwrt control command.
# Usage: rwrt help | status | diag | load | lists | repair | update | dco on|off|status | openvpn restart

CONF="/etc/domain-routing-route.conf"
OVPN=""

find_ovpn_config() {
    cfg=""
    cfg="$(uci -q show openvpn 2>/dev/null | awk -F= "/\\.enabled='1'/ {sec=\$1; sub(/\\.enabled$/,\"\",sec); enabled[sec]=1} /\\.config=/ {sec=\$1; sub(/\\.config$/,\"\",sec); gsub(\"'\",\"\",\$2); conf[sec]=\$2} END {for (s in enabled) if (conf[s] != \"\") {print conf[s]; exit}}")"
    [ -n "$cfg" ] && [ -f "$cfg" ] && { echo "$cfg"; return 0; }
    for f in /etc/openvpn/routing_openwrt.ovpn /etc/openvpn/VPN.ovpn /etc/openvpn/*.ovpn /etc/openvpn/*.conf; do
        [ -f "$f" ] && { echo "$f"; return 0; }
    done
    return 1
}

ovpn_gateway() {
    dev="${1:-tun0}"
    # Prefer kernel connected route (already normalized: 10.28.4.0/22 dev tun0 ...)
    ip -4 route show dev "$dev" scope link 2>/dev/null | awk 'NR==1 {split($1,n,"/"); split(n[1],o,"."); if (o[1]&&o[2]&&o[3]) {print o[1]"."o[2]"."o[3]"."(o[4]+1); exit}}' | grep -m1 . && return 0
    # Fallback from interface address/mask.
    ip -4 -o addr show dev "$dev" 2>/dev/null | awk '{print $4; exit}' | awk -F'[./]' '{a=$1;b=$2;c=$3;p=$5; if (p==22)c=int(c/4)*4; else if(p==23)c=int(c/2)*2; print a"."b"."c".1"}'
}

ensure_policy_rule_config() {
    grep -qE '^[[:space:]]*99[[:space:]]+vpn([[:space:]]|$)' /etc/iproute2/rt_tables 2>/dev/null || echo '99 vpn' >> /etc/iproute2/rt_tables
    # Remove legacy UCI rules. The init/hotplug helper owns persistence.
    while true; do
        idx="$(uci show network 2>/dev/null | sed -n "s/^network\.@rule\[\([0-9]*\)\]\.name='mark0x1'.*/\1/p" | head -n 1)"
        [ -n "$idx" ] || break
        uci -q delete "network.@rule[$idx]" || break
    done
    uci -q delete network.mark0x1
    uci -q delete network.routewolf_mark
    uci commit network >/dev/null 2>&1 || true
    return 0
}

repair_route() {
    ensure_policy_rule_config || { echo "Failed to prepare RouteWolf policy routing"; exit 1; }
    [ -f "$CONF" ] && . "$CONF"
    dev="${VPN_ROUTE_DEV:-}"
    [ -n "$dev" ] || for d in awg0 wg0 tun0 tun1 sbtun0; do ip link show "$d" >/dev/null 2>&1 && { dev="$d"; break; }; done
    [ -n "$dev" ] || { echo "No VPN device found"; exit 1; }
    echo "VPN_ROUTE_DEV='$dev'" > "$CONF"
    case "$dev" in
        tun*)
            gw="$(ovpn_gateway "$dev" | head -n1)"
            [ -n "$gw" ] && echo "VPN_ROUTE_GW='$gw'" >> "$CONF"
        ;;
    esac
    /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 || true
    echo "=== route conf ==="
    cat "$CONF" 2>/dev/null
    echo "=== table vpn ==="
    ip route show table vpn 2>/dev/null
}

dns_redirect_delete() {
    while true; do
        id="$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@redirect\[\([0-9]*\)\]\.name='routewolf_force_dns'\|name='routing_openwrt_force_dns'.*/\1/p" | head -n 1)"
        [ -n "$id" ] || break
        uci -q delete "firewall.@redirect[$id]" || break
    done
}

dns_force_status() {
    if uci show firewall 2>/dev/null | grep -q "name='routewolf_force_dns'\|name='routing_openwrt_force_dns'"; then
        echo "RouteWolf LAN DNS interception: ON"
        uci show firewall 2>/dev/null | grep -A8 -B1 "name='routewolf_force_dns'\|name='routing_openwrt_force_dns'" || true
    else
        echo "RouteWolf LAN DNS interception: OFF"
    fi
}

dns_force_on() {
    lan_ip="$(uci -q get network.lan.ipaddr 2>/dev/null)"
    [ -n "$lan_ip" ] || lan_ip="192.168.1.1"
    dns_redirect_delete
    sec="$(uci add firewall redirect)" || exit 1
    uci set "firewall.$sec.name=routewolf_force_dns" || exit 1
    uci set "firewall.$sec.src=lan" || exit 1
    uci add_list "firewall.$sec.proto=tcp" || exit 1
    uci add_list "firewall.$sec.proto=udp" || exit 1
    uci set "firewall.$sec.src_dport=53" || exit 1
    uci set "firewall.$sec.target=DNAT" || exit 1
    uci set "firewall.$sec.dest_ip=$lan_ip" || exit 1
    uci set "firewall.$sec.dest_port=53" || exit 1
    uci set "firewall.$sec.family=ipv4" || exit 1
    uci commit firewall || exit 1
    /etc/init.d/firewall restart >/dev/null 2>&1 || exit 1
    echo "RouteWolf LAN DNS interception enabled: LAN TCP/UDP 53 -> $lan_ip:53"
    echo "DoH/Private DNS is not intercepted and must be disabled on the client if it bypasses routing lists."
}

dns_force_off() {
    dns_redirect_delete
    uci commit firewall || exit 1
    /etc/init.d/firewall restart >/dev/null 2>&1 || exit 1
    echo "RouteWolf LAN DNS interception disabled"
}

dco_status() {
    cfg="$(find_ovpn_config)" || { echo "OpenVPN config not found"; exit 1; }
    echo "OpenVPN config: $cfg"
    if grep -qE '^[[:space:]]*disable-dco([[:space:]]|$)' "$cfg"; then
        echo "DCO: off (disable-dco present)"
    else
        echo "DCO: on/auto (disable-dco absent)"
    fi
    if command -v opkg >/dev/null 2>&1; then
        opkg list-installed 2>/dev/null | grep -E '^kmod-ovpn-dco|^kmod-ovpn-dco-v2|^openvpn' || true
    elif command -v apk >/dev/null 2>&1; then
        apk list -I 2>/dev/null | grep -E 'ovpn-dco|openvpn' || true
    fi
}

dco_set() {
    mode="$1"
    cfg="$(find_ovpn_config)" || { echo "OpenVPN config not found"; exit 1; }
    cp "$cfg" "/root/$(basename "$cfg").backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
    sed -i '/^[[:space:]]*disable-dco[[:space:]]*$/d' "$cfg"
    if [ "$mode" = "off" ]; then
        printf '\n# routing-openwrt stability\ndisable-dco\n' >> "$cfg"
        echo "DCO disabled in $cfg"
    else
        echo "DCO enabled/auto in $cfg"
    fi
    /etc/init.d/openvpn restart 2>/dev/null || true
    sleep 3
    repair_route
}


cleanup_storage() {
    echo "=== RouteWolf safe cleanup ==="
    rm -rf /tmp/amneziawg /tmp/routewolf-awg-bin /tmp/routewolf-apk-bin         /tmp/routewolf-awg-customfeeds.list.* 2>/dev/null || true
    rm -f /tmp/amneziawg-install.sh /tmp/awg-openwrt-feed.pem         /tmp/awg-openwrt-packages.adb /tmp/routewolf-awg-install.log 2>/dev/null || true

    if command -v apk >/dev/null 2>&1; then
        if [ -f /etc/apk/world ] && grep -Eq '^nano([<>=~].*)?$' /etc/apk/world 2>/dev/null; then
            echo "Removing legacy nano request from APK world..."
            if ! apk del nano >/tmp/routewolf-cleanup.log 2>&1; then
                tmp="/tmp/routewolf-world.$$"
                grep -Ev '^nano([<>=~].*)?$' /etc/apk/world > "$tmp" 2>/dev/null || : > "$tmp"
                cat "$tmp" > /etc/apk/world && rm -f "$tmp"
            fi
        fi
        if [ -e /usr/bin/nano ] && ! apk info -e nano >/dev/null 2>&1; then
            rm -f /usr/bin/nano 2>/dev/null || true
        fi
        apk cache clean >/dev/null 2>&1 || true
    fi
    sync 2>/dev/null || true
    df -h /overlay /tmp 2>/dev/null || df -h / /tmp 2>/dev/null || true
}

case "$1" in
    help|-h|--help|"")
        cat <<'HELP'
rwrt commands:
  rwrt status          show short status
  rwrt diag            run diagnostics
  rwrt load            show router load/resources
  rwrt lists           refresh GitHub lists + restart firewall/dnsmasq
  rwrt repair          repair policy route/table vpn
  rwrt update          update project from GitHub
  rwrt dco status      show OpenVPN DCO state
  rwrt dco off         disable OpenVPN DCO and restart OpenVPN
  rwrt dco on          enable/auto OpenVPN DCO and restart OpenVPN
  rwrt openvpn restart restart OpenVPN and repair route
HELP
    ;;
    status)
        echo "=== routing-openwrt status ==="
        [ -x /usr/sbin/domain-routing-status.sh ] && /usr/sbin/domain-routing-status.sh || true
        echo "=== table vpn ==="; ip route show table vpn 2>/dev/null || true
        echo "=== counters ==="; nft list ruleset 2>/dev/null | grep -E 'mark_domains|mark_subnet' -n || true
    ;;
    diag|diagnose) /usr/sbin/routing-openwrt-diagnose.sh ;;
    load) /usr/sbin/routing-openwrt-load.sh ;;
    lists|refresh)
        /etc/init.d/getdomains start || true
        /etc/init.d/firewall restart >/dev/null 2>&1 || true
        sleep 2
        /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
        repair_route
        wc -l /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst 2>/dev/null || true
    ;;
    repair|route) repair_route ;;
    cleanup) cleanup_storage ;;
    update)
        _rw_tmp="/tmp/routing-openwrt-update.sh"
        if download_url_to_file "https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh" "$_rw_tmp"; then
            sh "$_rw_tmp"
        else
            echo "Failed to download update script over HTTPS." >&2
            return 1
        fi
    ;;
    dns)
        case "$2" in
            status|"") dns_force_status ;;
            on|enable) dns_force_on ;;
            off|disable) dns_force_off ;;
            *) echo "Usage: rw dns on|off|status"; exit 1 ;;
        esac
    ;;
    dco)
        case "$2" in
            status|"") dco_status ;;
            off|disable) dco_set off ;;
            on|enable) dco_set on ;;
            *) echo "Usage: rwrt dco on|off|status"; exit 1 ;;
        esac
    ;;
    openvpn)
        case "$2" in
            restart) /etc/init.d/openvpn restart; sleep 5; repair_route ;;
            *) echo "Usage: rwrt openvpn restart"; exit 1 ;;
        esac
    ;;
    *) echo "Unknown command: $1"; echo "Run: rwrt help"; exit 1 ;;
esac
EOF
    chmod +x /usr/sbin/rwrt
}


update_existing_installation() {
    clear_screen
    echo "routing-openwrt update mode / режим обновления routing-openwrt"
    echo "This updates project scripts, list URLs, cron, firewall marks and cached lists."
    echo "Tunnel configuration is kept. / Конфиг туннеля сохраняется."

    # Detect existing tunnel only for the policy route helper.
    if [ "$(uci -q get network.awg0.proto 2>/dev/null)" = "amneziawg" ]; then
        TUNNEL="awg"
        route_vpn
    elif [ "$(uci -q get network.wg0.proto 2>/dev/null)" = "wireguard" ]; then
        TUNNEL="wg"
        route_vpn
    elif [ -f /etc/domain-routing-route.conf ]; then
        . /etc/domain-routing-route.conf
        case "$VPN_ROUTE_DEV" in
            awg0) TUNNEL="awg"; route_vpn ;;
            wg0) TUNNEL="wg"; route_vpn ;;
            sbtun0) TUNNEL="singbox"; SINGBOX_ROUTE_DEV="sbtun0"; route_vpn ;;
            outline0) TUNNEL="outline"; OUTLINE_ROUTE_DEV="outline0"; route_vpn ;;
            tun*) TUNNEL="ovpn"; OVPN_ROUTE_DEV="$VPN_ROUTE_DEV"; route_vpn ;;
        esac
    else
        echo "Warning: no existing awg0/wg0/tun0 route config found. Lists/firewall will be updated, but tunnel route may need reinstall."
    fi

    if [ -n "${TUNNEL:-}" ] && [ "$TUNNEL" != "0" ]; then
        install_routewolf_watchdog
    fi

    dnsmasqfull
    dnsmasqconfdir
    # DNS redirect is intentionally OFF by default. It can break normal internet checks.
    add_mark || {
        msgc "$C_RED" "Policy rule update failed" "Не удалось обновить правило маршрутизации"
        return 1
    }
    add_set || return 1
    install_management_commands
    add_getdomains update

    echo "Refreshing GitHub lists / Обновляю списки из GitHub..."
    # Drop stale temporary files and old example caches. getdomains will download
    # fresh lists from GitHub and then write new cache files. If GitHub is down,
    # non-example cache can still be restored by getdomains.
    rm -f /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst 2>/dev/null || true
    if [ -f /etc/domain-routing/lists/domains.lst ] && [ "$(wc -l < /etc/domain-routing/lists/domains.lst 2>/dev/null)" -lt 5 ]; then
        rm -f /etc/domain-routing/lists/domains.lst
    fi
    if grep -q '^203\.0\.113\.0/24$' /etc/domain-routing/lists/ipv4.lst 2>/dev/null; then
        rm -f /etc/domain-routing/lists/ipv4.lst
    fi
    /etc/init.d/getdomains start || true
    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    /etc/init.d/vpnroute start >/dev/null 2>&1 || true
    /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 || true

    echo "List counts / Количество строк списков:"
    [ -f /tmp/dnsmasq.d/domains.lst ] && wc -l /tmp/dnsmasq.d/domains.lst || echo "0 /tmp/dnsmasq.d/domains.lst"
    [ -f /tmp/lst/ipv4.lst ] && wc -l /tmp/lst/ipv4.lst || echo "0 /tmp/lst/ipv4.lst"
    if grep -q '^203\.0\.113\.0/24$' /tmp/lst/ipv4.lst 2>/dev/null; then
        echo "ERROR: IPv4 list still contains example TEST-NET 203.0.113.0/24"
    fi

    echo "Update done / Обновление завершено"
    echo "Status command / Проверка: /usr/sbin/domain-routing-status.sh"
    echo "Load check / Проверка нагрузки: /usr/sbin/routing-openwrt-load.sh"
    echo "Quick command / Быстрая команда: rwrt help"
}

add_getdomains() {
    clear_screen
    ui_header "$(prompt "RouteWolf list setup" "Настройка списков RouteWolf")"
    msgc "$C_GREEN" "List source: RouteWolf / Magnat" "Источник списков: RouteWolf / Магнат"
    msg "Domain and IP lists are used only for selective routing." "Списки доменов и IP используются только для выборочной маршрутизации."

    if [ "$1" = "update" ] || [ "$1" = "--update" ] || [ "${ROUTING_OPENWRT_UPDATE_ONLY:-0}" = "1" ]; then
        choose_list_profile update
    else
        choose_list_profile install
    fi

    remove_firewall_section_by_name() {
        type="$1"
        name="$2"
        while true; do
            idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@${type}\[\([0-9]*\)\]\.name='${name}'.*/\1/p" | head -n 1)
            [ -z "$idx" ] && break
            uci -q delete firewall.@${type}[$idx]
        done
    }

    configure_ipv4_cidr_firewall() {
        set_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='vpn_subnets'.*/\1/p" | head -n 1)
        if [ -z "$set_idx" ]; then
            uci add firewall ipset >/dev/null
            uci set firewall.@ipset[-1].name='vpn_subnets'
            uci set firewall.@ipset[-1].match='dst_net'
            uci set firewall.@ipset[-1].loadfile='/tmp/lst/ipv4.lst'
        else
            uci set firewall.@ipset[$set_idx].match='dst_net'
            uci set firewall.@ipset[$set_idx].loadfile='/tmp/lst/ipv4.lst'
        fi

        rule_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='mark_subnet'.*/\1/p" | head -n 1)
        if [ -z "$rule_idx" ]; then
            uci add firewall rule >/dev/null
            uci set firewall.@rule[-1].name='mark_subnet'
            uci set firewall.@rule[-1].src='lan'
            uci set firewall.@rule[-1].dest='*'
            uci set firewall.@rule[-1].proto='all'
            uci set firewall.@rule[-1].ipset='vpn_subnets'
            uci set firewall.@rule[-1].set_mark='0x1'
            uci set firewall.@rule[-1].target='MARK'
            uci set firewall.@rule[-1].family='ipv4'
        else
            uci set firewall.@rule[$rule_idx].src='lan'
            uci set firewall.@rule[$rule_idx].dest='*'
            uci set firewall.@rule[$rule_idx].proto='all'
            uci set firewall.@rule[$rule_idx].ipset='vpn_subnets'
            uci set firewall.@rule[$rule_idx].set_mark='0x1'
            uci set firewall.@rule[$rule_idx].target='MARK'
            uci set firewall.@rule[$rule_idx].family='ipv4'
        fi
        uci commit firewall
    }

    configure_ipv6_domain_firewall() {
        set_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='vpn_domains6'.*/\1/p" | head -n 1)
        if [ -z "$set_idx" ]; then
            uci add firewall ipset >/dev/null
            uci set firewall.@ipset[-1].name='vpn_domains6'
            uci set firewall.@ipset[-1].match='dst_net'
            uci set firewall.@ipset[-1].family='ipv6'
        else
            uci set firewall.@ipset[$set_idx].match='dst_net'
            uci set firewall.@ipset[$set_idx].family='ipv6'
        fi

        rule_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='mark_domains6'.*/\1/p" | head -n 1)
        if [ -z "$rule_idx" ]; then
            uci add firewall rule >/dev/null
            uci set firewall.@rule[-1].name='mark_domains6'
            uci set firewall.@rule[-1].src='lan'
            uci set firewall.@rule[-1].dest='*'
            uci set firewall.@rule[-1].proto='all'
            uci set firewall.@rule[-1].ipset='vpn_domains6'
            uci set firewall.@rule[-1].set_mark='0x1'
            uci set firewall.@rule[-1].target='MARK'
            uci set firewall.@rule[-1].family='ipv6'
        else
            uci set firewall.@rule[$rule_idx].src='lan'
            uci set firewall.@rule[$rule_idx].dest='*'
            uci set firewall.@rule[$rule_idx].proto='all'
            uci set firewall.@rule[$rule_idx].ipset='vpn_domains6'
            uci set firewall.@rule[$rule_idx].set_mark='0x1'
            uci set firewall.@rule[$rule_idx].target='MARK'
            uci set firewall.@rule[$rule_idx].family='ipv6'
        fi
        uci commit firewall
    }

    configure_ipv6_cidr_firewall() {
        set_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='vpn_subnets6'.*/\1/p" | head -n 1)
        if [ -z "$set_idx" ]; then
            uci add firewall ipset >/dev/null
            uci set firewall.@ipset[-1].name='vpn_subnets6'
            uci set firewall.@ipset[-1].match='dst_net'
            uci set firewall.@ipset[-1].family='ipv6'
            uci set firewall.@ipset[-1].loadfile='/tmp/lst/ipv6.lst'
        else
            uci set firewall.@ipset[$set_idx].match='dst_net'
            uci set firewall.@ipset[$set_idx].family='ipv6'
            uci set firewall.@ipset[$set_idx].loadfile='/tmp/lst/ipv6.lst'
        fi

        rule_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='mark_subnet6'.*/\1/p" | head -n 1)
        if [ -z "$rule_idx" ]; then
            uci add firewall rule >/dev/null
            uci set firewall.@rule[-1].name='mark_subnet6'
            uci set firewall.@rule[-1].src='lan'
            uci set firewall.@rule[-1].dest='*'
            uci set firewall.@rule[-1].proto='all'
            uci set firewall.@rule[-1].ipset='vpn_subnets6'
            uci set firewall.@rule[-1].set_mark='0x1'
            uci set firewall.@rule[-1].target='MARK'
            uci set firewall.@rule[-1].family='ipv6'
        else
            uci set firewall.@rule[$rule_idx].src='lan'
            uci set firewall.@rule[$rule_idx].dest='*'
            uci set firewall.@rule[$rule_idx].proto='all'
            uci set firewall.@rule[$rule_idx].ipset='vpn_subnets6'
            uci set firewall.@rule[$rule_idx].set_mark='0x1'
            uci set firewall.@rule[$rule_idx].target='MARK'
            uci set firewall.@rule[$rule_idx].family='ipv6'
        fi
        uci commit firewall
    }

    [ -n "$DOMAINS_URL" ] || echo "Warning: domain list URL is empty / URL списка доменов пустой"

    if [ -n "$IPV4_URL" ]; then
        configure_ipv4_cidr_firewall
    else
        remove_firewall_section_by_name ipset vpn_subnets
        remove_firewall_section_by_name rule mark_subnet
        uci commit firewall
    fi

    if [ "$IPV6_SUPPORT" = "1" ]; then
        uci -q delete dhcp.@dnsmasq[0].filter_aaaa
        uci commit dhcp
        configure_ipv6_domain_firewall
        if [ -n "$IPV6_URL" ]; then
            configure_ipv6_cidr_firewall
        else
            remove_firewall_section_by_name ipset vpn_subnets6
            remove_firewall_section_by_name rule mark_subnet6
            uci commit firewall
        fi
    else
        echo "IPv6 disabled: dnsmasq will filter AAAA answers / IPv6 отключён: dnsmasq будет фильтровать AAAA"
        uci set dhcp.@dnsmasq[0].filter_aaaa='1'
        uci commit dhcp
        remove_firewall_section_by_name ipset vpn_domains6
        remove_firewall_section_by_name rule mark_domains6
        remove_firewall_section_by_name ipset vpn_subnets6
        remove_firewall_section_by_name rule mark_subnet6
        uci commit firewall
        IPV6_URL=""
    fi

    mkdir -p /etc/domain-routing
    cat << EOF > /etc/domain-routing-user.conf
LIST_PROFILE='$LIST_PROFILE'
DOMAINS_URL='$DOMAINS_URL'
IPV4_URL='$IPV4_URL'
IPV6_URL='$IPV6_URL'
IPV6_SUPPORT='$IPV6_SUPPORT'
EOF

    printf "\033[32;1mCreate script /etc/init.d/getdomains\033[0m\n"
cat << 'EOF' > /etc/init.d/getdomains
#!/bin/sh /etc/rc.common

START=99
CACHE_DIR="/etc/domain-routing/lists"
TMP_DNSMASQ_DIR="/tmp/dnsmasq.d"
TMP_LIST_DIR="/tmp/lst"

load_config() {
    [ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf
    DOMAINS_URL=${DOMAINS_URL:-}
    IPV4_URL=${IPV4_URL:-}
    IPV6_URL=${IPV6_URL:-}
    IPV6_SUPPORT=${IPV6_SUPPORT:-0}
}

# Keep this downloader inside /etc/init.d/getdomains.
# The init script runs later under /etc/rc.common and cannot see functions
# from getdomains-install.sh. Older v31 generated getdomains without this
# function, which caused: download_url_to_file: not found.
wget_has_no_check() { wget --help 2>&1 | grep -q -- '--no-check-certificate'; }

download_url_to_file() {
    url="$1"
    out="$2"
    [ -n "$url" ] && [ -n "$out" ] || return 1
    rm -f "$out"

    if [ -x /bin/uclient-fetch ]; then
        /bin/uclient-fetch --no-check-certificate -O "$out" "$url" >/dev/null 2>&1 && [ -s "$out" ] && return 0
        rm -f "$out"
        /bin/uclient-fetch -O "$out" "$url" && [ -s "$out" ] && return 0
        rm -f "$out"
    fi

    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch --no-check-certificate -O "$out" "$url" >/dev/null 2>&1 && [ -s "$out" ] && return 0
        rm -f "$out"
        uclient-fetch -O "$out" "$url" && [ -s "$out" ] && return 0
        rm -f "$out"
    fi

    if command -v curl >/dev/null 2>&1; then
        curl -kfsSL --connect-timeout 15 --max-time 180 --retry 2 "$url" -o "$out" 2>/dev/null && [ -s "$out" ] && return 0
        rm -f "$out"
    fi

    if command -v wget >/dev/null 2>&1; then
        if wget_has_no_check; then
            wget --no-check-certificate -O "$out" "$url" && [ -s "$out" ] && return 0
        else
            wget -O "$out" "$url" && [ -s "$out" ] && return 0
        fi
        rm -f "$out"
    fi

    return 1
}

restore_cache() {
    cache="$1"; out="$2"; label="$3"
    # Cache may intentionally be empty when the GitHub list is empty.
    # /tmp is cleared on reboot, so restore even zero-byte cache files.
    if [ -e "$cache" ]; then
        cp "$cache" "$out"
        echo "Restored cached $label list"
    fi
}

download_file() {
    url="$1"; tmp="$2"; label="$3"
    [ -z "$url" ] && return 1
    echo "Downloading $label from $url"
    download_url_to_file "$url" "$tmp"
}

validate_domain_list() {
    file="$1"
    [ -f "$file" ] || return 1
    # Empty list is valid: it means "route nothing by domain".
    # This allows removing domains from GitHub and having them removed on the router.
    [ -s "$file" ] || return 0
    dnsmasq --conf-file="$file" --test 2>&1 | grep -q "syntax check OK"
}

normalize_domain_list() {
    raw="$1"; out="$2"
    clean="$raw.clean"
    tr -d '\r' < "$raw" > "$clean"

    # If the file already contains dnsmasq-style tokens, split them into one directive per line.
    # This fixes GitHub files where nftset=/... entries were pasted in a single space-separated line.
    if grep -Eq '(^|[[:space:]])(nftset|ipset|server)=/' "$clean"; then
        awk -v ipv6="$IPV6_SUPPORT" '
            {
                sub(/[[:space:]]#.*$/, "", $0)
                for (i=1; i<=NF; i++) {
                    token=$i
                    if (token ~ /^(nftset|ipset|server)=\//) {
                        print token
                        if (ipv6 == "1" && token ~ /^nftset=\/.+\/4#inet#fw4#vpn_domains$/) {
                            t=token
                            sub(/\/4#inet#fw4#vpn_domains$/, "/6#inet#fw4#vpn_domains6", t)
                            print t
                        }
                    }
                }
            }
        ' "$clean" | sort -u > "$out"
        rm -f "$clean"
        [ -f "$out" ]
        return $?
    fi

    # Otherwise treat it as a simple domain list. It may be line-separated, comma-separated or space-separated.
    awk -v ipv6="$IPV6_SUPPORT" '
        {
            line=$0
            sub(/[[:space:]]#.*$/, "", line)
            gsub(/,/, " ", line)
            n=split(line, a, /[[:space:]]+/)
            for (i=1; i<=n; i++) {
                d=tolower(a[i])
                gsub(/^https?:\/\//, "", d)
                gsub(/^\/\//, "", d)
                sub(/\/.*$/, "", d)
                sub(/:.*/, "", d)
                gsub(/^\*\./, "", d)
                gsub(/^\./, "", d)
                if (d ~ /^[a-z0-9]([a-z0-9-]*\.)+[a-z0-9-]+$/) {
                    print "nftset=/"d"/4#inet#fw4#vpn_domains"
                    if (ipv6 == "1") print "nftset=/"d"/6#inet#fw4#vpn_domains6"
                }
            }
        }
    ' "$clean" | sort -u > "$out"
    rm -f "$clean"
    [ -f "$out" ]
}

normalize_ipv4_cidr_list() {
    raw="$1"; out="$2"
    tr -d '\r' < "$raw" | awk '
        {
            sub(/[[:space:]]#.*$/, "", $0)
            gsub(/,/, " ", $0)
            for (i=1; i<=NF; i++) {
                t=$i
                if (t ~ /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/[0-9]{1,2})?$/) print t
            }
        }
    ' | sort -u > "$out"
    [ -f "$out" ]
}

normalize_ipv6_cidr_list() {
    raw="$1"; out="$2"
    tr -d '\r' < "$raw" | awk '
        {
            sub(/[[:space:]]#.*$/, "", $0)
            gsub(/,/, " ", $0)
            for (i=1; i<=NF; i++) {
                t=tolower($i)
                if (t ~ /^[0-9a-f:]+(\/[0-9]{1,3})?$/ && t ~ /:/) print t
            }
        }
    ' | sort -u > "$out"
    [ -f "$out" ]
}

start () {
    load_config
    mkdir -p "$TMP_DNSMASQ_DIR" "$TMP_LIST_DIR" "$CACHE_DIR"

    # /tmp is cleared on reboot. Restore the last known good lists first,
    # then try to update from GitHub. If GitHub/DNS is unavailable at boot,
    # routing still works with the cached lists.
    restore_cache "$CACHE_DIR/domains.lst" "$TMP_DNSMASQ_DIR/domains.lst" domains
    restore_cache "$CACHE_DIR/ipv4.lst" "$TMP_LIST_DIR/ipv4.lst" ipv4
    restore_cache "$CACHE_DIR/ipv6.lst" "$TMP_LIST_DIR/ipv6.lst" ipv6

    if [ -n "$DOMAINS_URL" ]; then
        if download_file "$DOMAINS_URL" "$TMP_DNSMASQ_DIR/domains.raw" domains; then
            if normalize_domain_list "$TMP_DNSMASQ_DIR/domains.raw" "$TMP_DNSMASQ_DIR/domains.lst.new" && validate_domain_list "$TMP_DNSMASQ_DIR/domains.lst.new"; then
                mv "$TMP_DNSMASQ_DIR/domains.lst.new" "$TMP_DNSMASQ_DIR/domains.lst"
                cp "$TMP_DNSMASQ_DIR/domains.lst" "$CACHE_DIR/domains.lst"
                echo "Domain list is ready: $(wc -l < "$TMP_DNSMASQ_DIR/domains.lst") entries"
            else
                echo "Warning: downloaded domain list is invalid after conversion; keeping cached list"
                rm -f "$TMP_DNSMASQ_DIR/domains.lst.new"
            fi
            rm -f "$TMP_DNSMASQ_DIR/domains.raw"
        else
            echo "Warning: failed to download domain list; using cached list if available"
            rm -f "$TMP_DNSMASQ_DIR/domains.raw" "$TMP_DNSMASQ_DIR/domains.lst.new"
        fi
    fi

    if [ -f "$TMP_DNSMASQ_DIR/domains.lst" ]; then
        if validate_domain_list "$TMP_DNSMASQ_DIR/domains.lst"; then
            /etc/init.d/dnsmasq restart
        else
            echo "Warning: cached domain list is invalid; removing temporary copy and keeping dnsmasq running without it"
            rm -f "$TMP_DNSMASQ_DIR/domains.lst"
        fi
    fi

    if [ -n "$IPV4_URL" ]; then
        if download_file "$IPV4_URL" "$TMP_LIST_DIR/ipv4.raw" ipv4; then
            if normalize_ipv4_cidr_list "$TMP_LIST_DIR/ipv4.raw" "$TMP_LIST_DIR/ipv4.lst.new"; then
                mv "$TMP_LIST_DIR/ipv4.lst.new" "$TMP_LIST_DIR/ipv4.lst"
                cp "$TMP_LIST_DIR/ipv4.lst" "$CACHE_DIR/ipv4.lst"
                echo "IPv4 CIDR list is ready: $(wc -l < "$TMP_LIST_DIR/ipv4.lst") entries"
            else
                echo "Warning: IPv4 list is invalid after conversion; using cached list if available"
                rm -f "$TMP_LIST_DIR/ipv4.lst.new"
            fi
            rm -f "$TMP_LIST_DIR/ipv4.raw"
        else
            echo "Warning: IPv4 list download failed; using cached list if available"
            rm -f "$TMP_LIST_DIR/ipv4.raw" "$TMP_LIST_DIR/ipv4.lst.new"
        fi
        [ -e "$TMP_LIST_DIR/ipv4.lst" ] || : > "$TMP_LIST_DIR/ipv4.lst"
    fi

    if [ "$IPV6_SUPPORT" = "1" ] && [ -n "$IPV6_URL" ]; then
        if download_file "$IPV6_URL" "$TMP_LIST_DIR/ipv6.raw" ipv6; then
            if normalize_ipv6_cidr_list "$TMP_LIST_DIR/ipv6.raw" "$TMP_LIST_DIR/ipv6.lst.new"; then
                mv "$TMP_LIST_DIR/ipv6.lst.new" "$TMP_LIST_DIR/ipv6.lst"
                cp "$TMP_LIST_DIR/ipv6.lst" "$CACHE_DIR/ipv6.lst"
                echo "IPv6 CIDR list is ready: $(wc -l < "$TMP_LIST_DIR/ipv6.lst") entries"
            else
                echo "Warning: IPv6 list is invalid after conversion; using cached list if available"
                rm -f "$TMP_LIST_DIR/ipv6.lst.new"
            fi
            rm -f "$TMP_LIST_DIR/ipv6.raw"
        else
            echo "Warning: IPv6 list download failed; using cached list if available"
            rm -f "$TMP_LIST_DIR/ipv6.raw" "$TMP_LIST_DIR/ipv6.lst.new"
        fi
        [ -e "$TMP_LIST_DIR/ipv6.lst" ] || : > "$TMP_LIST_DIR/ipv6.lst"
    fi

    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    /etc/init.d/vpnroute start >/dev/null 2>&1 || true
}
EOF

    chmod +x /etc/init.d/getdomains
    /etc/init.d/getdomains enable

    sed -i '/getdomains start/d;/routing-openwrt-healthcheck/d' /etc/crontabs/root 2>/dev/null || true
    echo "0 2 * * * /etc/init.d/getdomains start" >> /etc/crontabs/root
    echo "15 3 * * * /usr/sbin/routing-openwrt-healthcheck.sh" >> /etc/crontabs/root
    /etc/init.d/cron enable
    /etc/init.d/cron restart

    /etc/init.d/getdomains start
}

add_internal_wg() {
    PROTOCOL_NAME=$1
    printf "\033[32;1mConfigure ${PROTOCOL_NAME}\033[0m\n"
    if [ "$PROTOCOL_NAME" = 'Wireguard' ]; then
        INTERFACE_NAME="wg1"
        CONFIG_NAME="wireguard_wg1"
        PROTO="wireguard"
        ZONE_NAME="wg_internal"

        if pkg_is_installed wireguard-tools; then
            echo "Wireguard already installed"
        else
            echo "Installed wg..."
            pkg_install wireguard-tools
        fi
    fi

    if [ "$PROTOCOL_NAME" = 'AmneziaWG' ]; then
        INTERFACE_NAME="awg1"
        CONFIG_NAME="amneziawg_awg1"
        PROTO="amneziawg"
        ZONE_NAME="awg_internal"

        install_awg_packages || return 1
    fi

    read -r -p "Enter the private key (from [Interface]):"$'\n' WG_PRIVATE_KEY_INT

    while true; do
        read -r -p "Enter internal IP address with subnet, example 192.168.100.5/24 (from [Interface]):"$'\n' WG_IP
        if echo "$WG_IP" | egrep -oq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]+$'; then
            break
        else
            echo "This IP is not valid. Please repeat"
        fi
    done

    read -r -p "Enter the public key (from [Peer]):"$'\n' WG_PUBLIC_KEY_INT
    read -r -p "If use PresharedKey, Enter this (from [Peer]). If your don't use leave blank:"$'\n' WG_PRESHARED_KEY_INT
    read -r -p "Enter Endpoint host without port (Domain or IP) (from [Peer]):"$'\n' WG_ENDPOINT_INT

    read -r -p "Enter Endpoint host port (from [Peer]) [51820]:"$'\n' WG_ENDPOINT_PORT_INT
    WG_ENDPOINT_PORT_INT=${WG_ENDPOINT_PORT_INT:-51820}
    if [ "$WG_ENDPOINT_PORT_INT" = '51820' ]; then
        echo $WG_ENDPOINT_PORT_INT
    fi

    if [ "$PROTOCOL_NAME" = 'AmneziaWG' ]; then
        read -r -p "Enter Jc value (from [Interface]):"$'\n' AWG_JC
        read -r -p "Enter Jmin value (from [Interface]):"$'\n' AWG_JMIN
        read -r -p "Enter Jmax value (from [Interface]):"$'\n' AWG_JMAX
        read -r -p "Enter S1 value (from [Interface]):"$'\n' AWG_S1
        read -r -p "Enter S2 value (from [Interface]):"$'\n' AWG_S2
        read -r -p "Enter H1 value (from [Interface]):"$'\n' AWG_H1
        read -r -p "Enter H2 value (from [Interface]):"$'\n' AWG_H2
        read -r -p "Enter H3 value (from [Interface]):"$'\n' AWG_H3
        read -r -p "Enter H4 value (from [Interface]):"$'\n' AWG_H4
    fi
    
    uci set network.${INTERFACE_NAME}=interface
    uci set network.${INTERFACE_NAME}.proto=$PROTO
    uci set network.${INTERFACE_NAME}.private_key=$WG_PRIVATE_KEY_INT
    uci set network.${INTERFACE_NAME}.listen_port='51821'
    uci set network.${INTERFACE_NAME}.addresses=$WG_IP

    if [ "$PROTOCOL_NAME" = 'AmneziaWG' ]; then
        uci set network.${INTERFACE_NAME}.awg_jc=$AWG_JC
        uci set network.${INTERFACE_NAME}.awg_jmin=$AWG_JMIN
        uci set network.${INTERFACE_NAME}.awg_jmax=$AWG_JMAX
        uci set network.${INTERFACE_NAME}.awg_s1=$AWG_S1
        uci set network.${INTERFACE_NAME}.awg_s2=$AWG_S2
        uci set network.${INTERFACE_NAME}.awg_h1=$AWG_H1
        uci set network.${INTERFACE_NAME}.awg_h2=$AWG_H2
        uci set network.${INTERFACE_NAME}.awg_h3=$AWG_H3
        uci set network.${INTERFACE_NAME}.awg_h4=$AWG_H4
    fi

    if ! uci show network | grep -q ${CONFIG_NAME}; then
        uci add network ${CONFIG_NAME}
    fi

    uci set network.@${CONFIG_NAME}[0]=$CONFIG_NAME
    uci set network.@${CONFIG_NAME}[0].name="${INTERFACE_NAME}_client"
    uci set network.@${CONFIG_NAME}[0].public_key=$WG_PUBLIC_KEY_INT
    uci set network.@${CONFIG_NAME}[0].preshared_key=$WG_PRESHARED_KEY_INT
    uci set network.@${CONFIG_NAME}[0].route_allowed_ips='0'
    uci set network.@${CONFIG_NAME}[0].persistent_keepalive='25'
    uci set network.@${CONFIG_NAME}[0].endpoint_host=$WG_ENDPOINT_INT
    uci set network.@${CONFIG_NAME}[0].allowed_ips='0.0.0.0/0'
    uci set network.@${CONFIG_NAME}[0].endpoint_port=$WG_ENDPOINT_PORT_INT
    uci commit network

    grep -q "110 vpninternal" /etc/iproute2/rt_tables || echo '110 vpninternal' >> /etc/iproute2/rt_tables

    # Deterministic named UCI rule; avoids anonymous @rule[-1] failures.
    delete_uci_sections_by_name network rule mark0x2
    uci -q delete network.mark0x2
    uci -q delete network.routewolf_internal_mark
    printf "\033[32;1mConfigure internal policy rule\033[0m\n"
    uci set network.routewolf_internal_mark='rule' || return 1
    uci set network.routewolf_internal_mark.mark='0x2/0x2' || return 1
    uci set network.routewolf_internal_mark.priority='110' || return 1
    uci set network.routewolf_internal_mark.lookup='110' || return 1
    uci commit network || return 1

    if ! uci show network | grep -q vpn_route_internal; then
        printf "\033[32;1mAdd route\033[0m\n"
        uci set network.vpn_route_internal=route
        uci set network.vpn_route_internal.name='vpninternal'
        uci set network.vpn_route_internal.interface=$INTERFACE_NAME
        uci set network.vpn_route_internal.table='vpninternal'
        uci set network.vpn_route_internal.target='0.0.0.0/0'
        uci commit network
    fi

    if ! uci show firewall | grep -q "@zone.*name='${ZONE_NAME}'"; then
        printf "\033[32;1mZone Create\033[0m\n"
        uci add firewall zone
        uci set firewall.@zone[-1].name=$ZONE_NAME
        uci set firewall.@zone[-1].network=$INTERFACE_NAME
        uci set firewall.@zone[-1].forward='REJECT'
        uci set firewall.@zone[-1].output='ACCEPT'
        uci set firewall.@zone[-1].input='REJECT'
        uci set firewall.@zone[-1].masq='1'
        uci set firewall.@zone[-1].mtu_fix='1'
        uci set firewall.@zone[-1].family='ipv4'
        uci commit firewall
    fi

    if ! uci show firewall | grep -q "@forwarding.*name='${ZONE_NAME}'"; then
        printf "\033[32;1mConfigured forwarding\033[0m\n"
        uci add firewall forwarding
        uci set firewall.@forwarding[-1]=forwarding
        uci set firewall.@forwarding[-1].name="${ZONE_NAME}-lan"
        uci set firewall.@forwarding[-1].dest=${ZONE_NAME}
        uci set firewall.@forwarding[-1].src='lan'
        uci set firewall.@forwarding[-1].family='ipv4'
        uci commit firewall
    fi

    if uci show firewall | grep -q "@ipset.*name='vpn_domains_internal'"; then
        printf "\033[32;1mSet already exist\033[0m\n"
    else
        printf "\033[32;1mCreate set\033[0m\n"
        uci add firewall ipset
        uci set firewall.@ipset[-1].name='vpn_domains_internal'
        uci set firewall.@ipset[-1].match='dst_net'
        uci commit firewall
    fi

    if uci show firewall | grep -q "@rule.*name='mark_domains_intenal'"; then
        printf "\033[32;1mRule for set already exist\033[0m\n"
    else
        printf "\033[32;1mCreate rule set\033[0m\n"
        uci add firewall rule
        uci set firewall.@rule[-1]=rule
        uci set firewall.@rule[-1].name='mark_domains_intenal'
        uci set firewall.@rule[-1].src='lan'
        uci set firewall.@rule[-1].dest='*'
        uci set firewall.@rule[-1].proto='all'
        uci set firewall.@rule[-1].ipset='vpn_domains_internal'
        uci set firewall.@rule[-1].set_mark='0x2'
        uci set firewall.@rule[-1].target='MARK'
        uci set firewall.@rule[-1].family='ipv4'
        uci commit firewall
    fi

    if uci show dhcp | grep -q "@ipset.*name='vpn_domains_internal'"; then
        printf "\033[32;1mDomain on vpn_domains_internal already exist\033[0m\n"
    else
        printf "\033[32;1mCreate domain for vpn_domains_internal\033[0m\n"
        uci add dhcp ipset
        uci add_list dhcp.@ipset[-1].name='vpn_domains_internal'
        uci add_list dhcp.@ipset[-1].domain='youtube.com'
        uci add_list dhcp.@ipset[-1].domain='googlevideo.com'
        uci add_list dhcp.@ipset[-1].domain='youtubekids.com'
        uci add_list dhcp.@ipset[-1].domain='googleapis.com'
        uci add_list dhcp.@ipset[-1].domain='ytimg.com'
        uci add_list dhcp.@ipset[-1].domain='ggpht.com'
        uci commit dhcp
    fi

    sed -i "/done/a sed -i '/youtube.com\\\|ytimg.com\\\|ggpht.com\\\|googlevideo.com\\\|googleapis.com\\\|youtubekids.com/d' /tmp/dnsmasq.d/domains.lst" "/etc/init.d/getdomains"

    service dnsmasq restart
    service network restart

    exit 0
}

install_awg_packages() {
    AWG_INSTALLER_URL="https://raw.githubusercontent.com/Slava-Shchipunov/awg-openwrt/refs/heads/master/amneziawg-install.sh"
    AWG_INSTALLER="/tmp/amneziawg-install.sh"
    AWG_FEED_ROOT="https://slava-shchipunov.github.io/awg-openwrt"
    AWG_FEED_KEY_URL="${AWG_FEED_ROOT}/keys/awg-openwrt-feed.pem"
    AWG_LOG="/tmp/routewolf-awg-install.log"

    detect_pkg_manager

    awg_openwrt_version() {
        _v="$(ubus call system board 2>/dev/null | jsonfilter -e '@.release.version' 2>/dev/null)"
        [ -n "$_v" ] || _v="$(sed -n "s/^DISTRIB_RELEASE='\([^']*\)'.*/\1/p" /etc/openwrt_release 2>/dev/null)"
        _v="${_v%%-*}"
        printf '%s\n' "$_v"
    }

    awg_openwrt_target() {
        _t="$(ubus call system board 2>/dev/null | jsonfilter -e '@.release.target' 2>/dev/null)"
        [ -n "$_t" ] || _t="$(sed -n "s/^DISTRIB_TARGET='\([^']*\)'.*/\1/p" /etc/openwrt_release 2>/dev/null)"
        printf '%s\n' "$_t"
    }

    awg_already_installed() {
        if command -v awg >/dev/null 2>&1 && \
           { [ -f /lib/netifd/proto/amneziawg.sh ] || [ -f /lib/netifd/proto/awg.sh ]; }; then
            return 0
        fi
        if pkg_is_installed amneziawg-tools && pkg_is_installed kmod-amneziawg && \
           { [ -f /lib/netifd/proto/amneziawg.sh ] || [ -f /lib/netifd/proto/awg.sh ] || pkg_is_installed luci-proto-amneziawg; }; then
            return 0
        fi
        return 1
    }

    awg_verify_install() {
        command -v awg >/dev/null 2>&1 || return 1
        pkg_is_installed amneziawg-tools || return 1
        pkg_is_installed kmod-amneziawg || return 1
        [ -f /lib/netifd/proto/amneziawg.sh ] || \
        [ -f /lib/netifd/proto/awg.sh ] || \
        pkg_is_installed luci-proto-amneziawg || return 1
        return 0
    }

    awg_restore_apk_repo() {
        if [ "${AWG_REPO_EXISTED:-0}" = "1" ] && [ -f "${AWG_REPO_BACKUP:-}" ]; then
            cp "$AWG_REPO_BACKUP" "$AWG_REPO_FILE" 2>/dev/null || true
        elif [ "${AWG_REPO_EXISTED:-0}" = "0" ]; then
            rm -f "$AWG_REPO_FILE"
        fi
    }

    install_awg_with_apk_feed() {
        prepare_install_storage || return 1
        AWG_OWRT_VERSION="$(awg_openwrt_version)"
        AWG_OWRT_TARGET="$(awg_openwrt_target)"

        if [ -z "$AWG_OWRT_VERSION" ] || [ -z "$AWG_OWRT_TARGET" ]; then
            msgc "$C_RED" \
                "Cannot determine the exact OpenWrt version or target/subtarget." \
                "Не удалось определить точную версию OpenWrt или target/subtarget."
            return 1
        fi

        case "$AWG_OWRT_TARGET" in
            */*) ;;
            *)
                msgc "$C_RED" \
                    "Unexpected OpenWrt target: $AWG_OWRT_TARGET" \
                    "Некорректный target OpenWrt: $AWG_OWRT_TARGET"
                return 1
                ;;
        esac

        AWG_FEED_URL="${AWG_FEED_ROOT}/${AWG_OWRT_VERSION}/${AWG_OWRT_TARGET}/packages.adb"
        AWG_TMP_KEY="/tmp/awg-openwrt-feed.pem"
        AWG_TMP_INDEX="/tmp/awg-openwrt-packages.adb"
        rm -f "$AWG_TMP_KEY" "$AWG_TMP_INDEX"

        msgc "$C_BLUE" \
            "OpenWrt $AWG_OWRT_VERSION uses APK. Checking the official AmneziaWG APK feed..." \
            "OpenWrt $AWG_OWRT_VERSION использует APK. Проверка официального APK-репозитория AmneziaWG..."

        if ! download_url_to_file "$AWG_FEED_KEY_URL" "$AWG_TMP_KEY" || [ ! -s "$AWG_TMP_KEY" ]; then
            msgc "$C_RED" \
                "Failed to download the official AmneziaWG APK signing key." \
                "Не удалось скачать официальный ключ подписи APK AmneziaWG."
            return 1
        fi

        if ! download_url_to_file "$AWG_FEED_URL" "$AWG_TMP_INDEX" || [ ! -s "$AWG_TMP_INDEX" ]; then
            msgc "$C_RED" \
                "No official AmneziaWG APK feed was found for $AWG_OWRT_VERSION / $AWG_OWRT_TARGET." \
                "Официальный APK-репозиторий AmneziaWG для $AWG_OWRT_VERSION / $AWG_OWRT_TARGET не найден."
            msg "Feed checked: $AWG_FEED_URL" "Проверенный репозиторий: $AWG_FEED_URL"
            return 1
        fi

        mkdir -p /etc/apk/keys /etc/apk/repositories.d || return 1
        cp "$AWG_TMP_KEY" /etc/apk/keys/awg-openwrt-feed.pem || return 1
        chmod 644 /etc/apk/keys/awg-openwrt-feed.pem 2>/dev/null || true

        AWG_REPO_FILE="/etc/apk/repositories.d/customfeeds.list"
        AWG_REPO_BACKUP="/tmp/routewolf-awg-customfeeds.list.backup.$$"
        AWG_REPO_EXISTED=0
        if [ -f "$AWG_REPO_FILE" ]; then
            AWG_REPO_EXISTED=1
            cp "$AWG_REPO_FILE" "$AWG_REPO_BACKUP" || return 1
        fi

        AWG_REPO_TMP="/tmp/routewolf-awg-customfeeds.list.$$"
        if [ -f "$AWG_REPO_FILE" ]; then
            grep -v 'slava-shchipunov.github.io/awg-openwrt/' "$AWG_REPO_FILE" > "$AWG_REPO_TMP" 2>/dev/null || true
        else
            : > "$AWG_REPO_TMP"
        fi
        printf '%s\n' "$AWG_FEED_URL" >> "$AWG_REPO_TMP"
        mv "$AWG_REPO_TMP" "$AWG_REPO_FILE" || return 1

        : > "$AWG_LOG"
        if ! apk_run update >>"$AWG_LOG" 2>&1; then
            awg_restore_apk_repo
            msgc "$C_RED" \
                "APK could not update the official AmneziaWG feed." \
                "APK не смог обновить официальный репозиторий AmneziaWG."
            tail -n 30 "$AWG_LOG" 2>/dev/null || true
            return 1
        fi

        # Install the required packages one by one. This keeps each transaction
        # small and avoids a large temporary extraction on 16 MB devices.
        # A stale nano entry from an older failed RouteWolf run is removed by
        # prepare_install_storage before the first APK transaction.
        for AWG_PKG in kmod-amneziawg amneziawg-tools luci-proto-amneziawg; do
            if pkg_is_installed "$AWG_PKG"; then
                msgc "$C_GREEN" "$AWG_PKG is already installed" "$AWG_PKG уже установлен"
                continue
            fi

            AWG_FREE_KB="$(routewolf_free_kb)"
            [ -n "$AWG_FREE_KB" ] || AWG_FREE_KB=0
            if [ "$AWG_FREE_KB" -lt 1024 ] 2>/dev/null; then
                awg_restore_apk_repo
                msgc "$C_RED" \
                    "Less than 1 MB remains before installing $AWG_PKG. Installation stopped safely." \
                    "Перед установкой $AWG_PKG осталось меньше 1 МБ. Установка безопасно остановлена."
                return 1
            fi

            msgc "$C_BLUE" "Installing $AWG_PKG..." "Установка $AWG_PKG..."
            if ! apk_run add "$AWG_PKG" >>"$AWG_LOG" 2>&1; then
                awg_restore_apk_repo
                msgc "$C_RED" \
                    "Installation of $AWG_PKG failed." \
                    "Установка $AWG_PKG завершилась ошибкой."
                tail -n 30 "$AWG_LOG" 2>/dev/null || true
                msg \
                    "Choose the safe cleanup option on the next run if the error mentions no space or an old package such as nano." \
                    "При следующем запуске выберите безопасную очистку, если ошибка связана с нехваткой места или старым пакетом nano."
                return 1
            fi
            apk_run cache clean >/dev/null 2>&1 || true
        done

        # Translation is optional and is skipped on small flash. The RouteWolf
        # installer itself remains fully translated regardless of this package.
        AWG_TOTAL_KB="$(routewolf_total_kb)"
        AWG_FREE_KB="$(routewolf_free_kb)"
        [ -n "$AWG_TOTAL_KB" ] || AWG_TOTAL_KB=0
        [ -n "$AWG_FREE_KB" ] || AWG_FREE_KB=0
        if is_ru && [ "$AWG_TOTAL_KB" -gt 32768 ] 2>/dev/null && [ "$AWG_FREE_KB" -gt 4096 ] 2>/dev/null; then
            apk_run add luci-i18n-amneziawg-ru >>"$AWG_LOG" 2>&1 || true
            apk_run cache clean >/dev/null 2>&1 || true
        elif is_ru; then
            msgc "$C_YELLOW" \
                "The optional LuCI Russian translation was skipped to preserve flash space." \
                "Необязательный русский перевод LuCI пропущен для экономии flash-памяти."
        fi

        if ! awg_verify_install; then
            msgc "$C_RED" \
                "APK finished, but the AmneziaWG command/module/protocol was not detected." \
                "APK завершил работу, но команда, модуль или протокол AmneziaWG не обнаружены."
            tail -n 30 "$AWG_LOG" 2>/dev/null || true
            return 1
        fi

        mkdir -p /etc/routewolf
        printf '%s\n' "apk-feed $AWG_OWRT_VERSION $AWG_OWRT_TARGET" > /etc/routewolf/awg-package-source
        rm -f "$AWG_TMP_KEY" "$AWG_TMP_INDEX" "$AWG_REPO_BACKUP"
        return 0
    }

    create_awg_curl_wget_wrapper() {
        mkdir -p /tmp/routewolf-awg-bin || return 1
        cat > /tmp/routewolf-awg-bin/wget <<'ROUTEWOLF_AWG_WGET_EOF'
#!/bin/sh
out="-"
timeout="180"
insecure="0"
url=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        -O) shift; out="$1" ;;
        -T) shift; timeout="$1" ;;
        -q|--quiet) ;;
        --no-check-certificate) insecure="1" ;;
        --timeout=*) timeout="${1#*=}" ;;
        --) shift; url="$1"; break ;;
        -*) ;;
        *) url="$1" ;;
    esac
    shift
done
[ -n "$url" ] || exit 2
set -- -fL --connect-timeout "$timeout" --max-time "$timeout" --retry 2
[ "$insecure" = "1" ] && set -- "$@" -k
if [ "$out" = "-" ]; then
    exec curl "$@" "$url"
else
    exec curl "$@" -o "$out" "$url"
fi
ROUTEWOLF_AWG_WGET_EOF
        chmod 755 /tmp/routewolf-awg-bin/wget
    }

    prepare_awg_ipk_downloader() {
        AWG_SAFE_PATH="$PATH"
        rm -rf /tmp/routewolf-awg-bin
        mkdir -p /tmp/routewolf-awg-bin || return 1

        if [ -x /bin/uclient-fetch ]; then
            ln -sf /bin/uclient-fetch /tmp/routewolf-awg-bin/wget || return 1
            AWG_SAFE_PATH="/tmp/routewolf-awg-bin:$PATH"
            return 0
        fi
        if command -v uclient-fetch >/dev/null 2>&1; then
            ln -sf "$(command -v uclient-fetch)" /tmp/routewolf-awg-bin/wget || return 1
            AWG_SAFE_PATH="/tmp/routewolf-awg-bin:$PATH"
            return 0
        fi
        if command -v curl >/dev/null 2>&1; then
            create_awg_curl_wget_wrapper || return 1
            AWG_SAFE_PATH="/tmp/routewolf-awg-bin:$PATH"
            return 0
        fi
        if command -v wget >/dev/null 2>&1; then
            return 0
        fi
        return 1
    }

    install_awg_with_ipk_release() {
        AWG_OWRT_VERSION="$(awg_openwrt_version)"
        AWG_OWRT_TARGET="$(awg_openwrt_target)"
        msgc "$C_BLUE" \
            "OpenWrt $AWG_OWRT_VERSION uses OPKG. Installing official IPK packages for $AWG_OWRT_TARGET..." \
            "OpenWrt $AWG_OWRT_VERSION использует OPKG. Установка официальных IPK-пакетов для $AWG_OWRT_TARGET..."

        if ! download_url_to_file "$AWG_INSTALLER_URL" "$AWG_INSTALLER" || [ ! -s "$AWG_INSTALLER" ]; then
            msgc "$C_RED" \
                "Failed to download the official AmneziaWG IPK installer." \
                "Не удалось скачать официальный установщик IPK AmneziaWG."
            return 1
        fi

        if ! prepare_awg_ipk_downloader; then
            msgc "$C_RED" \
                "No HTTPS-capable downloader is available for the official IPK installer." \
                "Нет HTTPS-загрузчика для официального установщика IPK."
            return 1
        fi

        : > "$AWG_LOG"
        env PATH="$AWG_SAFE_PATH" sh "$AWG_INSTALLER" -en >"$AWG_LOG" 2>&1
        AWG_RC="$?"
        if [ "$AWG_RC" -ne 0 ]; then
            env PATH="$AWG_SAFE_PATH" sh "$AWG_INSTALLER" -n >"$AWG_LOG" 2>&1
            AWG_RC="$?"
        fi

        if [ "$AWG_RC" -ne 0 ] || ! awg_verify_install; then
            msgc "$C_RED" \
                "Installation of official AmneziaWG IPK packages failed." \
                "Установка официальных IPK-пакетов AmneziaWG завершилась ошибкой."
            tail -n 30 "$AWG_LOG" 2>/dev/null || true
            msg \
                "The exact OpenWrt release and target must have matching packages in the official awg-openwrt GitHub release." \
                "Для точной версии OpenWrt и target должны существовать соответствующие пакеты в официальном релизе awg-openwrt."
            return 1
        fi

        mkdir -p /etc/routewolf
        printf '%s\n' "ipk-release $AWG_OWRT_VERSION $AWG_OWRT_TARGET" > /etc/routewolf/awg-package-source
        return 0
    }

    if awg_already_installed; then
        msgc "$C_GREEN" \
            "AmneziaWG packages are already installed; package installation is skipped." \
            "Пакеты AmneziaWG уже установлены; установка пакетов пропускается."
        AWG_VERSION="2.0"
        return 0
    fi

    msgc "$C_BLUE" "Installing AmneziaWG packages..." "Установка пакетов AmneziaWG..."

    case "$PKG_MANAGER" in
        apk)
            install_awg_with_apk_feed || return 1
            ;;
        opkg)
            install_awg_with_ipk_release || return 1
            ;;
        *)
            msgc "$C_RED" "Unsupported package manager: $PKG_MANAGER" "Неподдерживаемый пакетный менеджер: $PKG_MANAGER"
            return 1
            ;;
    esac

    VERSION="$(awg_openwrt_version)"
    MAJOR_VERSION="$(echo "$VERSION" | cut -d '.' -f 1)"
    MINOR_VERSION="$(echo "$VERSION" | cut -d '.' -f 2)"
    PATCH_VERSION="$(echo "$VERSION" | cut -d '.' -f 3)"
    AWG_VERSION="1.0"
    if [ "$MAJOR_VERSION" -gt 24 ] 2>/dev/null || \
       { [ "$MAJOR_VERSION" -eq 24 ] 2>/dev/null && [ "$MINOR_VERSION" -gt 10 ] 2>/dev/null; } || \
       { [ "$MAJOR_VERSION" -eq 24 ] 2>/dev/null && [ "$MINOR_VERSION" -eq 10 ] 2>/dev/null && [ "$PATCH_VERSION" -ge 3 ] 2>/dev/null; } || \
       { [ "$MAJOR_VERSION" -eq 23 ] 2>/dev/null && [ "$MINOR_VERSION" -eq 5 ] 2>/dev/null && [ "$PATCH_VERSION" -ge 6 ] 2>/dev/null; }; then
        AWG_VERSION="2.0"
    fi
    msg "Detected AmneziaWG protocol generation: $AWG_VERSION" "Определено поколение протокола AmneziaWG: $AWG_VERSION"
}

# Choose installer language before any interactive menu.
# Do not ask during non-interactive update mode.
if [ "$1" != "--update" ] && [ "${ROUTING_OPENWRT_UPDATE_ONLY:-0}" != "1" ]; then
    choose_language
fi

# System Details
MODEL=$(cat /tmp/sysinfo/model)
source /etc/os-release
printf "\033[34;1m%s\033[0m\n" "$(prompt "Model: $MODEL" "Модель: $MODEL")"
printf "\033[34;1m%s\033[0m\n" "$(prompt "Version: $OPENWRT_RELEASE" "Версия: $OPENWRT_RELEASE")"

validate_routewolf_installation() {
    sleep 2
    [ -x /usr/sbin/routewolf-route.sh ] || { msgc "$C_RED" "Route helper is missing" "Отсутствует скрипт восстановления маршрута"; return 1; }
    /usr/sbin/routewolf-route.sh >/tmp/routewolf-final-route.log 2>&1 || { tail -n 20 /tmp/routewolf-final-route.log 2>/dev/null || true; return 1; }
    ip rule show 2>/dev/null | grep -Eq '^100:.*fwmark 0x1(/0x1)?.*lookup (vpn|99)' || return 1
    ip route show default 2>/dev/null | grep -Eq ' dev (awg0|wg0|tun[0-9]+|sbtun0|outline0)( |$)' && return 1
    dnsmasq --test >/tmp/routewolf-final-dnsmasq.log 2>&1 || return 1
    nft list set inet fw4 vpn_domains >/dev/null 2>&1 || return 1
    msgc "$C_GREEN" "Final routing verification passed" "Финальная проверка маршрутизации пройдена"
    return 0
}

VERSION_ID=$(echo "$VERSION" | awk -F. '{print $1}')
ID_LIKE_SAFE=" ${ID:-} ${ID_LIKE:-} ${NAME:-} ${OPENWRT_RELEASE:-} "

# Accept OpenWrt-compatible forks that keep the usual OpenWrt stack: uci/netifd/procd/fw4.
# 23/24 use opkg on most builds; 25/26 and many X-WRT snapshots use apk.
case "$VERSION_ID" in
    23|24|25|26) ;;
    *)
        if echo "$ID_LIKE_SAFE" | grep -qiE 'openwrt|x-wrt|xwrt|immortal'; then
            msgc "$C_YELLOW"                 "Unknown OpenWrt-compatible version ($VERSION). Continuing in experimental mode."                 "Неизвестная OpenWrt-совместимая версия ($VERSION). Продолжаю в экспериментальном режиме."
        else
            msgc "$C_RED"                 "Script supports OpenWrt 23.05, 24.10 and experimental 25.x/26.x compatible builds."                 "Скрипт поддерживает OpenWrt 23.05, 24.10 и экспериментально совместимые 25.x/26.x сборки."
            msg "For older or non-compatible systems use manual configuration." "Для более старых или несовместимых систем используйте ручную настройку."
            exit 1
        fi
    ;;
esac

if command -v apk >/dev/null 2>&1; then
    msgc "$C_BLUE" "Package manager: apk" "Пакетный менеджер: apk"
elif command -v opkg >/dev/null 2>&1; then
    msgc "$C_BLUE" "Package manager: opkg" "Пакетный менеджер: opkg"
else
    msgc "$C_RED" "No supported package manager found: apk/opkg." "Не найден поддерживаемый пакетный менеджер: apk/opkg."
    exit 1
fi

msgc "$C_RED" "All actions performed here cannot be rolled back automatically." "Все действия здесь нельзя автоматически откатить назад."

if [ "$1" = "--update" ] || [ "${ROUTING_OPENWRT_UPDATE_ONLY:-0}" = "1" ]; then
    update_existing_installation
    exit 0
fi

check_repo

add_packages

add_tunnel

add_mark

add_zone

show_manual

add_set

dnsmasqfull

dnsmasqconfdir

# DNS redirect is intentionally OFF by default. It can be added later as an optional menu item.
# ensure_lan_dns_redirect

# DNSCrypt2/Stubby interactive selection was removed.
# The script keeps the router's existing upstream DNS settings and only configures dnsmasq/nftset routing.
# add_dns_resolver

install_management_commands

add_getdomains

printf "\033[32;1mRestart network\033[0m\n"
/etc/init.d/network restart || exit 1
validate_routewolf_installation || {
    msgc "$C_RED" "Final routing verification failed" "Финальная проверка маршрутизации завершилась ошибкой"
    exit 1
}

printf "\033[32;1mDone\033[0m\n"
