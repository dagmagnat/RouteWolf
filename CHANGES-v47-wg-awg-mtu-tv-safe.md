# RouteWolf v47 — WG/AWG MTU + Smart TV safe defaults

Focus: small 16 MB OpenWrt routers where WireGuard and AmneziaWG are the primary supported tunnels.

## Changed

- Added safe MTU defaults:
  - WireGuard: `1280`
  - AmneziaWG: `1280`
  - sing-box/Outline TUN: `1280`
- AmneziaWG full-config parser now reads `[Interface] MTU`.
- New WG/AWG installs write `network.wg0.mtu` / `network.awg0.mtu` automatically.
- Update mode adds missing MTU to existing `wg0`, `awg0`, `wg1`, `awg1` without reinstalling the tunnel.
- `routewolf-route.sh` stores and reapplies `VPN_ROUTE_MTU` at runtime so route repair/watchdog keeps the MTU stable.
- Fresh installs now enable TV-safe DNS interception by default, same as update/tvfix path.
- `rw youtube [TV_IP]` now prints active VPN MTU diagnostics.
- Added `rw mtu [VALUE]`:
  - `rw mtu` shows configured/runtime MTU.
  - `rw mtu 1280` sets WG/AWG MTU and repairs the policy route.

## Why

Some Smart TV / Android TV / Samsung / LG clients stopped working after later routing changes even when YouTube domains were added to `vpn_domains`. QUIC disabling was not enough. The likely failure path is fragmented or silently dropped packets through WG/AWG/TUN, especially for YouTube video traffic on TV clients. MTU 1280 is conservative and safe for these devices and for AmneziaWG overhead.

## Notes

- OpenVPN remains available but is not the priority path for 16 MB flash routers.
- You can override defaults before install/update:

```sh
ROUTEWOLF_WG_MTU=1360 ROUTEWOLF_AWG_MTU=1280 sh install.sh
```

- After updating an existing router, run:

```sh
rw mtu 1280
rw purge
rw repair
rw youtube TV_IP
```
