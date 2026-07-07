# RouteWolf

Simple OpenWrt script: domains and IPv4 CIDR from lists go through the selected tunnel, while normal internet stays on WAN.

Fork and modification of the original project: https://github.com/itdoginfo/domain-routing-openwrt

## Supported

System: OpenWrt 23.05/24.10, experimental OpenWrt/X-WRT/ImmortalWrt 25.x and 26.x compatible builds with `uci`, `netifd`, `procd`, `fw4/nftables`, `opkg` or `apk`.

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN
- Sing-box, experimental: VLESS Reality through `sbtun0`

Default safety mode: **fail-open**. If the tunnel fails, normal WAN internet should not break.

## Lists

By default, lists are loaded from this repository:

```text
https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/lists/ipv6.lst
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
/usr/sbin/routewolf-load.sh
```

For weak routers, use the `lite` profile and WireGuard/AmneziaWG. Sing-box checks flash/RAM before installation and is not recommended for 16/64 MB devices.

## Install from GitHub

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/install.sh | sh
```

If `wget` has no HTTPS support on X-WRT/ImmortalWrt, install `curl` with `apk` first:

```sh
apk update
apk add curl ca-certificates ca-bundle unzip
curl -kL https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/install.sh | sh
```

If `curl` is already installed, only the last line is needed.

## Update

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/update.sh | sh
```

The update command updates project scripts, downloads fresh GitHub lists, restarts `dnsmasq`/`firewall`, and restores the `table vpn` route.

## Uninstall

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/uninstall.sh | sh
```

Full project config cleanup:

```sh
wget -O - https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/uninstall.sh | sh -s -- --purge
```

## Manual ZIP install

Upload the archive to `/tmp` on the router and run:

```sh
cd /tmp
unzip -o RouteWolf.zip -d /tmp
mv /tmp/RouteWolf-main /tmp/routewolf 2>/dev/null || mv /tmp/routewolf-main /tmp/routewolf 2>/dev/null || true
cd /tmp/routewolf
chmod +x install.sh update.sh uninstall.sh routewolf-install.sh routewolf-uninstall.sh routewolf-check.sh
sh ./install.sh
```

`/tmp` is recommended for manual installation because it is temporary and does not use permanent flash after reboot.

## Diagnostics

```sh
/usr/sbin/routewolf-diagnose.sh
```

Diagnostics show tunnel status, YouTube route test, DNS, lists, nftset, fwmark, `vpn` table, and common errors.

## Check

```sh
/usr/sbin/routewolf-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list set inet fw4 vpn_domains | head
```

### Quick commands after install

```sh
rw help
rw status
rw diag
rw load
rw lists
rw repair
rw dco status
rw dco off
rw dco on
rw openvpn restart
```

OpenVPN uses stable `disable-dco` mode by default. You can enable DCO with `rw dco on` if your firmware/kernel works with it reliably.

## Sing-box: static link and subscription

RouteWolf v35 supports two Sing-box source modes:

```text
1. Static VLESS Reality link — parameters do not auto-refresh.
2. Subscription or JSON URL — RouteWolf periodically fetches current parameters.
```

Secret URLs are not printed in full and are stored in `/etc/routewolf/singbox.conf` with mode `600`.

Quick commands:

```sh
rw singbox set-link 'vless://...'
rw singbox set-url 'https://example.com/sub-or-json' 60
rw singbox update
rw singbox status
rw singbox restart
rw singbox log
```

For subscription/JSON URLs, cron auto-update is enabled. The default interval is 60 minutes. Sing-box stays in safe mode: `auto_route=false`, `strict_route=false`; RouteWolf sends only marked domains/IPs into `sbtun0` using `dnsmasq -> nftset -> fwmark -> table vpn`.


## RouteWolf v40: stable policy routing and universal watchdog

- Added an experimental **Outline** client for ordinary static `ss://` keys.
- On OpenWrt, Outline uses the official OpenWrt `sing-box-tiny` package as the Shadowsocks client engine.
- `auto_route` is disabled: only RouteWolf-listed domains/IPs use the tunnel and the normal WAN stays the main route.
- Dynamic Outline keys, prefixes, WebSocket and plugins are not supported yet.
- Sing-box/Outline requires at least 64 MB flash, 40 MB free flash and 128 MB RAM. Use WireGuard/AmneziaWG/OpenVPN on 16 MB flash.
- The universal watchdog checks the selected tunnel every 30 minutes, restarts only that tunnel after two failed checks and reapplies policy routing.
- On router boot, the selected tunnel is forcibly recovered. Fail-open mode keeps the normal WAN available when a tunnel fails.

### v40 fixes

- Replaced anonymous `network.@rule[-1]` creation that caused `uci: Invalid argument` on some OpenWrt 24.10 builds.
- The `fwmark 0x1/0x1` rule now uses named section `network.routewolf_mark` and numeric table `99`.
- Boot repair removes stale duplicate rules and keeps one rule at priority `100`.
- The installer no longer prints a false `[OK]`; a UCI failure stops the step with `[ERROR]`.
- Diagnostics now reports the current build version.

### OpenWrt 25.12 and APK

RouteWolf does not install the generic `wget`/`wget-nossl` package because it can shadow the built-in `uclient-fetch` and break APK HTTPS downloads. If the system wget is already broken, the installer temporarily uses `/bin/uclient-fetch` or `curl` for its own APK commands without changing system files.
