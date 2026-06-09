#!/bin/sh
# routing-openwrt uninstall/bootstrapper.
# Usage:
#   wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh

REPO="dagmagnat/routing-openwrt"
BRANCH="${ROUTING_OPENWRT_BRANCH:-main}"
TMP_DIR="/tmp/routing-openwrt-uninstall"
ZIP_FILE="/tmp/routing-openwrt-uninstall.zip"
ZIP_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip"

SELF_NAME="$(basename "$0" 2>/dev/null)"
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)

if [ "$SELF_NAME" = "uninstall.sh" ] && [ -f "$DIR/getdomains-uninstall.sh" ]; then
    chmod +x "$DIR/getdomains-uninstall.sh" 2>/dev/null || true
    exec sh "$DIR/getdomains-uninstall.sh" "$@"
fi

echo "routing-openwrt: downloading uninstaller ${REPO}@${BRANCH}..."

if ! command -v unzip >/dev/null 2>&1 || ! command -v wget >/dev/null 2>&1; then
    opkg update
    opkg install unzip wget ca-certificates ca-bundle libustream-mbedtls 2>/dev/null || \
    opkg install unzip wget ca-certificates 2>/dev/null || true
fi

rm -rf "$TMP_DIR" "$ZIP_FILE" "/tmp/routing-openwrt-${BRANCH}"
wget --no-check-certificate -O "$ZIP_FILE" "$ZIP_URL" || wget -O "$ZIP_FILE" "$ZIP_URL" || exit 1
unzip -o "$ZIP_FILE" -d /tmp >/dev/null || exit 1

if [ -d "/tmp/routing-openwrt-${BRANCH}" ]; then
    mv "/tmp/routing-openwrt-${BRANCH}" "$TMP_DIR"
elif [ -d "/tmp/routing-openwrt-main" ]; then
    mv "/tmp/routing-openwrt-main" "$TMP_DIR"
fi

cd "$TMP_DIR" || exit 1
chmod +x getdomains-uninstall.sh 2>/dev/null || true
exec sh ./getdomains-uninstall.sh "$@"
