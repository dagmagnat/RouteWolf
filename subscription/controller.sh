#!/bin/sh
# Keep the kernel's WAN default outside sing-box. Only a live health lease
# marks new LAN packets for the dedicated policy route.
set -u
umask 077
state=/etc/routewolf-subscription
runtime=/var/run/routewolf-subscription
helper=$state/subscription
engine=/etc/init.d/routewolf-subscription-engine
service=/etc/init.d/routewolf-subscription
table=routewolf_subscription
rule_table=190
priority=92
mark=0x02000000
device=rwsub0

log() { logger -t routewolf-subscription "$*"; }
result() {
    if [ "$(cat "$runtime/status" 2>/dev/null)" != "$1" ]; then
        printf '%s\n' "$1" > "$runtime/status"
        log "$1"
    fi
}

clear_lease() {
    nft flush set inet "$table" active_lans >/dev/null 2>&1 || true
}

remove_routing() {
    clear_lease
    nft delete table inet "$table" >/dev/null 2>&1 || true
    for family in -4 -6; do
        ip "$family" rule del priority "$priority" fwmark "$mark/$mark" table "$rule_table" >/dev/null 2>&1 || true
        ip "$family" route del default dev "$device" table "$rule_table" >/dev/null 2>&1 || true
    done
}

build_table() {
    routewolf_match=
    [ "$mode" != routewolf ] || routewolf_match='meta mark & 0x1 == 0x1'
    nft -f - <<EOF
table inet $table {
    set active_lans {
        type ifname
        flags timeout
        timeout 18s
    }
    chain route_lan {
        type filter hook prerouting priority -145; policy accept;
        iifname != @active_lans return
        fib daddr type local return
        ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/3 } return
        ip6 daddr != 2000::/3 return
        # Keep destinations on directly connected LAN/VLANs on the main route.
        fib daddr oifname "$lan" return
        $routewolf_match meta mark set meta mark | $mark
    }
}
EOF
}

ensure_policy() {
    family=$1
    current=$(ip "$family" rule show | awk -v prio="$priority:" '$1 == prio')
    if [ -z "$current" ]; then
        ip "$family" rule add priority "$priority" fwmark "$mark/$mark" table "$rule_table" || return 1
    elif ! printf '%s\n' "$current" | grep -Eq '^92:.* fwmark 0x2000000/0x2000000 lookup 190$'; then
        return 1
    fi
    ip "$family" route replace default dev "$device" table "$rule_table"
}

renew_lease() {
    lan=$(ubus call network.interface.lan status | jsonfilter -e '@.l3_device')
    case "$lan" in ''|*[!a-zA-Z0-9_.-]*) return 1 ;; esac
    ip link show dev "$device" >/dev/null 2>&1 || return 1
    if [ "${last_lan:-}" != "$lan" ]; then
        nft delete table inet "$table" >/dev/null 2>&1 || true
    fi
    nft list table inet "$table" >/dev/null 2>&1 || build_table || return 1
    last_lan=$lan
    ensure_policy -4 || return 1
    # Disable dual-stack diversion if the kernel's IPv6 path is unavailable.
    if [ -e /proc/net/ipv6_route ]; then ensure_policy -6 || return 1; fi
    nft -f - <<EOF
flush set inet $table active_lans
add element inet $table active_lans { "$lan" timeout 18s }
EOF
}

wait_ready() {
    attempts=0
    while [ "$attempts" -lt 6 ]; do
        if ip link show dev "$device" >/dev/null 2>&1 &&
            "$helper" health "$state/config.json" "$state/token" ready; then
            return 0
        fi
        sleep 1
        attempts=$((attempts+1))
    done
    return 1
}

refresh() (
    # Network I/O and config validation run alongside the health checks.
    stage=$(mktemp -d "$state/.refresh.XXXXXX") || exit 1
    trap 'rm -rf "$stage"' EXIT
    trap 'exit 1' HUP INT TERM
    "$helper" fetch "$state/source" > "$stage/input" || { log "Subscription download failed; keeping the previous configuration"; exit 1; }
    "$helper" render "$stage/input" "$state/token" "$mode" "$stage/config.json" ||
        { log "Subscription could not be imported; keeping the previous configuration"; exit 1; }
    cmp -s "$stage/config.json" "$state/config.json" && exit 0
    if ! sing-box check -c "$stage/config.json" > /dev/null 2>&1; then
        log "Updated configuration was rejected by sing-box; keeping the previous configuration"
        exit 1
    fi

    mv "$stage/config.json" "$state/candidate.json"
)

restore_previous() {
    mv "$state/previous.json" "$state/config.json" || return 1
    "$engine" restart >/dev/null 2>&1
}

apply_candidate() {
    clear_lease
    cp "$state/config.json" "$state/previous.tmp" &&
        mv "$state/previous.tmp" "$state/previous.json" || return 1
    if mv "$state/candidate.json" "$state/config.json" &&
        "$engine" restart >/dev/null 2>&1 && wait_ready; then
        rm -f "$state/previous.json"
        log "Subscription updated"
        return 0
    fi
    log "Updated engine failed to start; restoring the previous configuration"
    restore_previous
}

monotonic_seconds() { cut -d. -f1 /proc/uptime; }

monitor() {
    mode=$(cat "$state/mode") || exit 1
    mkdir -p "$runtime"
    remove_routing
    if [ -f "$state/previous.json" ]; then
        restore_previous || exit 1
    fi
    refresh_pid=
    trap 'clear_lease; [ -z "$refresh_pid" ] || kill "$refresh_pid" 2>/dev/null || true; exit' HUP INT TERM
    now=$(monotonic_seconds)
    next_refresh=$((now+3600))
    next_restart=$now
    while :; do
        if [ ! -x /etc/init.d/routewolf ]; then
            remove_routing
            "$engine" stop >/dev/null 2>&1 || true
            "$engine" disable >/dev/null 2>&1 || true
            "$service" disable >/dev/null 2>&1 || true
            result "WAN fallback: RouteWolf is uninstalled"
            exit 0
        fi
        now=$(monotonic_seconds)
        if [ -z "$refresh_pid" ] && [ "$now" -ge "$next_refresh" ] && grep -q '^https://' "$state/source"; then
            refresh &
            refresh_pid=$!
            next_refresh=$((now+3600))
        fi
        if [ -n "$refresh_pid" ] && ! kill -0 "$refresh_pid" 2>/dev/null; then
            wait "$refresh_pid" || true
            refresh_pid=
        fi
        if [ -f "$state/candidate.json" ]; then
            apply_candidate || true
        fi
        status=11
        if ip link show dev "$device" >/dev/null 2>&1; then
            "$helper" health "$state/config.json" "$state/token" select
            status=$?
        fi
        if [ "$status" -eq 0 ] && renew_lease; then
            result "Proxy available"
        else
            clear_lease
            case "$status" in
                10) result "WAN fallback: no reachable proxy" ;;
                11)
                    result "WAN fallback: sing-box unavailable"
                    now=$(monotonic_seconds)
                    if [ "$now" -ge "$next_restart" ]; then
                        "$engine" restart >/dev/null 2>&1 || true
                        next_restart=$((now+45))
                    fi
                    ;;
                *) result "WAN fallback: subscription policy unavailable" ;;
            esac
        fi
        sleep 4
    done
}

stop() {
    remove_routing
    rm -f "$runtime/status"
}

case "${1:-}" in
    monitor) monitor ;;
    stop) stop ;;
    status)
        cat "$runtime/status" 2>/dev/null || printf '%s\n' 'Subscription monitor is stopped'
        ;;
    *) exit 2 ;;
esac
