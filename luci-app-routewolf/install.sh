#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
[ "$(id -u)" = 0 ] || { echo 'Run as root on OpenWrt.' >&2; exit 1; }
[ -d /usr/share/luci/menu.d ] && [ -x /etc/init.d/rpcd ] ||
    { echo 'LuCI and rpcd are required.' >&2; exit 1; }

put_file() {
    dest=$1
    mode=$2
    source=$3
    mkdir -p "$(dirname -- "$dest")"
    cp "$source" "$dest"
    chmod "$mode" "$dest"
}

config=/etc/config/routewolf_ui
if [ ! -e "$config" ]; then
    (umask 077; cp "$here/root$config" "$config")
fi
chmod 600 "$config"

put_file /usr/libexec/rpcd/routewolf_ui 755 "$here/root/usr/libexec/rpcd/routewolf_ui"
put_file /usr/share/rpcd/acl.d/luci-app-routewolf.json 644 "$here/root/usr/share/rpcd/acl.d/luci-app-routewolf.json"
put_file /usr/share/luci/menu.d/luci-app-routewolf.json 644 "$here/root/usr/share/luci/menu.d/luci-app-routewolf.json"
put_file /www/luci-static/resources/view/routewolf/manage.js 644 "$here/htdocs/luci-static/resources/view/routewolf/manage.js"
put_file /www/luci-static/resources/view/routewolf/manage.css 644 "$here/htdocs/luci-static/resources/view/routewolf/manage.css"
for script in dependencies jobs lists profiles singbox schedule; do
    put_file "/usr/libexec/routewolf-ui/$script.sh" 755 "$here/root/usr/libexec/routewolf-ui/$script.sh"
done
put_file /usr/libexec/routewolf-ui/library.awk 644 "$here/root/usr/libexec/routewolf-ui/library.awk"
put_file /usr/libexec/routewolf-ui/openvpn.awk 644 "$here/root/usr/libexec/routewolf-ui/openvpn.awk"
put_file /etc/init.d/routewolf-ui-lists 755 "$here/root/etc/init.d/routewolf-ui-lists"
installer="$here/../routewolf-install.sh"
[ -f "$installer" ] || installer="$here/installer-source.sh"
if [ -f "$installer" ]; then
    awk '/^# Choose installer language before any interactive menu\./ {exit} {print}' "$installer" > /usr/libexec/routewolf-ui/functions.new
    sh -n /usr/libexec/routewolf-ui/functions.new
    grep -q '^parse_awg_config_file()' /usr/libexec/routewolf-ui/functions.new
    chmod 600 /usr/libexec/routewolf-ui/functions.new
    mv /usr/libexec/routewolf-ui/functions.new /usr/libexec/routewolf-ui/installer-functions.sh
fi
subscription="$here/../subscription"
if [ -f "$subscription/install.sh" ]; then
    for file in install.sh controller.sh engine.init monitor.init assets.txt; do
        put_file "/usr/libexec/routewolf-ui/subscription/$file" 644 "$subscription/$file"
    done
fi
/etc/init.d/routewolf-ui-lists enable
if [ -L /tmp/dnsmasq.d/routewolf-ui.conf ]; then
    /usr/libexec/routewolf-ui/lists.sh boot
    if ! /etc/init.d/dnsmasq running; then
        /etc/init.d/dnsmasq restart
    fi
fi
rm -f /tmp/luci-indexcache*
/etc/init.d/rpcd reload
for attempt in 1 2 3 4 5; do
    if ubus -t 3 call routewolf_ui status >/dev/null 2>&1; then
        printf '%s\n' 'LuCI: Services > RouteWolf'
        exit 0
    fi
    sleep 1
done
printf '%s\n' 'RouteWolf RPC did not register after rpcd reload.' >&2
exit 1
