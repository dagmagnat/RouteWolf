# RouteWolf v43

## AmneziaWG package installation

- Added an explicit APK path for OpenWrt 25.12+ using the official signed AmneziaWG feed:
  `https://slava-shchipunov.github.io/awg-openwrt/<version>/<target>/<subtarget>/packages.adb`
- Added public key installation from the official feed key URL.
- APK installation uses RouteWolf's safe downloader environment and installs:
  `amneziawg-tools`, `kmod-amneziawg`, `luci-proto-amneziawg`.
- OpenWrt 24.10/23.05 keeps the official IPK installer path from GitHub Releases.
- The IPK installer is launched with a temporary HTTPS-capable `wget` wrapper based on
  `/bin/uclient-fetch` or `curl`, so `wget-nossl` cannot break package downloads.
- Added exact version and target/subtarget detection and feed availability checks.
- Added package installation verification and package-source recording in
  `/etc/routewolf/awg-package-source`.
- Removed misleading OPKG-only recovery advice from APK failures.
