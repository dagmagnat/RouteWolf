# routing-openwrt

Simple OpenWrt script: domains and IPv4 CIDR from lists go through the selected tunnel, while normal internet stays on WAN.

Fork and modification of the original project: https://github.com/itdoginfo/domain-routing-openwrt

## Supported

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN
- Sing-box, experimental: VLESS Reality through `sbtun0`

Default safety mode: **fail-open**. If the tunnel fails, normal WAN internet should not break.

## Lists

By default, lists are loaded from this repository:

```text
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Domains and IPv4 are enabled by default. IPv6 is disabled by default.

Lists are updated every day at 02:00. The local list is fully replaced: if a domain or IP is removed on GitHub, it will be removed on the router after update. If GitHub is temporarily unavailable, the last working cache is used.


## List profiles

During installation you can choose a list profile:

```text
full  — full lists from lists/domains-dnsmasq-nfset.lst and lists/ipv4.lst
lite  — small list from lists/profiles/lite/ for weak routers
custom — custom list URLs
```

Custom domain lists may be plain one-domain-per-line files, and IPv4 lists may be plain CIDR files. The script converts domains to `dnsmasq/nftset` format automatically.

To add a new profile, create:

```text
lists/profiles/<name>/domains.lst
lists/profiles/<name>/ipv4.lst
lists/profiles/<name>/ipv6.lst
```

The folder name will be shown in the installer menu.

## Router load

The project does not run a heavy routing daemon. Routing is handled by `dnsmasq`, `nftables`, and `ip rule`. To inspect load:

```sh
/usr/sbin/routing-openwrt-load.sh
```

For weak routers, use the `lite` profile and WireGuard/AmneziaWG. Sing-box checks flash/RAM before installation and is not recommended for 16/64 MB devices.

## Install from GitHub

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

## Update

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

The update command updates project scripts, downloads fresh GitHub lists, restarts `dnsmasq`/`firewall`, and restores the `table vpn` route.

## Uninstall

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Full project config cleanup:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## Manual ZIP install

Upload the archive to `/tmp` on the router and run:

```sh
cd /tmp
unzip -o routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null || true
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

`/tmp` is recommended for manual installation because it is temporary and does not use permanent flash after reboot.

## Diagnostics

```sh
/usr/sbin/routing-openwrt-diagnose.sh
```

Diagnostics show tunnel status, YouTube route test, DNS, lists, nftset, fwmark, `vpn` table, and common errors.

## Check

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list set inet fw4 vpn_domains | head
```
