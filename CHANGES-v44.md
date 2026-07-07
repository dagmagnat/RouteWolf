# RouteWolf v44 — low-flash-safe installation

- Removed mandatory installation of `nano` and `curl` from shell and Ansible paths.
- Added a storage preflight for `/overlay` and `/tmp` before package operations.
- Added safe cleanup for interrupted APK installs and stale `nano` entries in `/etc/apk/world`.
- Added standalone `cleanup.sh` and the installed command `rw cleanup`.
- AmneziaWG APK packages are installed one at a time; APK cache is cleaned after every transaction.
- Optional LuCI Russian translation is skipped automatically on small flash devices.
- A package failure now stops tunnel configuration immediately.
- Removed the persistent UCI policy-rule section that caused `uci: Invalid argument` on some OpenWrt 24/25 builds. The runtime rule is restored by RouteWolf init and hotplug scripts.
- Bootstrap archives and extracted sources are removed after install/update/uninstall.
- Added short `/bin/uclient-fetch -qO- ... | sh` commands to the documentation.
- Preserved official APK feed installation for OpenWrt 25.x and IPK release installation for OpenWrt 24.x.
- Fixed the pre-existing YAML indentation error in `tasks/main.yml`.
