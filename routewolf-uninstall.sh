#!/bin/sh
# Local uninstaller: never download or run another installer to remove RouteWolf.
set -u
umask 077
purge=0
confirmed=0
for arg in "$@"; do
    case "$arg" in
        --purge) purge=1 ;;
        --yes) confirmed=1 ;;
        -h|--help)
            echo 'Usage: rw uninstall [--purge] [--yes]'
            echo 'Удаляет RouteWolf, его списки, правила и ночные задания.'
            echo 'Без --purge сохраняет VPN-конфигурации и пакеты, настройки WAN/LAN/DNS.'
            echo '--purge дополнительно удаляет awg0/wg0 и известные VPN-конфиги проекта.'
            echo '--yes пропускает подтверждение. Прошивка и пакеты не удаляются.'
            exit 0 ;;
        *) echo "Unknown argument: $arg" >&2; exit 2 ;;
    esac
done
if [ "$confirmed" != 1 ]; then
    echo 'Будут удалены RouteWolf, его маршрутизация, списки и автоматические задания.'
    [ "$purge" != 1 ] || echo 'Также будут удалены VPN-интерфейсы awg0/wg0 и конфиги проекта.'
    printf 'Для подтверждения введите DELETE: '
    answer=''
    read -r answer || true
    [ "$answer" = DELETE ] || { echo 'Удаление отменено.'; exit 0; }
fi
[ "$(id -u)" = 0 ] || { echo 'Root is required' >&2; exit 1; }
for config in network firewall dhcp openvpn; do
    [ -z "$(uci -q changes "$config")" ] || { echo "Unsaved UCI changes in $config; save or revert them first" >&2; exit 1; }
done
locks=''
cleanup() {
    for lock in $locks; do rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
for lock in /tmp/routewolf-code-update.lock /tmp/routewolf-lists.lock /tmp/routewolf-domain-health.lock; do
    mkdir "$lock" 2>/dev/null || { echo 'RouteWolf task/lock exists; retry after it finishes' >&2; exit 75; }
    locks="$lock $locks"
    echo $$ >"$lock/pid"
done
# Preserve private configuration for a manual recovery; never publish this archive.
backup=/tmp/routewolf-uninstall-backup.$$.tgz
set --
for file in etc/config etc/routewolf etc/crontabs/root; do
    [ ! -e "/$file" ] || set -- "$@" "$file"
done
tar -czf "$backup" -C / "$@" && tar -tzf "$backup" >/dev/null || { echo 'Backup failed; nothing removed' >&2; exit 1; }
echo "Резервная копия настроек: $backup (в RAM, исчезнет после перезагрузки)"

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
if ! fw4 check; then
    uci -q revert firewall
    echo 'Firewall validation failed; removal cancelled before applying changes' >&2
    exit 1
fi
uci commit firewall || exit 1

if [ -f /etc/crontabs/root ]; then
    sed '/\/usr\/sbin\/routewolf-/d; /\/etc\/init.d\/routewolf[ /]/d; /\/etc\/init.d\/getdomains[ /]/d; /\/usr\/sbin\/routing-openwrt-healthcheck.sh/d; /\/usr\/sbin\/routing-openwrt-update.sh/d; /\/usr\/sbin\/domain-routing-/d' /etc/crontabs/root > /tmp/routewolf-uninstall-cron.$$
    cat /tmp/routewolf-uninstall-cron.$$ > /etc/crontabs/root || exit 1
    rm -f /tmp/routewolf-uninstall-cron.$$
    /etc/init.d/cron restart 2>/dev/null || true
fi
for service in routewolf getdomains routewolf-route routewolf-watchdog routewolf-awg-watchdog vpnroute; do
    [ ! -x "/etc/init.d/$service" ] || {
        "/etc/init.d/$service" stop 2>/dev/null || true
        "/etc/init.d/$service" disable 2>/dev/null || true
    }
done
for family in '' '-6'; do
    while ip $family rule del fwmark 0x1/0x1 table 99 priority 100 2>/dev/null; do :; done
    while ip $family rule del fwmark 0x1 table vpn 2>/dev/null; do :; done
    ip $family route flush table 99 2>/dev/null || true
done
for name in mark0x1 mark0x2 routewolf_mark routewolf_internal_mark vpn_route vpn_route6 vpn_route_internal vpn_route_blackhole vpn_route_blackhole6; do
    uci -q delete "network.$name" 2>/dev/null || true
done
uci commit network || exit 1

if [ "$purge" = 1 ]; then
    for interface in awg0 wg0; do
        ifdown "$interface" 2>/dev/null || true
        uci -q delete "network.$interface" || true
    done
    for type in amneziawg_awg0 wireguard_wg0; do
        while uci -q delete "network.@$type[0]" 2>/dev/null; do :; done
    done
    uci -q delete network.ovpn0 || true
    uci -q delete openvpn.routewolf || true
    uci -q delete openvpn.routing_openwrt || true
    rm -f /etc/openvpn/routewolf.ovpn /etc/openvpn/routing_openwrt.ovpn
    uci commit network || exit 1
    uci commit openvpn 2>/dev/null || true
    /etc/init.d/openvpn reload 2>/dev/null || true
    /etc/init.d/network reload 2>/dev/null || true
fi
# Shared dnsmasq confdir, DNS servers, AAAA policy and VPN zones are preserved.
rm -f /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst
fw4 reload || { echo 'Firewall reload failed; backup retained' >&2; exit 1; }
/etc/init.d/dnsmasq restart || { echo 'DNS restart failed; backup retained' >&2; exit 1; }
for service in routewolf getdomains routewolf-route routewolf-watchdog routewolf-awg-watchdog vpnroute; do
    rm -f "/etc/init.d/$service"
done
rm -f /etc/hotplug.d/iface/30-routewolf-route /etc/hotplug.d/net/30-routewolf-route /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute
for command in rw rwrt row; do rm -f "/usr/sbin/$command"; done
for script in routewolf-route routewolf-status routewolf-update routewolf-stable-update routewolf-reliability routewolf-fetch routewolf-apply routewolf-purge routewolf-youtube routewolf-uninstall routewolf-healthcheck routewolf-watchdog routewolf-awg-watchdog routewolf-diagnose routewolf-load routewolf-diagnose-update routewolf-singbox-update domain-routing-route domain-routing-status routing-openwrt-diagnose routing-openwrt-load routing-openwrt-healthcheck routing-openwrt-update routing-openwrt-uninstall; do
    rm -f "/usr/sbin/$script.sh"
done
rm -rf /etc/routewolf /etc/domain-routing
rm -f /etc/domain-routing-route.conf /etc/domain-routing-user.conf /tmp/routewolf-tunnel-unhealthy
echo 'RouteWolf удалён. Настройки WAN/LAN/DNS и установленные пакеты сохранены.'
[ "$purge" = 1 ] || echo 'VPN-конфигурации сохранены.'
