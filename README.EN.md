# routing-openwrt

Simple domain-based VPN routing for OpenWrt.

This project is a fork and modification of:
https://github.com/itdoginfo/domain-routing-openwrt

## What it does

`routing-openwrt` downloads domain lists from GitHub, connects them to `dnsmasq`/`nftset`, and routes only matched domains through the selected tunnel.
Normal traffic stays on the regular WAN route.

Currently supported automatically:

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN

Sing-box is planned. The installer checks router resources before allowing Sing-box work.
`tun2socks` is removed from the menu to avoid confusion.

## Lists

Default lists:

```text
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Main list:

```text
lists/domains-dnsmasq-nfset.lst
```

A simple domain list is supported:

```text
youtube.com
youtu.be
googlevideo.com
```

The installer converts it to `dnsmasq/nftset` format automatically.

IPv4 CIDR and IPv6 are disabled by default.

## Install from GitHub

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

The installer first asks for a language:

```text
1) English
2) Русский
```

## Update

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

## Uninstall

Normal uninstall:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Full purge:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## Manual ZIP install

Upload the ZIP to `/tmp` and run:

```sh
cd /tmp
rm -rf /tmp/routing-openwrt /tmp/routing-openwrt-main /tmp/routing-openwrt.zip
unzip -o /tmp/routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null || true
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh --reinstall
```

`/tmp` is temporary; the installer copies required files into `/usr/sbin`, `/etc/init.d`, and `/etc/domain-routing`.

## OpenVPN

OpenVPN has two modes:

1. paste a full `.ovpn` config;
2. create OpenVPN manually in LuCI, then let the installer detect the `tun` interface.

## Auto-update

Lists are refreshed every day:

```text
02:00 — list update
03:15 — route/dnsmasq health check
```

The local list is replaced completely, so removed GitHub domains are removed from the router too.
If GitHub is unavailable, the last working cache is used from:

```text
/etc/domain-routing/lists
```

## Check

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list ruleset | grep mark_domains
```

Default mode is fail-open: if VPN goes down, normal WAN internet should continue working.
