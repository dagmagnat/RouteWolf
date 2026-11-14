#!/bin/sh
# Compatibility URL. Delegate to the current RouteWolf entry point.
target=uninstall.sh
dir=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd)
if [ "${0##*/}" = "getdomains-uninstall.sh" ] && [ -f "$dir/routewolf-install.sh" ] && [ -f "$dir/$target" ]; then
    exec sh "$dir/$target" "$@"
fi
umask 077
work=$(mktemp -d /tmp/routewolf-compat.XXXXXX) || exit 1
trap 'rm -rf "$work"' EXIT
url="https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/$target"
ok=0
if command -v curl >/dev/null 2>&1; then
    (ulimit -f 256; exec curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 75 --max-filesize 131072 "$url" -o "$work/$target") && ok=1
fi
if [ "$ok" != 1 ] && [ -x /bin/uclient-fetch ]; then
    (ulimit -f 256; exec /bin/uclient-fetch -T 30 -O "$work/$target" "$url") && ok=1
fi
[ "$ok" = 1 ] && [ -s "$work/$target" ] || exit 1
sh -n "$work/$target" || exit 1
sh "$work/$target" "$@"
