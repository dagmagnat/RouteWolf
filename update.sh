#!/bin/sh
# Keep the automatic channel independent of optional releases and LuCI.
set -eu
umask 077
base=https://github.com/dagmagnat/RouteWolf/releases
mirrors=https://raw.githubusercontent.com/dagmagnat/RouteWolf/main/releases
agent=/usr/sbin/routewolf-stable-update.sh
state=/etc/routewolf
mode=check
requested=
panel=0

case "${1:-}" in
    --luci) requested=60; panel=1; shift ;;
    --version) requested=${2:-}; [ -n "$requested" ] || exit 2; shift 2 ;;
    --auto|--lists-auto|--code-auto|check) mode=$1; shift ;;
esac
[ "$#" -eq 0 ] || { echo 'Usage: update.sh [--luci|--version VERSION|--lists-auto|--code-auto]' >&2; exit 2; }
if [ -n "$requested" ]; then
    case "$requested" in 0*|*[!0-9]*) exit 2 ;; esac
    [ "${#requested}" -le 6 ] && [ "$requested" -ge 60 ] || exit 2
elif [ -x "$agent" ]; then
    exec "$agent" "$mode"
elif [ "$mode" = --lists-auto ] || [ "$mode" = --auto ]; then
    [ ! -x /etc/init.d/routewolf ] || /etc/init.d/routewolf start
    exit "$?"
fi

if [ ! -x /etc/init.d/routewolf ] && [ ! -f "$state/route.conf" ] &&
   [ ! -f /etc/domain-routing-route.conf ]; then
    echo 'No existing RouteWolf installation found. Run install.sh for a new setup.' >&2
    exit 1
fi

fetch() {
    url=$1 dest=$2 limit=$3
    rm -f "$dest"
    if command -v curl >/dev/null 2>&1; then
        (ulimit -f "$(((limit+511)/512))"; exec curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 75 --max-filesize "$limit" "$url" -o "$dest") &&
            [ -s "$dest" ] && [ "$(wc -c <"$dest")" -le "$limit" ] && return 0
        rm -f "$dest"
    fi
    [ -x /bin/uclient-fetch ] &&
        (ulimit -f "$(((limit+511)/512))"; exec /bin/uclient-fetch -T 30 -O "$dest" "$url") >/dev/null 2>&1 &&
        [ -s "$dest" ] && [ "$(wc -c <"$dest")" -le "$limit" ]
}

verify() {
    expected=$(field "$1" "${3:-$work/manifest}")
    printf '%s\n' "$expected" | grep -Eq '^[0-9a-f]{64}$' &&
        [ "$(sha256sum "$2" | awk '{print $1}')" = "$expected" ]
}

field() { sed -n "s/^$1=//p" "${2:-$work/manifest}"; }

available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
case "$available" in ''|*[!0-9]*) available=0 ;; esac
[ "$available" -ge 8192 ] || { echo 'Less than 8 MiB available RAM; existing project retained' >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || exit 1
work=$(mktemp -d /tmp/routewolf-update.XXXXXX)
trap 'rm -rf "$work"' EXIT
trap 'exit 1' HUP INT TERM

manifest="$base/latest/download/stable.manifest"
[ -z "$requested" ] || manifest="$base/download/v$requested/stable.manifest"
[ "$requested" != 60 ] || manifest="$mirrors/v60.manifest"
fetch "$manifest" "$work/manifest" 4096 ||
    { echo 'Release unavailable; existing project retained.' >&2; exit 1; }
[ "$(field format)" = 1 ] || exit 1
version=$(field version)
case "$version" in ''|0*|*[!0-9]*) exit 1 ;; esac
[ "${#version}" -le 6 ] && [ "${requested:-$version}" = "$version" ] || exit 1
release="$base/download/v$version"
current=$(cat "$state/runtime_version" 2>/dev/null || :)
if [ "$requested" = 60 ] && { [ "$panel" = 1 ] || [ "$current" != "$version" ]; }; then
    archive="routewolf-luci-v$version-r27.tar.gz"
    fetch "$mirrors/luci-v$version-r27.manifest" "$work/luci.manifest" 4096 &&
        [ "$(field format "$work/luci.manifest")" = 1 ] &&
        [ "$(field version "$work/luci.manifest")" = "$version" ] &&
        [ "$(field luci_archive "$work/luci.manifest")" = "$archive" ] ||
        { echo 'LuCI release manifest unavailable or invalid.' >&2; exit 1; }
fi
if [ "$requested" = 60 ] && [ "$current" != "$version" ]; then
    runtime="routewolf-v$version.tar.gz"
    [ "$(field archive)" = "$runtime" ] &&
        fetch "$mirrors/routewolf-migrate-v$version-r3.sh" "$work/agent" 131072 &&
        verify upgrade_agent_sha256 "$work/agent" "$work/luci.manifest" && sh -n "$work/agent" &&
        fetch "$mirrors/$runtime" "$work/runtime.tgz" 1048576 &&
        verify archive_sha256 "$work/runtime.tgz" ||
        { echo 'Could not download or verify the v60 runtime; existing project retained.' >&2; exit 1; }
elif [ -z "$requested" ] || [ "$current" != "$version" ]; then
    fetch "$release/routewolf-stable-update.sh" "$work/agent" 131072 &&
        verify agent_sha256 "$work/agent" && sh -n "$work/agent" || exit 1
fi

if [ -z "$requested" ]; then
    sh "$work/agent" "$mode"
    exit "$?"
fi

if [ "$panel" = 1 ]; then
    fetch "$mirrors/$archive" "$work/luci.tar.gz" 1048576 &&
        verify luci_sha256 "$work/luci.tar.gz" "$work/luci.manifest" ||
        { echo 'Could not download or verify the LuCI panel; existing project retained.' >&2; exit 1; }
    mkdir "$work/luci"
    tar -xzf "$work/luci.tar.gz" -C "$work/luci"
    sh -n "$work/luci/routewolf-install.sh"
fi
if [ "$current" != "$version" ]; then
    if [ "$requested" = 60 ]; then
        sh "$work/agent" --release-local "$version" "$work/runtime.tgz" "$work/manifest"
    else
        sh "$work/agent" --release "$version"
    fi
fi
[ "$(cat "$state/runtime_version" 2>/dev/null)" = "$version" ] ||
    { echo 'Runtime has not reached the requested release; retry the update.' >&2; exit 1; }
if [ "$panel" = 1 ]; then
    sh "$work/luci/routewolf-install.sh" --luci-panel
fi
