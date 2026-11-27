#!/bin/sh
# Local uninstaller: never download or run another installer to remove RouteWolf.
set -u
umask 077
confirmed=0
remove_packages=0
for arg in "$@"; do
    case "$arg" in
        --purge) : ;;
        --yes) confirmed=1 ;;
        --remove-components) remove_packages=1 ;;
        -h|--help)
            echo 'Usage: rw uninstall [--yes] [--remove-components]'
            echo 'Удаляет RouteWolf, его панель LuCI, профили, интерфейсы и сетевые правила проекта.'
            echo '--remove-components также удаляет неиспользуемые VPN-пакеты, установленные RouteWolf.'
            exit 0 ;;
        *) echo "Unknown argument: $arg" >&2; exit 2 ;;
    esac
done
if [ "$confirmed" != 1 ]; then
    echo 'Будут удалены RouteWolf, его панель LuCI, настройки, маршруты и туннели проекта.'
    printf 'Для подтверждения введите DELETE: '
    answer=''
    read -r answer || true
    [ "$answer" = DELETE ] || { echo 'Удаление отменено.'; exit 0; }
    if [ "$remove_packages" = 0 ]; then
        printf 'Удалить также неиспользуемые VPN-пакеты RouteWolf? [y/N]: '
        read -r answer || answer=
        case "$answer" in y|Y|yes|YES|Yes|да|Да) remove_packages=1 ;; esac
    fi
fi
[ "$(id -u)" = 0 ] || { echo 'Root is required' >&2; exit 1; }
for config in network firewall dhcp openvpn routewolf_ui; do
    [ -z "$(uci -q changes "$config")" ] || { echo "Unsaved UCI changes in $config; save or revert them first" >&2; exit 1; }
done
locks=''
helper=${ROUTEWOLF_COMPONENT_HELPER:-/usr/libexec/routewolf-ui/components.sh}
[ -r "$helper" ] || helper=/usr/libexec/routewolf/components.sh
ledger=$(mktemp /tmp/routewolf-uninstall-packages.XXXXXX) || exit 1
set_batch=
cleanup() {
    [ -z "$set_batch" ] || rm -f "$set_batch"
    rm -f "$ledger"
    for lock in $locks; do rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
mkdir -p /tmp/routewolf-ui-job || exit 1
for lock in /tmp/routewolf-project-update.lock /tmp/routewolf-code-update.lock /tmp/routewolf-lists.lock /tmp/routewolf-domain-health.lock /tmp/routewolf-ui-job/lock; do
    mkdir "$lock" 2>/dev/null || { echo 'RouteWolf task/lock exists; retry after it finishes' >&2; exit 75; }
    locks="$lock $locks"
    echo $$ >"$lock/pid"
done
# Preserve private configuration for a manual recovery; never publish this archive.
backup=/tmp/routewolf-uninstall-backup.$$.tgz
set --
for file in etc/config etc/routewolf etc/routewolf-ui etc/routewolf-subscription etc/crontabs/root etc/openvpn/routewolf.ovpn etc/openvpn/routing_openwrt.ovpn; do
    [ ! -e "/$file" ] || set -- "$@" "$file"
done
tar -czf "$backup" -C / "$@" && tar -tzf "$backup" >/dev/null || { echo 'Backup failed; nothing removed' >&2; exit 1; }
echo "Резервная копия настроек: $backup (в RAM, исчезнет после перезагрузки)"
if [ "$remove_packages" = 1 ]; then
    if [ -f /etc/routewolf/component-packages ]; then
        cp /etc/routewolf/component-packages "$ledger" || exit 1
    elif [ -r "$helper" ]; then
        sh "$helper" legacy-packages > "$ledger" || : > "$ledger"
    fi
fi

services='routewolf getdomains routewolf-route routewolf-watchdog routewolf-awg-watchdog vpnroute routewolf-ui-lists routewolf-ui-backup routewolf-ui-backup-engine routewolf-subscription routewolf-subscription-engine'
for service in $services; do
    [ ! -x "/etc/init.d/$service" ] || {
        "/etc/init.d/$service" stop 2>/dev/null || :
        "/etc/init.d/$service" disable 2>/dev/null || :
    }
done
if [ -x /etc/routewolf-subscription/manage ]; then
    /etc/routewolf-subscription/manage remove || exit 1
fi
if [ -x /usr/libexec/routewolf-ui/dns.sh ]; then
    /usr/libexec/routewolf-ui/dns.sh remove || exit 1
fi
if [ -x /usr/libexec/routewolf-ui/interfaces.sh ]; then
    for ref in $(uci -q show routewolf_ui | sed -n "s/^routewolf_ui\..*\.existing_ref='\([a-zA-Z0-9_.-]*\)'\$/\1/p"); do
        /usr/libexec/routewolf-ui/interfaces.sh remove-link "$ref" all || exit 1
    done
fi

# Resolve each matching section again after deletion: anonymous UCI indexes shift.
delete_named() {
    kind=$1; name=$2
    while :; do
        section=$(uci -q show firewall | sed -n "s/^\(firewall\.[^.]*\)\.name='$name'$/\1/p" | head -n 1)
        [ -n "$section" ] || break
        [ "$(uci -q get "$section")" = "$kind" ] || return 1
        uci -q delete "$section" || return 1
    done
}
for name in vpn_domains vpn_domains6 vpn_domains_internal vpn_subnets vpn_subnets6; do
    delete_named ipset "$name" || exit 1
done
for name in mark_domains mark_domains6 mark_domains_intenal mark_subnet mark_subnet6; do
    delete_named rule "$name" || exit 1
done
delete_named redirect routewolf_force_dns || exit 1
for section in $(uci -q show firewall | sed -n 's/^firewall\.\(routewolf_ui_[a-zA-Z0-9_]*\)=.*$/\1/p'); do
    uci -q delete "firewall.$section" || exit 1
done
for section in routewolf_sub_zone routewolf_sub_forward; do
    uci -q delete "firewall.$section" || :
done
if ! fw4 check; then
    uci -q revert firewall
    echo 'Firewall validation failed; removal cancelled before applying changes' >&2
    exit 1
fi
uci commit firewall || exit 1

if [ -f /etc/crontabs/root ]; then
    sed '/\/usr\/sbin\/routewolf-/d; /\/etc\/init.d\/routewolf[[:space:]]/d; /\/etc\/init.d\/getdomains[[:space:]]/d; /\/usr\/sbin\/routing-openwrt-healthcheck.sh/d; /\/usr\/sbin\/routing-openwrt-update.sh/d; /\/usr\/sbin\/domain-routing-/d' /etc/crontabs/root > /tmp/routewolf-uninstall-cron.$$ || exit 1
    cat /tmp/routewolf-uninstall-cron.$$ > /etc/crontabs/root || exit 1
    rm -f /tmp/routewolf-uninstall-cron.$$
    /etc/init.d/cron restart 2>/dev/null || true
fi
for family in '' '-6'; do
    while ip $family rule del fwmark 0x1/0x1 table 99 priority 100 2>/dev/null; do :; done
    while ip $family rule del fwmark 0x1 table vpn 2>/dev/null; do :; done
    ip $family route flush table 99 2>/dev/null || true
    while ip $family rule del fwmark 0x2000000/0x2000000 table 190 priority 92 2>/dev/null; do :; done
    ip $family route del default dev rwsub0 table 190 2>/dev/null || :
done
nft delete table inet routewolf_subscription 2>/dev/null || :
nft delete table inet routewolf_ui_backup 2>/dev/null || :
for name in mark0x1 mark0x2 routewolf_mark routewolf_internal_mark vpn_route vpn_route6 vpn_route_internal vpn_route_blackhole vpn_route_blackhole6; do
    uci -q delete "network.$name" 2>/dev/null || true
done
native=$(uci -q show network | sed -n "s/^network\.\([a-zA-Z0-9_]*\)\.routewolf_ui='1'\$/\1/p")
for interface in awg0 wg0; do
    proto=$(uci -q get "network.$interface.proto" || :)
    case "$proto" in amneziawg|wireguard) ;; *) continue ;; esac
    if uci -q show "network.@${proto}_${interface}[0]" | grep -Fq ".name='${interface}_client'"; then
        native="$native $interface"
    fi
done
if [ -f /etc/openvpn/routewolf.ovpn ] || [ -f /etc/openvpn/routing_openwrt.ovpn ]; then
    [ "$(uci -q get network.OpenVPN.proto || :)" != none ] || native="$native OpenVPN"
fi
for interface in $native; do
    [ "$(uci -q get "network.$interface" || :)" = interface ] || continue
    ifdown "$interface" 2>/dev/null || :
    for type in "amneziawg_$interface" "wireguard_$interface" "awg_$interface"; do
        while uci -q delete "network.@$type[0]" 2>/dev/null; do :; done
    done
    uci -q delete "network.$interface" || exit 1
done
openvpn_instances=$(uci -q show openvpn | sed -n "s/^openvpn\.\([a-zA-Z0-9_]*\)\.routewolf_ui='1'\$/\1/p")
for instance in $openvpn_instances routewolf routing_openwrt; do
    [ "$(uci -q get "openvpn.$instance" || :)" = openvpn ] || continue
    ubus call service delete "$(printf '{"name":"openvpn","instance":"%s"}' "$instance")" >/dev/null 2>&1 || :
    uci -q delete "openvpn.$instance" || exit 1
done
rm -f /etc/openvpn/routewolf.ovpn /etc/openvpn/routing_openwrt.ovpn
if [ -f /etc/routewolf/outline.conf ] || [ -f /etc/routewolf/singbox.conf ]; then
    if grep -Eq '"interface_name"[[:space:]]*:[[:space:]]*"(sbtun0|outline0)"' /etc/sing-box/config.json 2>/dev/null; then
        if [ -x /etc/init.d/sing-box ]; then
            /etc/init.d/sing-box stop || :
            /etc/init.d/sing-box disable || :
        fi
        if [ -f /etc/sing-box/config.json.routewolf-backup ]; then
            mv /etc/sing-box/config.json.routewolf-backup /etc/sing-box/config.json || exit 1
        else
            rm -f /etc/sing-box/config.json
        fi
    fi
fi
uci commit network || exit 1
if [ -f /etc/config/openvpn ]; then uci commit openvpn || exit 1; fi
if [ -n "$native" ] && [ -x /etc/init.d/network ]; then /etc/init.d/network reload || exit 1; fi
# Shared dnsmasq confdir, DNS servers, AAAA policy and VPN zones are preserved.
rm -f /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst
fw4 reload || { echo 'Firewall reload failed; backup retained' >&2; exit 1; }
# fw4 reload flushes rules but can retain unreferenced sets. A later install
# cannot change the type of an orphan left over from an older RouteWolf.
set_batch=$(mktemp /tmp/routewolf-uninstall-sets.XXXXXX) || exit 1
for name in vpn_domains vpn_domains6 vpn_domains_internal vpn_subnets vpn_subnets6; do
    nft -t list set inet fw4 "$name" >/dev/null 2>&1 || continue
    printf 'delete set inet fw4 %s\n' "$name" >> "$set_batch" || exit 1
done
if [ -s "$set_batch" ]; then
    # A remaining rule referencing any of these sets makes the whole dry run fail.
    nft -c -f "$set_batch" && nft -f "$set_batch" || {
        echo 'Could not remove the remaining RouteWolf nftables sets; backup retained' >&2
        exit 1
    }
fi
/etc/init.d/dnsmasq restart || { echo 'DNS restart failed; backup retained' >&2; exit 1; }
for service in $services; do
    rm -f "/etc/init.d/$service"
done
rm -f /etc/hotplug.d/iface/30-routewolf-route /etc/hotplug.d/net/30-routewolf-route /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute
for command in rw rwrt row; do rm -f "/usr/sbin/$command"; done
for script in routewolf-route routewolf-status routewolf-update routewolf-stable-update routewolf-reliability routewolf-fetch routewolf-apply routewolf-purge routewolf-youtube routewolf-uninstall routewolf-healthcheck routewolf-watchdog routewolf-awg-watchdog routewolf-diagnose routewolf-load routewolf-diagnose-update routewolf-singbox-update domain-routing-route domain-routing-status routing-openwrt-diagnose routing-openwrt-load routing-openwrt-healthcheck routing-openwrt-update routing-openwrt-uninstall; do
    rm -f "/usr/sbin/$script.sh"
done
rm -f /etc/config/routewolf_ui /usr/libexec/rpcd/routewolf_ui /usr/share/rpcd/acl.d/luci-app-routewolf.json \
    /usr/share/luci/menu.d/luci-app-routewolf.json /tmp/luci-indexcache*
rm -rf /www/luci-static/resources/view/routewolf /etc/routewolf-ui /etc/routewolf-subscription
if [ "$remove_packages" = 1 ]; then
    if [ -s "$ledger" ] && [ -r "$helper" ]; then
        sh "$helper" remove-owned "$ledger" || echo 'Не удалось удалить часть пакетов.' >&2
    else
        echo 'Записи об установленных проектом VPN-пакетах отсутствуют. Пакеты сохранены.'
    fi
fi
rm -rf /etc/routewolf /etc/domain-routing /usr/libexec/routewolf /usr/libexec/routewolf-ui
rm -f /etc/domain-routing-route.conf /etc/domain-routing-user.conf /tmp/routewolf-tunnel-unhealthy
[ ! -x /etc/init.d/rpcd ] || /etc/init.d/rpcd reload
echo 'RouteWolf и панель LuCI удалены.'
