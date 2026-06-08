#!/bin/sh
# routing-openwrt installer/bootstrapper.
# Works both from a cloned repository and as a raw GitHub one-liner.

REPO="dagmagnat/routing-openwrt"
BRANCH="${ROUTING_OPENWRT_BRANCH:-main}"
TMP_DIR="/tmp/routing-openwrt"
ZIP_FILE="/tmp/routing-openwrt.zip"
ZIP_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip"

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)

# Local mode: repository was already downloaded/unpacked.
if [ -f "$DIR/getdomains-install.sh" ]; then
    chmod +x "$DIR/getdomains-install.sh" 2>/dev/null || true
    exec sh "$DIR/getdomains-install.sh" "$@"
fi

# Bootstrap mode: script was started from raw.githubusercontent.com or piped to sh.
echo "routing-openwrt: downloading ${REPO}@${BRANCH}..."

if ! command -v unzip >/dev/null 2>&1 || ! command -v wget >/dev/null 2>&1; then
    opkg update
    opkg install unzip wget ca-certificates ca-bundle libustream-mbedtls 2>/dev/null ||     opkg install unzip wget ca-certificates 2>/dev/null || true
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
chmod +x install.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh 2>/dev/null || true
exec sh ./getdomains-install.sh "$@"
