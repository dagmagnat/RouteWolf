#!/bin/sh
# Existing installations use stable releases; no full installer runs from cron.
mode=check
automatic=0
for arg in "$@"; do
    case "$arg" in --auto|--lists-auto|--code-auto) mode="$arg"; automatic=1 ;; esac
done
if [ -x /usr/sbin/routewolf-stable-update.sh ]; then
    exec /usr/sbin/routewolf-stable-update.sh "$mode"
fi
if [ "$mode" = --lists-auto ]; then
    [ ! -x /etc/init.d/routewolf ] || /etc/init.d/routewolf start
    exit "$?"
fi
if [ "$automatic" = 1 ] || [ -f /etc/routewolf/route.conf ] || [ -f /etc/domain-routing-route.conf ]; then
    umask 077
    work=/tmp/routewolf-stable-bootstrap.$$
    mkdir -p "$work" || exit 1
    trap 'rm -rf "$work"' EXIT
    fetch_verified_tls() {
        limit=$3
        if command -v curl >/dev/null 2>&1; then
            (ulimit -f "$(((limit+511)/512))"; exec curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 75 --max-filesize "$limit" "$1" -o "$2") &&
                [ "$(wc -c <"$2")" -le "$limit" ] && return 0
        fi
        [ -x /bin/uclient-fetch ] &&
            (ulimit -f "$(((limit+511)/512))"; exec /bin/uclient-fetch -T 30 -O "$2" "$1") >/dev/null 2>&1 &&
            [ -s "$2" ] && [ "$(wc -c <"$2")" -le "$limit" ]
    }
    available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
    case "$available" in ''|*[!0-9]*) available=0 ;; esac
    if [ "$available" -lt 8192 ]; then
        echo 'Less than 8 MiB available RAM; existing project retained' >&2
        exit 1
    fi
    base=https://github.com/dagmagnat/RouteWolf/releases
    if ! command -v sha256sum >/dev/null 2>&1 ||
       ! fetch_verified_tls "$base/latest/download/stable.manifest" "$work/manifest" 4096; then
        echo 'Stable release unavailable/TLS failed; existing code retained' >&2
        [ "$mode" = --code-auto ] || { [ ! -x /etc/init.d/routewolf ] || /etc/init.d/routewolf start; }
        exit 1
    fi
    version=$(sed -n 's/^version=//p' "$work/manifest")
    case "$version" in ''|*[!0-9]*) exit 1 ;; esac
    [ "${#version}" -le 6 ] || exit 1
    fetch_verified_tls "$base/download/v$version/routewolf-stable-update.sh" "$work/agent" 131072 || exit 1
    expected=$(sed -n 's/^agent_sha256=//p' "$work/manifest")
    [ "${#expected}" = 64 ] || exit 1
    case "$expected" in *[!0-9a-f]*) exit 1 ;; esac
    [ "$(sha256sum "$work/agent" | awk '{print $1}')" = "$expected" ] || exit 1
    sh -n "$work/agent" || exit 1
    sh "$work/agent" "$mode"
    exit "$?"
fi

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
        /bin/uclient-fetch -O "$_out" "$_url" >/dev/null 2>&1 && [ -s "$_out" ] && return 0
        rm -f "$_out"
        /bin/uclient-fetch -O "$_out" "$_url" && [ -s "$_out" ] && return 0
        rm -f "$_out"
    fi

    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch -O "$_out" "$_url" >/dev/null 2>&1 && [ -s "$_out" ] && return 0
        rm -f "$_out"
        uclient-fetch -O "$_out" "$_url" && [ -s "$_out" ] && return 0
        rm -f "$_out"
    fi

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --connect-timeout 15 --max-time 180 --retry 2 "$_url" -o "$_out" && [ -s "$_out" ] && return 0
        rm -f "$_out"
    fi

    if command -v wget >/dev/null 2>&1; then
        if wget --help 2>&1 | grep -q -- '--no-check-certificate'; then
            wget -O "$_out" "$_url" && [ -s "$_out" ] && return 0
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
    echo "  /bin/uclient-fetch -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/update.sh | sh"
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
