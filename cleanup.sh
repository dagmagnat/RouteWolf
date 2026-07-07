#!/bin/sh
# Safe cleanup for interrupted RouteWolf/OpenWrt package installations.
# It does not remove tunnel configuration or RouteWolf lists.

set -u

echo "=== RouteWolf safe cleanup ==="

rm -rf /tmp/amneziawg /tmp/routewolf-awg-bin /tmp/routewolf-apk-bin \
    /tmp/routewolf-awg-customfeeds.list.* /tmp/RouteWolf-main \
    /tmp/routewolf-main 2>/dev/null || true
rm -f /tmp/amneziawg-install.sh /tmp/awg-openwrt-feed.pem \
    /tmp/awg-openwrt-packages.adb /tmp/routewolf-awg-install.log \
    /tmp/routewolf-pkg-install.log /tmp/routewolf-pkg-update.log 2>/dev/null || true

if command -v apk >/dev/null 2>&1; then
    if [ -f /etc/apk/world ] && grep -Eq '^nano([<>=~].*)?$' /etc/apk/world 2>/dev/null; then
        echo "Removing legacy nano request from /etc/apk/world..."
        if ! apk del nano >/tmp/routewolf-cleanup.log 2>&1; then
            TMP="/tmp/routewolf-world.$$"
            grep -Ev '^nano([<>=~].*)?$' /etc/apk/world > "$TMP" 2>/dev/null || : > "$TMP"
            cat "$TMP" > /etc/apk/world || exit 1
            rm -f "$TMP"
        fi
    fi
    if [ -e /usr/bin/nano ] && ! apk info -e nano >/dev/null 2>&1; then
        rm -f /usr/bin/nano 2>/dev/null || true
    fi
    apk cache clean >/dev/null 2>&1 || true
fi

sync 2>/dev/null || true

echo "=== Free space ==="
df -h /overlay /tmp 2>/dev/null || df -h / /tmp 2>/dev/null || true
