#!/bin/ash

PURGE_TUNNEL=0
[ "$1" = "--purge" ] && PURGE_TUNNEL=1


echo "Выпиливаем скрипты"
/etc/init.d/getdomains disable
rm -rf /etc/init.d/getdomains

/etc/init.d/vpnroute disable 2>/dev/null
/etc/init.d/routewolf-awg-watchdog disable 2>/dev/null
rm -f /etc/init.d/vpnroute /usr/sbin/domain-routing-route.sh /usr/sbin/domain-routing-status.sh /usr/sbin/routing-openwrt-update.sh /usr/sbin/routing-openwrt-uninstall.sh /usr/sbin/routing-openwrt-healthcheck.sh /usr/sbin/routewolf-awg-watchdog.sh /etc/domain-routing-route.conf
rm -f /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute

echo "Выпиливаем из crontab"
sed -i '/getdomains start/d;/routing-openwrt/d;/domain-routing/d;/vpnroute/d;/routewolf-awg-watchdog/d' /etc/crontabs/root
/etc/init.d/cron restart 2>/dev/null || true

echo "Выпиливаем домены"
rm -f /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst
rm -rf /etc/domain-routing

echo "Чистим firewall, раз раз 🍴"

# Remove LAN DNS redirect created by routing-openwrt
while true; do
    redirect_id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@redirect\[\([0-9]*\)\]\.name='routing_openwrt_force_dns'.*/\1/p" | head -n 1)
    [ -z "$redirect_id" ] && break
    uci -q delete firewall.@redirect[$redirect_id]
done

ipset_id=$(uci show firewall | grep -E '@ipset.*name=.vpn_domains.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$ipset_id" ]; then
    while uci -q delete firewall.@ipset[$ipset_id]; do :; done
fi

rule_id=$(uci show firewall | grep -E '@rule.*name=.mark_domains.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete firewall.@rule[$rule_id]; do :; done
fi

ipset_id=$(uci show firewall | grep -E '@ipset.*name=.vpn_domains_internal.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$ipset_id" ]; then
    while uci -q delete firewall.@ipset[$ipset_id]; do :; done
fi

rule_id=$(uci show firewall | grep -E '@rule.*name=.mark_domains_intenal.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete firewall.@rule[$rule_id]; do :; done
fi

ipset_id=$(uci show firewall | grep -E '@ipset.*name=.vpn_subnets.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$ipset_id" ]; then
    while uci -q delete firewall.@ipset[$ipset_id]; do :; done
fi

rule_id=$(uci show firewall | grep -E '@rule.*name=.mark_subnet.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete firewall.@rule[$rule_id]; do :; done
fi

for name in vpn_domains6 vpn_subnets6; do
    ipset_id=$(uci show firewall | grep -E "@ipset.*name=.$name." | awk -F '[][{}]' '{print $2}' | head -n 1)
    if [ ! -z "$ipset_id" ]; then
        while uci -q delete firewall.@ipset[$ipset_id]; do :; done
    fi
done

for name in mark_domains6 mark_subnet6; do
    rule_id=$(uci show firewall | grep -E "@rule.*name=.$name." | awk -F '[][{}]' '{print $2}' | head -n 1)
    if [ ! -z "$rule_id" ]; then
        while uci -q delete firewall.@rule[$rule_id]; do :; done
    fi
done


# Extra cleanup for named ipsets/rules that may have shifted indexes.
for name in vpn_domains vpn_domains6 vpn_domains_internal vpn_subnets vpn_subnets6; do
    while true; do
        id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='$name'.*/\1/p" | head -n 1)
        [ -z "$id" ] && break
        uci -q delete firewall.@ipset[$id]
    done
done
for name in mark_domains mark_domains6 mark_domains_intenal mark_subnet mark_subnet6; do
    while true; do
        id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='$name'.*/\1/p" | head -n 1)
        [ -z "$id" ] && break
        uci -q delete firewall.@rule[$id]
    done
done
for zone_name in vpn wg awg ovpn singbox tun2socks; do
    while true; do
        id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@zone\[\([0-9]*\)\]\.name='$zone_name'.*/\1/p" | head -n 1)
        [ -z "$id" ] && break
        uci -q delete firewall.@zone[$id]
    done
done
while true; do
    id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@forwarding\[\([0-9]*\)\]\.src='lan'.*/\1/p" | head -n 1)
    [ -z "$id" ] && break
    if uci -q get firewall.@forwarding[$id].dest | grep -qE '^(vpn|wg|awg|ovpn|singbox|tun2socks)$'; then
        uci -q delete firewall.@forwarding[$id]
    else
        break
    fi
done
uci commit firewall
/etc/init.d/firewall restart

echo "Чистим сеть"
while ip rule del fwmark 0x1 table vpn 2>/dev/null; do :; done
while ip rule del priority 100 2>/dev/null; do :; done
ip route flush table vpn 2>/dev/null || true
ip -6 route flush table vpn 2>/dev/null || true
sed -i '/[[:space:]]vpn$/d;/^99[[:space:]]/d' /etc/iproute2/rt_tables 2>/dev/null || true

rule_id=$(uci show network | grep -E '@rule.*name=.mark0x1.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete network.@rule[$rule_id]; do :; done
fi

rule_id=$(uci show network | grep -E '@rule.*name=.mark0x2.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete network.@rule[$rule_id]; do :; done
fi

uci -q delete network.ovpn0
uci -q delete openvpn.routing_openwrt
uci commit openvpn 2>/dev/null || true
while uci -q delete network.vpn_route; do :; done
while uci -q delete network.vpn_route6; do :; done
while uci -q delete network.vpn_route_internal; do :; done
while uci -q delete network.vpn_route_blackhole; do :; done
while uci -q delete network.vpn_route_blackhole6; do :; done

uci commit network

if [ "$PURGE_TUNNEL" = "1" ]; then
    echo "Purge mode: removing project tunnel interfaces awg0/wg0 and peer sections"
    ifdown awg0 2>/dev/null || true
    ifdown wg0 2>/dev/null || true
    /etc/init.d/openvpn stop 2>/dev/null || true
    /etc/init.d/sing-box stop 2>/dev/null || true
    rm -f /etc/openvpn/routing_openwrt.ovpn
    if grep -q 'sbtun0' /etc/sing-box/config.json 2>/dev/null; then
        rm -f /etc/sing-box/config.json
        uci -q delete sing-box.main
        uci commit sing-box 2>/dev/null || true
    fi
    uci -q delete network.awg0
    uci -q delete network.wg0
    uci -q delete network.ovpn0
    uci -q delete openvpn.routing_openwrt
    uci commit openvpn 2>/dev/null || true
    while uci -q delete network.@amneziawg_awg0[0] 2>/dev/null; do :; done
    while uci -q delete network.@wireguard_wg0[0] 2>/dev/null; do :; done
    uci commit network

    for zone_name in awg wg ovpn vpn singbox; do
        while true; do
            id=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@zone\[\([0-9]*\)\]\.name='$zone_name'.*/\1/p" | head -n 1)
            [ -z "$id" ] && break
            uci -q delete firewall.@zone[$id]
        done
    done
    uci commit firewall
fi

/etc/init.d/network restart

uci -q del_list dhcp.@dnsmasq[0].confdir='/tmp/dnsmasq.d'
uci -q delete dhcp.@dnsmasq[0].filter_aaaa
uci commit dhcp 2>/dev/null || true
/etc/init.d/dnsmasq restart 2>/dev/null || true

echo "Проверяем Dnsmasq"
if uci show dhcp | grep -q ipset; then
    echo "В dnsmasq (/etc/config/dhcp) заданы домены. Нужные из них сохраните, остальные удалите вместе с ipset"
fi

if [ "$PURGE_TUNNEL" = "1" ]; then
    echo "Туннели awg0/wg0 проекта удалены"
else
    echo "Туннели оставлены. Для полного удаления используйте: uninstall.sh --purge"
fi
echo "Dnscrypt, stubby тоже не трогаем"

echo "  ______  _____        _____   _____  ______  _     _  _____   _____"
echo " |  ____ |     |      |_____] |     | |     \ |____/  |     | |_____]"
echo " |_____| |_____|      |       |_____| |_____/ |    \_ |_____| |     "
