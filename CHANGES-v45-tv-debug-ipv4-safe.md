# RouteWolf v45 TV debug / IPv4 safe

Changes made for testing YouTube on Smart TV / Android TV:

- Added `rw youtube [CLIENT_IP]` diagnostic command.
- Added `rw purge` to clear stale nft/dnsmasq temporary state and reload lists.
- IPv4 CIDR list normalization now rejects too-wide networks by default (`IPV4_MIN_PREFIX=16`).
- IPv4 CIDR list normalization now has a safety limit (`IPV4_MAX_ENTRIES=200000`).
- Added common YouTube TV / Android TV helper domains to the bundled full list.
- Kept IPv6 disabled by default with `filter_aaaa=1` behavior when IPv6 support is off.

Recommended test after install:

```sh
rw purge
rw dns on
rw youtube 192.168.1.50
```

Replace `192.168.1.50` with the TV/box IP from `/tmp/dhcp.leases`.
