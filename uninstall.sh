#!/bin/sh
set -eu
umask 077

source_url=https://raw.githubusercontent.com/dagmagnat/RouteWolf/main
component_path=luci-app-routewolf/root/usr/libexec/routewolf-ui
dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

run_uninstall() {
    if [ ! -t 0 ] && ( : </dev/tty ) 2>/dev/null; then
        sh "$uninstaller" "$@" </dev/tty
    else
        sh "$uninstaller" "$@"
    fi
}

if [ "${0##*/}" = uninstall.sh ] && [ -f "$dir/routewolf-uninstall.sh" ]; then
    uninstaller="$dir/routewolf-uninstall.sh"
    export ROUTEWOLF_COMPONENT_HELPER="$dir/$component_path/components.sh"
    run_uninstall "$@"
    exit "$?"
fi

work=$(mktemp -d /tmp/routewolf-uninstall.XXXXXX)
trap 'rm -rf "$work"' EXIT
trap 'exit 1' HUP INT TERM
fetch() {
    local path=$1 dest=$2 native
    native=$(command -v uclient-fetch || :)
    [ ! -x /bin/uclient-fetch ] || native=/bin/uclient-fetch
    if [ -n "$native" ] &&
       (ulimit -f 256; exec "$native" -T 25 -O "$dest" "$source_url/$path") && [ -s "$dest" ]; then
        return 0
    fi
    rm -f "$dest"
    (ulimit -f 256; exec curl -fsSL --proto '=https' --proto-redir '=https' --max-time 35 \
        --max-filesize 131072 -o "$dest" "$source_url/$path") && [ -s "$dest" ]
}
uninstaller="$work/uninstall.sh"
fetch routewolf-uninstall.sh "$uninstaller"
sh -n "$uninstaller"
if { [ -f /etc/routewolf/watchdog.conf ] || [ -f /etc/routewolf/component-packages ] ||
     [ -f /etc/config/routewolf_ui ] || [ -f /etc/routewolf-subscription/mode ]; } &&
    fetch "$component_path/components.sh" "$work/components.sh" &&
    fetch "$component_path/dependencies.sh" "$work/dependencies.sh" &&
    sh -n "$work/components.sh" && sh -n "$work/dependencies.sh"; then
    export ROUTEWOLF_COMPONENT_HELPER="$work/components.sh"
fi
run_uninstall "$@"
