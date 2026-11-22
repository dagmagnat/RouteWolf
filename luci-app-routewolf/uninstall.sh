#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root on OpenWrt.' >&2; exit 1; }
rm -f /usr/libexec/rpcd/routewolf_ui \
    /usr/share/rpcd/acl.d/luci-app-routewolf.json \
    /usr/share/luci/menu.d/luci-app-routewolf.json \
    /www/luci-static/resources/view/routewolf/manage.js \
    /www/luci-static/resources/view/routewolf/manage.css
rmdir /www/luci-static/resources/view/routewolf 2>/dev/null || true
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd reload
