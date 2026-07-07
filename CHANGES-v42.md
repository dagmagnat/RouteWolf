# RouteWolf v42

- Universal HTTPS bootstrap for OpenWrt with opkg and apk.
- Prefers `/bin/uclient-fetch`, then `uclient-fetch`, `curl`, and finally `wget`.
- Does not require package installation just to unpack the project; uses BusyBox `tar.gz`.
- Installed `rw update` and uninstall helpers no longer call `wget` directly.
- AmneziaWG installer downloads use the same universal downloader.
- OpenWrt 25.12 APK commands continue to use a private uclient-fetch/curl shim when system wget is broken.
