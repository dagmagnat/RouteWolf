#!/bin/sh
# RouteWolf installer/bootstrapper. Supports opkg and apk-based OpenWrt. Uses codeload.github.com directly to avoid GitHub redirect issues on some routers.
# Usage:
#   wget -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/install.sh | sh

REPO="dagmagnat/RouteWolf"
BRANCH="${ROUTEWOLF_BRANCH:-main}"
TMP_DIR="/tmp/routewolf"
ZIP_FILE="/tmp/routewolf.zip"
ZIP_URL="https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}"

SELF_NAME="$(basename "$0" 2>/dev/null)"
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)

# Local mode only when this real file is executed from an unpacked repo.
# When this script is piped to sh, $0 is usually "sh" or "ash", so we must download from GitHub.
if [ "$SELF_NAME" = "install.sh" ] && [ -f "$DIR/routewolf-install.sh" ]; then
    chmod +x "$DIR/routewolf-install.sh" 2>/dev/null || true
    if [ -r /dev/tty ]; then exec sh "$DIR/routewolf-install.sh" "$@" < /dev/tty; else exec sh "$DIR/routewolf-install.sh" "$@"; fi
fi

echo "RouteWolf: downloading ${REPO}@${BRANCH}..."

have_downloader() {
    command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || command -v uclient-fetch >/dev/null 2>&1
}

wget_has_no_check() {
    wget --help 2>&1 | grep -q -- '--no-check-certificate'
}

download_to_file() {
    url="$1"
    out="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -L -k --connect-timeout 15 --max-time 120 -o "$out" "$url" 2>/dev/null && return 0
    fi

    if command -v wget >/dev/null 2>&1; then
        if wget_has_no_check; then
            wget --no-check-certificate -O "$out" "$url" && return 0
        else
            wget -O "$out" "$url" && return 0
        fi
    fi

    if command -v uclient-fetch >/dev/null 2>&1; then
        uclient-fetch --no-check-certificate -O "$out" "$url" 2>/dev/null && return 0
        uclient-fetch -O "$out" "$url" && return 0
    fi

    return 1
}

install_deps() {
    if command -v unzip >/dev/null 2>&1 && have_downloader; then
        return 0
    fi

    if command -v apk >/dev/null 2>&1; then
        # OpenWrt 25.12 apk invokes a command named wget. A separately installed
        # wget/wget-nossl may shadow uclient-fetch and break every HTTPS feed.
        # Use a private, temporary wget shim and never install the generic wget package.
        APK_BOOT_PATH="$PATH"
        if [ -x /bin/uclient-fetch ]; then
            mkdir -p /tmp/routewolf-apk-bin
            ln -sf /bin/uclient-fetch /tmp/routewolf-apk-bin/wget
            APK_BOOT_PATH="/tmp/routewolf-apk-bin:$PATH"
        fi
        env PATH="$APK_BOOT_PATH" apk update
        env PATH="$APK_BOOT_PATH" apk -U add unzip curl ca-certificates ca-bundle libustream-mbedtls 2>/dev/null || \
        env PATH="$APK_BOOT_PATH" apk -U add unzip curl ca-certificates 2>/dev/null || \
        env PATH="$APK_BOOT_PATH" apk -U add unzip ca-certificates 2>/dev/null || true
    elif command -v opkg >/dev/null 2>&1; then
        opkg update
        opkg install unzip wget curl ca-certificates ca-bundle libustream-mbedtls 2>/dev/null ||         opkg install unzip wget curl ca-certificates 2>/dev/null ||         opkg install unzip wget ca-certificates 2>/dev/null || true
    else
        echo "Error: neither apk nor opkg was found on this OpenWrt system."
        exit 1
    fi

    if ! command -v unzip >/dev/null 2>&1; then
        echo "Error: unzip is not installed."
        exit 1
    fi
    if ! have_downloader; then
        echo "Error: no downloader found: need curl, wget or uclient-fetch."
        exit 1
    fi
}

install_deps

rm -rf "$TMP_DIR" "$ZIP_FILE"     "/tmp/RouteWolf-${BRANCH}" "/tmp/routewolf-${BRANCH}"     "/tmp/RouteWolf-main" "/tmp/routewolf-main"     "/tmp/routing-openwrt-${BRANCH}" "/tmp/routing-openwrt-main"

if ! download_to_file "$ZIP_URL" "$ZIP_FILE"; then
    echo "Error: failed to download RouteWolf archive from GitHub."
    echo "Check internet, DNS, date/time and GitHub access on the router."
    exit 1
fi

if ! unzip -o "$ZIP_FILE" -d /tmp >/dev/null; then
    echo "Error: failed to unpack RouteWolf archive."
    echo "Check free RAM/storage in /tmp and that unzip is installed."
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
    echo "Error: RouteWolf archive extracted, but source directory was not found."
    echo "Expected one of: RouteWolf-${BRANCH}, routewolf-${BRANCH}, RouteWolf-main, routewolf-main."
    echo "Found matching entries in /tmp:"
    ls -la /tmp | grep -i 'route\|wolf' || true
    exit 1
fi

cd "$TMP_DIR" || exit 1
chmod +x install.sh update.sh uninstall.sh routewolf-install.sh routewolf-uninstall.sh routewolf-check.sh 2>/dev/null || true
if [ -r /dev/tty ]; then exec sh ./routewolf-install.sh "$@" < /dev/tty; else exec sh ./routewolf-install.sh "$@"; fi
