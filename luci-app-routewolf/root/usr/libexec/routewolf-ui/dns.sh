#!/bin/sh
# Profile resolvers augment the router's existing upstreams.
set -eu
set -f
umask 077
state=/etc/routewolf-ui
conf=/tmp/dnsmasq.d/routewolf-profile-dns.conf
servers=/tmp/dnsmasq.d/.routewolf-profile-servers

render() {
    local profile=$1 value address
    case "$profile" in ''|*[!a-zA-Z0-9_]*) return 0 ;; esac
    value=$(uci -q get "routewolf_ui.$profile.dns" || :)
    set -- $value
    [ "$#" -le 4 ] || return 1
    for address; do
        case "$address" in
            0.0.0.0|127.*|::|::1|*[!a-fA-F0-9.:]*) return 1 ;;
            *:*|*.*.*.*) printf 'server=%s\n' "$address" ;;
            *) return 1 ;;
        esac
    done
}

files() {
    mkdir -p /tmp/dnsmasq.d
    if [ ! -f "$servers" ]; then
        : > "$servers"
        chmod 644 "$servers"
    fi
    printf 'servers-file=%s\n' "$servers" > "$conf"
    chmod 644 "$conf"
}

prepare() (
    testfile=$(mktemp /tmp/routewolf-profile-dns.XXXXXX)
    trap 'rm -f "$testfile"' EXIT
    render "$1" > "$testfile" || return 1
    [ -s "$testfile" ] || return 0
    dnsmasq --test --conf-file="$testfile" >/dev/null 2>&1 || return 1
    [ ! -e "$state/profile-dns" ] || return 0
    [ "$(uci -q get 'dhcp.@dnsmasq[0].confdir' || :)" = /tmp/dnsmasq.d ] || return 1
    files
    if dnsmasq --test --conf-file=/dev/null --conf-dir=/tmp/dnsmasq.d >/dev/null 2>&1 &&
        /etc/init.d/dnsmasq restart; then
        for attempt in 1 2 3 4 5 6; do
            if /etc/init.d/dnsmasq running; then
                mkdir -p "$state"
                touch "$state/profile-dns"
                return 0
            fi
            sleep 1
        done
    fi
    rm -f "$conf" "$servers"
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || :
    return 1
)

lease_exists() {
    local lan
    lan=$(ubus call network.interface.lan status | jsonfilter -e '@.l3_device')
    case "$lan" in ''|*[!a-zA-Z0-9_.-]*) return 1 ;; esac
    nft get element inet "$1" active_lans "{ \"$lan\" }" >/dev/null 2>&1
}

current_profile() {
    [ ! -e "$state/paused-route.conf" ] && [ ! -e "$state/paused-singbox" ] || return 0
    local status dev
    status=$(cat /var/run/routewolf-ui-backup/status 2>/dev/null || :)
    if [ -n "$(uci -q get routewolf_ui.ui.backup_profile || :)" ]; then
        case "$status" in
            active)
                if lease_exists routewolf_ui_backup; then uci -q get routewolf_ui.ui.backup_profile || :; fi
                return
                ;;
            checking|wan|conflict) return 0 ;;
        esac
    fi
    dev=$(sed -n "s/^VPN_ROUTE_DEV='\([a-zA-Z0-9_]*\)'$/\1/p" /etc/routewolf/route.conf 2>/dev/null | head -n1)
    if [ -n "$dev" ]; then
        ip -4 route show table 99 default dev "$dev" 2>/dev/null | grep -q '^default' || return 0
    else
        [ -f /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ] &&
            lease_exists routewolf_subscription || return 0
    fi
    uci -q get routewolf_ui.ui.active_profile || :
}

sync_servers() (
    [ -f "$servers" ] || return 0
    tmp=$(mktemp /tmp/dnsmasq.d/.routewolf-servers.XXXXXX)
    trap 'rm -f "$tmp"' EXIT
    render "$(current_profile)" > "$tmp" || : > "$tmp"
    cmp -s "$tmp" "$servers" && return 0
    dnsmasq --test --conf-file="$tmp" >/dev/null 2>&1 || : > "$tmp"
    cmp -s "$tmp" "$servers" && return 0
    chmod 644 "$tmp"
    mv -f "$tmp" "$servers"
    ubus call service signal '{"name":"dnsmasq","signal":1}' >/dev/null 2>&1
)

remove_configuration() {
    [ ! -e "$state/profile-dns" ] || rm -f "$state/profile-dns"
    if [ -f "$servers" ]; then
        : > "$servers"
        ubus call service signal '{"name":"dnsmasq","signal":1}' >/dev/null 2>&1 || :
    fi
    rm -f "$conf"
}

case "${1:-}" in
    prepare) prepare "$2" ;;
    boot) [ ! -e "$state/profile-dns" ] || files ;;
    sync) sync_servers ;;
    remove) remove_configuration ;;
    *) exit 2 ;;
esac
