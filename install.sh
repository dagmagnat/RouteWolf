#!/bin/sh
# RouteWolf universal bootstrapper for OpenWrt.
# It deliberately prefers /bin/uclient-fetch over a package named wget,
# because wget-nossl on some apk-based builds cannot download HTTPS.

ACTION="install"
REPO="dagmagnat/RouteWolf"
BRANCH="${ROUTEWOLF_BRANCH:-main}"
TMP_DIR="/tmp/routewolf-install"
[ "$ACTION" = "install" ] && TMP_DIR="/tmp/routewolf"
ARCHIVE_FILE="/tmp/routewolf-install.tar.gz"
[ "$ACTION" = "install" ] && ARCHIVE_FILE="/tmp/routewolf.tar.gz"
ARCHIVE_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}"

SELF_NAME="$(basename "$0" 2>/dev/null)"
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)

# Local mode: run directly from an unpacked repository without downloading anything.
if [ "$SELF_NAME" = "install.sh" ] && [ -f "$DIR/routewolf-install.sh" ]; then
    chmod +x "$DIR/routewolf-install.sh" 2>/dev/null || true
    if [ -r /dev/tty ]; then exec sh "$DIR/routewolf-install.sh" "$@" < /dev/tty; else exec sh "$DIR/routewolf-install.sh" "$@"; fi
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
    echo "Try the absolute OpenWrt client:"
    echo "  /bin/uclient-fetch -O /tmp/routewolf-install.sh https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/install.sh"
    echo "  sh /tmp/routewolf-install.sh"
    echo "If /bin/uclient-fetch is missing, install/use curl or upload the ZIP manually."
    exit 1
fi

if ! extract_archive "$ARCHIVE_FILE"; then
    echo "Error: failed to unpack the RouteWolf tar.gz archive."
    echo "BusyBox tar with gzip support is required; it is present in normal OpenWrt images."
    exit 1
fi

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
chmod +x install.sh update.sh uninstall.sh routewolf-install.sh routewolf-uninstall.sh routewolf-check.sh 2>/dev/null || true
if [ -r /dev/tty ]; then exec sh ./routewolf-install.sh "$@" < /dev/tty; else exec sh ./routewolf-install.sh "$@"; fi
