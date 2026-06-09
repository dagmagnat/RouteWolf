#!/bin/sh
# Update routing-openwrt from GitHub without deleting current VPN tunnel config. Supports opkg and apk-based OpenWrt. Uses codeload.github.com directly to avoid GitHub redirect issues on some routers.
# Usage:
#   wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh

REPO="dagmagnat/routing-openwrt"
BRANCH="${ROUTING_OPENWRT_BRANCH:-main}"
TMP_DIR="/tmp/routing-openwrt-update"
ZIP_FILE="/tmp/routing-openwrt-update.zip"
ZIP_URL="https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}"

SELF_NAME="$(basename "$0" 2>/dev/null)"
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)

if [ "$SELF_NAME" = "update.sh" ] && [ -f "$DIR/getdomains-install.sh" ]; then
    chmod +x "$DIR/getdomains-install.sh" 2>/dev/null || true
    exec sh "$DIR/getdomains-install.sh" --update
fi

echo "routing-openwrt: downloading update ${REPO}@${BRANCH}..."

install_deps() {
    if command -v unzip >/dev/null 2>&1 && command -v wget >/dev/null 2>&1; then
        return 0
    fi

    if command -v apk >/dev/null 2>&1; then
        apk update
        apk -U add unzip wget ca-certificates ca-bundle libustream-mbedtls 2>/dev/null || \
        apk -U add unzip wget ca-certificates 2>/dev/null || true
    elif command -v opkg >/dev/null 2>&1; then
        opkg update
        opkg install unzip wget ca-certificates ca-bundle libustream-mbedtls 2>/dev/null || \
        opkg install unzip wget ca-certificates 2>/dev/null || true
    else
        echo "Error: neither apk nor opkg was found on this OpenWrt system."
        exit 1
    fi
}

install_deps

rm -rf "$TMP_DIR" "$ZIP_FILE" "/tmp/routing-openwrt-${BRANCH}"
(curl -L --connect-timeout 15 --max-time 120 -o "$ZIP_FILE" "$ZIP_URL" 2>/dev/null || wget --no-check-certificate -O "$ZIP_FILE" "$ZIP_URL" || wget -O "$ZIP_FILE" "$ZIP_URL") || exit 1
unzip -o "$ZIP_FILE" -d /tmp >/dev/null || exit 1

if [ -d "/tmp/routing-openwrt-${BRANCH}" ]; then
    mv "/tmp/routing-openwrt-${BRANCH}" "$TMP_DIR"
elif [ -d "/tmp/routing-openwrt-main" ]; then
    mv "/tmp/routing-openwrt-main" "$TMP_DIR"
fi

cd "$TMP_DIR" || exit 1
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh 2>/dev/null || true
exec sh ./getdomains-install.sh --update
