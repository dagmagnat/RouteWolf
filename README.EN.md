# routing-openwrt

`routing-openwrt` configures OpenWrt to route selected domains through a VPN/tunnel while keeping normal internet traffic on the regular WAN route.

This is not a project written from scratch. It is a modified fork of [`itdoginfo/domain-routing-openwrt`](https://github.com/itdoginfo/domain-routing-openwrt).

## Default behavior

Safe defaults:

- domain routing: enabled;
- IPv4 CIDR routing: disabled;
- IPv6 routing: disabled;
- forced DNS redirect: disabled;
- fail mode: fail-open, so normal WAN internet should not be broken if the VPN is down.

The main tested scenario is OpenWrt 24.x + dnsmasq-full/nftset + AmneziaWG/AmneziaWG 2.0 + IPv4 domain routing. WireGuard, OpenVPN/tun, Sing-box/tun2socks, CIDR routing, IPv6 routing and OpenWrt 25.12+ with apk still need more real-router testing.

OpenWrt 24.10 and older use `opkg`. OpenWrt 25.12 and newer use `apk`. The installer supports both package managers.

## Default lists

```txt
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

By default, only the domain list is used. IPv4 CIDR and IPv6 are disabled for safety.

If you move the lists to a separate repository, edit `DEFAULT_LISTS_REPO` in `getdomains-install.sh`.

## Install from GitHub

Recommended interactive install:

```sh
cd /tmp
rm -rf /tmp/routing-openwrt /tmp/routing-openwrt-main /tmp/routing-openwrt.zip
wget --no-check-certificate -O /tmp/routing-openwrt.zip https://github.com/dagmagnat/routing-openwrt/archive/refs/heads/main.zip
unzip -o /tmp/routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

Force tunnel reconfiguration:

```sh
sh ./install.sh --reinstall
```

Quick install:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

## Manual ZIP install

Copy the ZIP to `/tmp`, for example `/tmp/routing-openwrt-v15.zip`, then run:

```sh
cd /tmp
rm -rf /tmp/routing-openwrt /tmp/routing-openwrt-main
unzip -o /tmp/routing-openwrt-v15.zip -d /tmp
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

## Update

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

Local command after installation:

```sh
/usr/sbin/routing-openwrt-update.sh
```

## Uninstall

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Local command after installation:

```sh
/usr/sbin/routing-openwrt-uninstall.sh
```

Normal uninstall keeps the existing `awg0/wg0` tunnel. Full purge:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## List format

Domain list can be plain domains:

```txt
youtube.com
youtu.be
googlevideo.com
ytimg.com
```

or dnsmasq/nftset format:

```txt
nftset=/youtube.com/4#inet#fw4#vpn_domains
nftset=/youtu.be/4#inet#fw4#vpn_domains
```

IPv4 CIDR format:

```txt
8.8.8.8
13.69.0.0/16
142.250.0.0/15
```

## Check

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show
nft list set inet fw4 vpn_domains | head -n 50
nslookup youtube.com 192.168.1.1
```
