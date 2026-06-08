# Domain Routing OpenWrt — Rafael Fork

> **Important:** this project was not written from scratch. It is a modified fork of [`itdoginfo/domain-routing-openwrt`](https://github.com/itdoginfo/domain-routing-openwrt).  
> The original idea, base domain/IP policy routing logic and parts of the code come from the original project. This fork adds maintainer-owned lists, AmneziaWG 2.0 support, daily updates and safer behavior when the VPN or list update fails.

## What it does

The script configures OpenWrt to route only selected domains and IPv4 CIDR networks through a VPN interface. Normal internet traffic continues to use the default WAN route.

Flow:

1. `dnsmasq-full` resolves configured domains and adds their IP addresses to the `vpn_domains` nft set.
2. IPv4 CIDR entries are loaded into `vpn_subnets`.
3. Firewall marks matching traffic with `0x1`.
4. `ip rule` sends marked traffic to the separate `vpn` routing table.
5. The `vpn` table routes marked traffic through `wg0`, `awg0` or `tun0`.

Unmarked traffic is not changed.

## Tested status

Currently tested mainly with:

- AmneziaWG / AmneziaWG 2.0
- OpenWrt 24.x
- `dnsmasq-full` + `nftset`
- IPv4 domain routing
- IPv4 CIDR routing

Not fully confirmed yet:

- plain WireGuard in all scenarios;
- Sing-box;
- OpenVPN;
- tun2socks;
- IPv6 routing.

These modes remain in the project but should be treated as experimental/manual until tested.

## Main differences from the original project

- Removed old list modes: `russia-inside`, `russia-outside`, `ukraine`.
- Uses maintainer-owned GitHub lists by default:
  - domains: `https://raw.githubusercontent.com/dagmagnat/Routing-OpenWrt/main/domains/my-domains.lst`
  - IPv4 CIDR: `https://raw.githubusercontent.com/dagmagnat/Routing-OpenWrt/main/domains/my-ip.lst`
- Updates lists every day at **02:00** using cron.
- Caches the last known good lists under `/etc/domain-routing/lists`.
- Supports plain domain lists and dnsmasq/nftset lists.
- Supports full AmneziaWG config paste ending with a single `END` line.
- Supports AmneziaWG 2.0 options such as `S3`, `S4`, `I1`–`I5`.
- Detects existing `wg0`/`awg0` config and can skip or replace it.
- IPv6 is disabled by default with `dnsmasq filter_aaaa=1` to prevent clients from bypassing IPv4 VPN routing via IPv6.
- If the VPN interface is missing/down, the helper installs a `blackhole default` route only in the `vpn` table. This prevents routed domains/IPs from leaking to WAN while normal unmarked internet remains unaffected.

## Installation

Copy the ZIP to `/tmp` on the router and run:

```sh
cd /tmp
opkg update
opkg install unzip

rm -rf /tmp/domain-routing-openwrt-master
unzip -o /tmp/domain-routing-openwrt-rafael-fork.zip -d /tmp

cd /tmp/domain-routing-openwrt-master
chmod +x getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./getdomains-install.sh
```

## List updates

Cron is configured as:

```cron
0 2 * * * /etc/init.d/getdomains start
```

Run manually:

```sh
/etc/init.d/getdomains start
```

## List formats

Plain domains are supported:

```txt
youtube.com
youtu.be
googlevideo.com
ytimg.com
```

Ready dnsmasq/nftset format is also supported:

```txt
nftset=/youtube.com/4#inet#fw4#vpn_domains
nftset=/youtu.be/4#inet#fw4#vpn_domains
```

IPv4 CIDR list format:

```txt
8.8.8.8
13.69.0.0/16
142.250.0.0/15
```

## Diagnostics

Quick status:

```sh
/usr/sbin/domain-routing-status.sh
```

Detailed checks:

```sh
ip addr show awg0
ip route show table vpn
ip rule show

dnsmasq --test
head -n 20 /tmp/dnsmasq.d/domains.lst
head -n 20 /tmp/lst/ipv4.lst

nft list set inet fw4 vpn_domains | head -n 80
nft list set inet fw4 vpn_subnets | head -n 80
nft list ruleset | grep -E "vpn_domains|vpn_subnets|mark_domains|mark_subnet|0x00000001" -n
```

Check marked routing:

```sh
ip route get 172.217.19.238 mark 0x1
```

Expected result: route via `awg0`, `wg0` or `tun0`.

## Notes

This fork is still under active testing. The primary confirmed scenario is AmneziaWG + IPv4 domain/CIDR routing. Keep backup access to your OpenWrt router while testing.
