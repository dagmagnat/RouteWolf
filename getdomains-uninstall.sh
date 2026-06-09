#!/bin/ash

echo "Выпиливаем скрипты"
/etc/init.d/getdomains disable
rm -rf /etc/init.d/getdomains

/etc/init.d/vpnroute disable 2>/dev/null
rm -f /etc/init.d/vpnroute /usr/sbin/domain-routing-route.sh /usr/sbin/domain-routing-status.sh /etc/domain-routing-route.conf
rm -f /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute

echo "Выпиливаем из crontab"
sed -i '/getdomains start/d' /etc/crontabs/root

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

uci commit firewall
/etc/init.d/firewall restart

echo "Чистим сеть"
ip route flush table vpn 2>/dev/null || true
ip -6 route flush table vpn 2>/dev/null || true
sed -i '/99 vpn/d' /etc/iproute2/rt_tables

rule_id=$(uci show network | grep -E '@rule.*name=.mark0x1.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete network.@rule[$rule_id]; do :; done
fi

rule_id=$(uci show network | grep -E '@rule.*name=.mark0x2.' | awk -F '[][{}]' '{print $2}' | head -n 1)
if [ ! -z "$rule_id" ]; then
    while uci -q delete network.@rule[$rule_id]; do :; done
fi

while uci -q delete network.vpn_route; do :; done
while uci -q delete network.vpn_route_internal; do :; done

uci commit network
/etc/init.d/network restart

uci -q delete dhcp.@dnsmasq[0].filter_aaaa
uci commit dhcp 2>/dev/null || true
/etc/init.d/dnsmasq restart 2>/dev/null || true

echo "Проверяем Dnsmasq"
if uci show dhcp | grep -q ipset; then
    echo "В dnsmasq (/etc/config/dhcp) заданы домены. Нужные из них сохраните, остальные удалите вместе с ipset"
fi

echo "Все туннели, прокси, зоны и forwarding к ним оставляем на месте, они вам не помешают и скорее пригодятся"
echo "Dnscrypt, stubby тоже не трогаем"

echo "  ______  _____        _____   _____  ______  _     _  _____   _____"
echo " |  ____ |     |      |_____] |     | |     \ |____/  |     | |_____]"
echo " |_____| |_____|      |       |_____| |_____/ |    \_ |_____| |     "
