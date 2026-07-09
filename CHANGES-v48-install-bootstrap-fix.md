# RouteWolf v48 — install bootstrap fix

- Replaced the documented OpenWrt one-line commands from `uclient-fetch -qO-` to the safer form `uclient-fetch --no-check-certificate -O - ... | sh`.
- Updated bootstrap error hints in `install.sh`, `update.sh`, and `uninstall.sh` to the same safe command format.
- Made bootstrap local-mode path detection more BusyBox/POSIX friendly by avoiding `dirname --` and `cd --`.
- Kept the v47 Smart TV changes: WG/AWG MTU defaults, AmneziaWG MTU parsing, TV-safe DNS mode, and `rw mtu`.
