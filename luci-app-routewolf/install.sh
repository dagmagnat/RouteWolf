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
    staged=$(mktemp "$dest.new.XXXXXX")
    if cp "$source" "$staged" && chmod "$mode" "$staged" && mv -f "$staged" "$dest"; then
        return 0
    fi
    rm -f "$staged"
    return 1
}

config=/etc/config/routewolf_ui
if [ ! -e "$config" ]; then
    (umask 077; cp "$here/root$config" "$config")
fi
chmod 600 "$config"

put_file /usr/libexec/rpcd/routewolf_ui 755 "$here/root/usr/libexec/rpcd/routewolf_ui"
put_file /usr/share/rpcd/acl.d/luci-app-routewolf.json 644 "$here/root/usr/share/rpcd/acl.d/luci-app-routewolf.json"
view_dir=/www/luci-static/resources/view/routewolf
view_source="$here/htdocs/luci-static/resources/view/routewolf"
# LuCI's resource query string only changes when LuCI itself is upgraded.
view_hash=$(sha256sum "$view_source/manage.js")
view_name="manage-$(printf '%.16s' "$view_hash")"
put_file "$view_dir/manage.js" 644 "$view_source/manage.js"
if [ "$(readlink "$view_dir/$view_name.js" || :)" != manage.js ]; then
    ln -sfn manage.js "$view_dir/$view_name.js"
fi
put_file "$view_dir/manage.css" 644 "$view_source/manage.css"
put_file "$view_dir/geo-catalog.js" 644 "$view_source/geo-catalog.js"
put_file "$view_dir/server-flags.webp" 644 "$view_source/server-flags.webp"
put_file "$view_dir/server-flags.LICENSE.txt" 644 "$view_source/server-flags.LICENSE.txt"
menu_dir=/usr/share/luci/menu.d
menu_stage=$(mktemp "$menu_dir/.routewolf.XXXXXX")
trap 'rm -f "$menu_stage"' EXIT
sed "s#routewolf/manage\"#routewolf/$view_name\"#" "$here/root$menu_dir/luci-app-routewolf.json" > "$menu_stage"
put_file "$menu_dir/luci-app-routewolf.json" 644 "$menu_stage"
rm -f "$menu_stage"
trap - EXIT
for view in "$view_dir"/manage-*.js; do
    [ ! -L "$view" ] || [ "$view" = "$view_dir/$view_name.js" ] || rm -f "$view"
done
if [ -f "$here/../routewolf-uninstall.sh" ]; then
    put_file /usr/sbin/routewolf-uninstall.sh 755 "$here/../routewolf-uninstall.sh"
fi
if [ -f "$here/../runtime/routewolf-stable-update.sh" ]; then
    put_file /usr/sbin/routewolf-stable-update.sh 755 "$here/../runtime/routewolf-stable-update.sh"
fi
for script in dependencies jobs lists profiles singbox schedule backup backup-proxy dns geodata subscription-refresh nodes components interfaces; do
    put_file "/usr/libexec/routewolf-ui/$script.sh" 755 "$here/root/usr/libexec/routewolf-ui/$script.sh"
done
/usr/libexec/routewolf-ui/interfaces.sh mark-legacy
# Older pause actions left the subscription engine running without routing.
if [ -e /etc/routewolf-ui/paused-singbox ] && [ ! -e /etc/routewolf-ui/native-active ]; then
    /etc/init.d/routewolf-subscription-engine disable
    /etc/init.d/routewolf-subscription-engine stop
fi
put_file /usr/libexec/routewolf-ui/nodes.uc 644 "$here/root/usr/libexec/routewolf-ui/nodes.uc"
put_file /usr/libexec/routewolf-ui/library.awk 644 "$here/root/usr/libexec/routewolf-ui/library.awk"
put_file /usr/libexec/routewolf-ui/openvpn.awk 644 "$here/root/usr/libexec/routewolf-ui/openvpn.awk"
put_file /etc/init.d/routewolf-ui-lists 755 "$here/root/etc/init.d/routewolf-ui-lists"
put_file /etc/init.d/routewolf-ui-backup 755 "$here/root/etc/init.d/routewolf-ui-backup"
put_file /etc/init.d/routewolf-ui-backup-engine 755 "$here/root/etc/init.d/routewolf-ui-backup-engine"
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
    for file in install.sh controller.sh engine.init monitor.init assets.txt assets-vless.txt assets-names.txt; do
        put_file "/usr/libexec/routewolf-ui/subscription/$file" 644 "$subscription/$file"
    done
    controller=/etc/routewolf-subscription/controller
    if [ -x "$controller" ] && ! cmp -s "$subscription/controller.sh" "$controller"; then
        sh -n "$subscription/controller.sh"
        put_file "$controller" 700 "$subscription/controller.sh"
        if /etc/init.d/routewolf-subscription running; then
            /etc/init.d/routewolf-subscription restart
        fi
    fi
fi
/etc/init.d/routewolf-ui-lists enable
if /etc/init.d/routewolf-ui-backup running; then
    /etc/init.d/routewolf-ui-backup restart
fi
if [ -L /tmp/dnsmasq.d/routewolf-ui.conf ]; then
    /usr/libexec/routewolf-ui/lists.sh boot
    if ! /etc/init.d/dnsmasq running; then
        /etc/init.d/dnsmasq restart
    fi
fi
rpc_object_id() {
    ubus -t 1 -v list routewolf_ui 2>/dev/null | awk 'NR == 1 { print $NF }'
}

previous_rpc=$(rpc_object_id)
/etc/init.d/rpcd reload
for attempt in 1 2 3 4 5; do
    current_rpc=$(rpc_object_id)
    if [ -n "$current_rpc" ] && [ "$current_rpc" != "$previous_rpc" ] &&
        ubus -t 3 call routewolf_ui status >/dev/null 2>&1; then
        rm -f /tmp/luci-indexcache*
        printf '%s\n' 'LuCI: Services > RouteWolf'
        exit 0
    fi
    sleep 1
done
printf '%s\n' 'RouteWolf RPC did not register after rpcd reload.' >&2
exit 1
