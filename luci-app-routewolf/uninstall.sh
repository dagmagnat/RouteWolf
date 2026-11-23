#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as root on OpenWrt.' >&2; exit 1; }
if [ -x /etc/init.d/routewolf-ui-backup ]; then
    /etc/init.d/routewolf-ui-backup stop || :
    /etc/init.d/routewolf-ui-backup disable || :
fi
if [ -x /etc/init.d/routewolf-ui-backup-engine ]; then
    /etc/init.d/routewolf-ui-backup-engine stop || :
fi
if [ -x /usr/libexec/routewolf-ui/dns.sh ]; then
    /usr/libexec/routewolf-ui/dns.sh remove || :
fi
rm -f /usr/libexec/rpcd/routewolf_ui \
    /usr/share/rpcd/acl.d/luci-app-routewolf.json \
    /usr/share/luci/menu.d/luci-app-routewolf.json \
    /www/luci-static/resources/view/routewolf/manage.js \
    /www/luci-static/resources/view/routewolf/manage-*.js \
    /www/luci-static/resources/view/routewolf/manage.css \
    /www/luci-static/resources/view/routewolf/geo-catalog.js
rmdir /www/luci-static/resources/view/routewolf 2>/dev/null || true
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd reload
