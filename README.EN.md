# routing-openwrt

A simple OpenWrt script: domains from your list are routed through the selected VPN tunnel, while normal internet stays on WAN.

This project is a fork and modification of the original project: https://github.com/itdoginfo/domain-routing-openwrt

## Supported

- WireGuard
- AmneziaWG / Amnezia WireGuard
- OpenVPN: paste a full `.ovpn` config or select an existing tun interface
- Sing-box: not configured automatically yet, resource check only

`tun2socks` was removed from the menu to avoid confusing users. For VLESS/Reality, Sing-box is the better future direction.

## Routing lists

Default lists are loaded from:

```text
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/domains-dnsmasq-nfset.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv4.lst
https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/lists/ipv6.lst
```

Lists update daily at 02:00. If a domain is removed from GitHub, it is removed from the router after the next update. If GitHub is unavailable, the last working cache is used.

## Install from GitHub

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/install.sh | sh
```

## Update

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh | sh
```

## Uninstall

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh
```

Full project config purge:

```sh
wget --no-check-certificate -O - https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh | sh -s -- --purge
```

## Manual ZIP install

Upload the archive to `/tmp` on the router, then run:

```sh
cd /tmp
unzip -o routing-openwrt.zip -d /tmp
mv /tmp/routing-openwrt-main /tmp/routing-openwrt 2>/dev/null || true
cd /tmp/routing-openwrt
chmod +x install.sh update.sh uninstall.sh getdomains-install.sh getdomains-uninstall.sh getdomains-check.sh
sh ./install.sh
```

`/tmp` is recommended for manual install because it is temporary and does not consume permanent flash after reboot.

## OpenVPN

When OpenVPN is selected, the installer checks and installs:

- `openvpn-openssl`
- `luci-app-openvpn` — optional LuCI UI
- `kmod-ovpn-dco` — optional DCO acceleration when available for your firmware

OpenVPN modes:

1. paste a full `.ovpn` config;
2. create OpenVPN manually in LuCI first, then return and select the existing tun interface.

## Check status

```sh
/usr/sbin/domain-routing-status.sh
ip route show table vpn
ip rule show | grep fwmark
nft list set inet fw4 vpn_domains | head
```

If the VPN goes down temporarily, normal WAN internet should continue working. Default mode is fail-open.
