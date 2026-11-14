#!/bin/sh
# Download data over verified HTTPS with a per-process file-size limit.
set -u
url=${1:-}; out=${2:-}; limit=${3:-2097152}
case "$url" in https://*) ;; *) echo 'HTTPS URL required' >&2; exit 2 ;; esac
case "$limit" in ''|*[!0-9]*) exit 2 ;; esac
[ "$limit" -ge 1 ] && [ "$limit" -le 2097152 ] || exit 2
[ -n "$out" ] || exit 2
blocks=$(((limit + 511) / 512))
check_file() { [ -s "$out" ] && [ "$(wc -c <"$out")" -le "$limit" ]; }
rm -f "$out"
if command -v curl >/dev/null 2>&1; then
    if (ulimit -f "$blocks"; exec curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 75 --retry 1 --max-filesize "$limit" "$url" -o "$out") && check_file; then exit 0; fi
    rm -f "$out"
fi
if [ -x /bin/uclient-fetch ]; then
    if (ulimit -f "$blocks"; exec /bin/uclient-fetch -T 30 -O "$out" "$url") && check_file; then exit 0; fi
    rm -f "$out"
fi
echo 'Verified HTTPS download failed; current configuration retained' >&2
exit 1
