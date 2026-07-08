# RouteWolf v46 Smart TV migration

- `rw update` and nightly 02:00 auto-update now apply project migrations, not only list refresh.
- Update migration enables forced LAN DNS redirect automatically so TV/STB DNS requests go through dnsmasq and fill `vpn_domains`.
- When IPv6 routing is not enabled, update migration enables `filter_aaaa=1` to prevent Smart TVs from bypassing IPv4 domain routing through IPv6.
- Added `rw tvfix` command: forced DNS + AAAA filtering + firewall/dnsmasq restart.
- Kept IPv4 safety from v45: CIDR wider than `/16` is dropped, max list size defaults to 200000 entries.
