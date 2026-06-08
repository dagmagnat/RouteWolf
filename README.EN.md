# routing-openwrt

> **Important:** this project was not created from scratch. It is a modified fork of [`itdoginfo/domain-routing-openwrt`](https://github.com/itdoginfo/domain-routing-openwrt).  
> The original routing idea, base domain/IP routing logic and parts of the code come from the original project. This fork adds repository-maintained lists, AmneziaWG 2.0 support, daily updates, list caching and safer failure behavior.

## What it does

`routing-openwrt` configures OpenWrt so that **only selected domains and CIDR networks** go through a VPN interface, while normal internet traffic continues to use the default WAN route.

Default list source for this fork:

```txt
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

The installer does not ask for custom list URLs by default. If you fork this project, change the defaults at the top of `getdomains-install.sh`.

## Tested status

Currently tested mainly with:

- OpenWrt 24.x;
- `dnsmasq-full` + `nftset`;
- AmneziaWG / AmneziaWG 2.0;
- IPv4 domain routing;
- IPv4 CIDR routing.

Still needs real-device testing:

- plain WireGuard in all scenarios;
- OpenVPN/tun;
- Sing-box/tun2socks;
- full IPv6 routing.

## Safety behavior

Only traffic marked with `0x1` is routed through the separate `vpn` table. Unmarked traffic continues to use the normal OpenWrt `main` table.

If the VPN interface is up, the `vpn` table should contain something like:

```sh
default dev awg0 scope link
```

If the VPN interface is missing or down, the helper installs:

```sh
blackhole default
```

This prevents routed domains/IPs from leaking directly to WAN, while normal unmarked internet should remain unaffected.

## List files

Repository paths:

```txt
lists/domains-dnsmasq-nfset.lst
lists/ipv4.lst
lists/ipv6.lst
```

Domain list may be either dnsmasq/nftset format:

```txt
nftset=/youtube.com/4#inet#fw4#vpn_domains
nftset=/youtu.be/4#inet#fw4#vpn_domains
```

or a plain domain list:

```txt
youtube.com
youtu.be
googlevideo.com
```

The script normalizes plain domains into dnsmasq/nftset format automatically.

IPv4 list format:

```txt
8.8.8.8
13.69.0.0/16
142.250.0.0/15
```

IPv6 is disabled by default. To enable it in your fork, set this at the top of `getdomains-install.sh`:

```sh
DEFAULT_IPV6_SUPPORT="1"
```

## Install from GitHub

```sh
cd /tmp
opkg update
opkg install unzip wget

rm -rf /tmp/routing-openwrt-main /tmp/routing-openwrt.zip
wget -O /tmp/routing-openwrt.zip https://github.com/dagmagnat/routing-openwrt/archive/refs/heads/main.zip
unzip -o /tmp/routing-openwrt.zip -d /tmp

cd /tmp/routing-openwrt-main
chmod +x install.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

## Daily list updates

The installer creates this cron job:

```cron
0 2 * * * /etc/init.d/getdomains start
```

Manual update:

```sh
/etc/init.d/getdomains start
```

## Diagnostics

Quick status:

```sh
/usr/sbin/domain-routing-status.sh
```

Detailed checks:

```sh
ip route show table vpn
ip rule show
dnsmasq --test
nft list set inet fw4 vpn_domains | head -n 80
nft list set inet fw4 vpn_subnets | head -n 80
logread | grep -Ei "getdomains|vpnroute|dnsmasq|amnezia|awg|nft|error|failed" | tail -n 100
```

## Uninstall

```sh
cd /tmp/routing-openwrt-main
sh ./uninstall.sh
```
