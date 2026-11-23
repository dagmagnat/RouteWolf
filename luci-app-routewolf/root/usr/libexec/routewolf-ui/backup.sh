#!/bin/sh
# Only lease-validated tunnels receive LAN traffic. Keep WAN in the main table.
set -u
umask 077
run=/var/run/routewolf-ui-backup
state=/etc/routewolf-ui
table=routewolf_ui_backup
lookup=197
mark=0x04000000
primary_mark=0x02000000
watchdog_lock=/tmp/routewolf-watchdog.lock
held_file=$watchdog_lock/routewolf-ui-primary
retry_primary_seconds=120
subscription_schedule=/usr/libexec/routewolf-ui/subscription-refresh.sh

setting() { uci -q get "routewolf_ui.ui.$1" || :; }
owned() {
    if [ "$1" = rwsubb0 ]; then
        [ -s "$state/backup-proxy/config.json" ]
    else
        [ "$(uci -q get "network.$1.routewolf_ui_backup" || :)" = 1 ]
    fi
}
status() { printf '%s\n' "$1" > "$run/status"; }
clear_lease() { nft flush set inet "$table" "$1" >/dev/null 2>&1 || :; }

link_active() {
    local flags
    flags=$(cat "/sys/class/net/$1/flags" 2>/dev/null) || return 1
    [ "$((flags & 1))" -ne 0 ]
}

openvpn_device() {
    local device=$1 action=$2 instance="routewolf_ui_$1" result=0
    [ "$(uci -q get "openvpn.$instance.routewolf_ui" || :)" = 1 ] || return 1
    if [ "$action" = stop ]; then
        ubus call service delete "$(printf '{"name":"openvpn","instance":"%s"}' "$instance")" >/dev/null
        return
    fi
    if [ "$(uci -q get "openvpn.$instance.enabled" || :)" = 1 ]; then
        /etc/init.d/openvpn start "$instance"
        return
    fi
    [ -z "$(uci changes openvpn)" ] || return 1
    uci set "openvpn.$instance.enabled=1" || return 1
    /etc/init.d/openvpn start "$instance" || result=$?
    uci -q revert "openvpn.$instance.enabled" || return 1
    return "$result"
}

control_device() {
    local device=$1 action=$2 proto
    case "$device" in
        rwsub0)
            if [ "$action" = start ]; then
                /etc/init.d/routewolf-subscription-engine start && /etc/init.d/routewolf-subscription start
            else
                /etc/init.d/routewolf-subscription stop || :
                /etc/init.d/routewolf-subscription-engine stop
            fi
            ;;
        rwsubb0) /etc/init.d/routewolf-ui-backup-engine "$action" ;;
        tunrw0|tunrw1|tunrwb) openvpn_device "$device" "$action" ;;
        awg*|wg*)
            proto=$(uci -q get "network.$device.proto" || :)
            case "$proto" in amneziawg|wireguard) ;; *) return 1 ;; esac
            if [ "$action" = start ]; then ifup "$device"; else ifdown "$device"; fi
            ;;
        *) return 1 ;;
    esac
}

stop_device() {
    local device=$1 attempt
    # Stop a pending procd or netifd start as well as a live interface.
    control_device "$device" stop >/dev/null 2>&1 || {
        # A registered device with a pending start must be stopped explicitly.
        link_active "$device" && return 1
        return 0
    }
    for attempt in 1 2 3 4 5; do
        link_active "$device" || return 0
        sleep 1
    done
    ! link_active "$device"
}

release() {
    local old
    clear_lease active_lans
    old=$(cat "$run/device" 2>/dev/null || :)
    [ -n "$old" ] || old=$(setting backup_device)
    case "$old" in
        awgrwb|wgrwb|tunrwb|rwsubb0)
            [ -e "$run/device" ] || link_active "$old" || return 0
            if owned "$old"; then stop_device "$old" || return 1; fi
            if link_active "$old"; then return 1; fi
            ip -4 rule del priority 94 fwmark "$mark/$mark" table "$lookup" >/dev/null 2>&1 || :
            ip -4 route del default dev "$old" table "$lookup" >/dev/null 2>&1 || :
            ip -4 rule del priority 93 oif "$old" table "$lookup" >/dev/null 2>&1 || :
            rm -f "$run/device"
            ;;
    esac
}

recover_primary() {
    local attempt
    release || return 1
    status checking
    control_device "$primary" start >/dev/null 2>&1 || return 1
    for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
        if link_active "$primary"; then
            if primary_healthy; then return 0; fi
            [ "$primary" = rwsub0 ] || return 1
        fi
        sleep 1
    done
    return 1
}

held_primary() { cat "$held_file" 2>/dev/null || :; }

unlock_primary() {
    [ -f "$held_file" ] || return 0
    rm -f "$held_file"
    rmdir "$watchdog_lock" 2>/dev/null || :
}

suspend_primary() {
    if [ "$(held_primary)" != "$primary" ]; then
        mkdir "$watchdog_lock" 2>/dev/null || return 1
        if ! printf '%s\n' "$primary" > "$held_file"; then
            rmdir "$watchdog_lock" 2>/dev/null || :
            return 1
        fi
    fi
    stop_device "$primary" && clear_primary_probe
}

clear_primary_probe() {
    local old
    old=$(cat "$run/primary" 2>/dev/null || :)
    case "$old" in
        ''|*[!a-zA-Z0-9_.-]*) return ;;
    esac
    ip -4 route del default dev "$old" table 198 >/dev/null 2>&1 || :
    ip -4 rule del priority 95 oif "$old" table 198 >/dev/null 2>&1 || :
    rm -f "$run/primary"
}

teardown() {
    local previous
    release || return 1
    previous=$(held_primary)
    if [ -n "$previous" ]; then
        selected_primary
        if [ "$previous" = "$primary" ] && [ ! -e "$state/paused-route.conf" ] &&
            [ ! -e "$state/paused-singbox" ] && [ "${1:-}" != pause ]; then
            control_device "$previous" start >/dev/null 2>&1 || :
        fi
        unlock_primary
    fi
    clear_primary_probe
    nft delete table inet "$table" >/dev/null 2>&1 || :
    last_policy=
}

ensure_rule() {
    local priority=$1 expected=$2 lookup=$3 current
    shift 3
    current=$(ip -4 rule show | awk -v priority="$priority:" '$1==priority')
    if [ -n "$current" ]; then
        [ "$(printf '%s\n' "$current" | wc -l)" -eq 1 ] &&
            printf '%s\n' "$current" | grep -Eq "$expected"
    else
        ip -4 rule add priority "$priority" "$@" table "$lookup"
    fi
}

probe_route() {
    local device=$1 priority=$2 policy=$3 routes existing
    ip -4 addr show dev "$device" 2>/dev/null | grep -q ' inet ' || return 1
    routes=$(ip -4 route show table "$policy" 2>/dev/null || :)
    if [ -n "$routes" ]; then
        [ "$(printf '%s\n' "$routes" | wc -l)" -eq 1 ] || return 1
        # The device name came from the explicit allowlist in read_settings.
        existing=$(printf '%s\n' "$routes" | awk '$1=="default" && $2=="dev" {print $3}')
        [ "$existing" = "$device" ] || return 1
    fi
    if [ "$device" != rwsubb0 ]; then
        ensure_rule "$priority" " oif $device lookup $policy\$" "$policy" oif "$device" || return 1
    fi
    ip -4 route replace default dev "$device" table "$policy"
}

probe() {
    local device=$1 url response endpoint
    probe_route "$@" || return 1
    if [ "$device" = rwsubb0 ]; then
        /usr/libexec/routewolf-ui/backup-proxy.sh health
        return
    fi
    if ! command -v curl >/dev/null 2>&1; then
        for endpoint in 1.1.1.1 9.9.9.9; do
            ping -I "$device" -c 1 -W 2 "$endpoint" >/dev/null 2>&1 && return 0
        done
        return 1
    fi
    for url in https://cp.cloudflare.com/generate_204 https://connectivitycheck.gstatic.com/generate_204; do
        response=$(curl -4sS --noproxy '*' --interface "if!$device" --connect-timeout 3 --max-time 4 \
            -o /dev/null -w '%{http_code}' "$url" 2>/dev/null) || continue
        [ "$response" != 204 ] || return 0
    done
    return 1
}

primary_healthy() {
    if [ "$primary" = rwsub0 ]; then
        [ "$(cat /var/run/routewolf-subscription/status 2>/dev/null || :)" = 'Proxy available' ] &&
            nft get element inet routewolf_subscription active_lans "{ \"$lan\" }" >/dev/null 2>&1
        return
    fi
    [ "$(cat "$run/primary" 2>/dev/null || :)" = "$primary" ] || clear_primary_probe
    printf '%s\n' "$primary" > "$run/primary"
    probe "$primary" 95 198 || return 1
    if ! ip -4 route show table 99 default dev "$primary" 2>/dev/null | grep -q '^default'; then
        if [ "$(cat /tmp/routewolf-tunnel-unhealthy 2>/dev/null || :)" = "$primary" ]; then
            rm -f /tmp/routewolf-tunnel-unhealthy
        fi
        /usr/sbin/routewolf-route.sh >/dev/null 2>&1 || return 1
    fi
}

ensure_policy() {
    local policy="$primary:$primary_mode:$mode:$lan" match= bypass= list_mark=0x1
    if [ "$last_policy" = "$policy" ] && nft list table inet "$table" >/dev/null 2>&1; then
        return 0
    fi
    if [ "$primary" != rwsub0 ] && [ "$primary_mode" = inverse ]; then
        list_mark=0x08000000
    fi
    case "$mode" in
        routewolf) match="meta mark & $list_mark == $list_mark" ;;
        inverse) match="meta mark & $list_mark == 0" ;;
    esac
    # For a native primary, an expired lease sends traffic to the normal WAN
    # even if the kernel still has a stale RouteWolf policy route.
    [ "$primary" = rwsub0 ] || bypass='meta mark set meta mark & 0xfffffffe'
    {
        if nft list table inet "$table" >/dev/null 2>&1; then
            printf 'delete table inet %s\n' "$table"
        fi
        cat <<EOF
table inet $table {
    set primary_lans { type ifname; flags timeout; timeout 24s; }
    set active_lans { type ifname; flags timeout; timeout 24s; }
    chain route_lan {
        type filter hook prerouting priority -144; policy accept;
        iifname != "$lan" return
        meta mark & $primary_mark != 0 return
        iifname @primary_lans return
        iifname @active_lans jump use_backup
        $bypass
    }
    chain use_backup {
        meta nfproto != ipv4 return
        fib daddr type local return
        ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/3 } return
        fib daddr oifname "$lan" return
        $match meta mark set meta mark | $mark
    }
}
EOF
    } | nft -f - || return 1
    last_policy=$policy
}

renew() {
    local kind=$1
    if [ "$kind" = active_lans ]; then
        ensure_rule 94 " fwmark 0x4000000/0x4000000 lookup $lookup\$" "$lookup" fwmark "$mark/$mark" || return 1
    fi
    nft -f - <<EOF
flush set inet $table $kind
add element inet $table $kind { "$lan" timeout 24s }
EOF
}

duplicate_interface() {
    local tool key
    case "$dev" in awgrwb) tool=awg ;; wgrwb) tool=wg ;; *) return 1 ;; esac
    key=$(uci -q get "network.$dev.private_key" | "$tool" pubkey 2>/dev/null) || return 1
    [ -n "$key" ] && "$tool" show all public-key 2>/dev/null |
        awk -v dev="$dev" -v key="$key" '$1!=dev && $2==key {duplicate=1} END {exit !duplicate}'
}

selected_primary() {
    primary=$(sed -n "s/^VPN_ROUTE_DEV='\([A-Za-z0-9_]*\)'$/\1/p" /etc/routewolf/route.conf 2>/dev/null | head -n 1)
    if [ -z "$primary" ] && [ -f /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ]; then
        primary=rwsub0
    fi
}

read_settings() {
    profile=$(setting backup_profile)
    dev=$(setting backup_device)
    case "$profile" in ''|*[!a-zA-Z0-9_]*) return 1 ;; esac
    case "$dev" in awgrwb|wgrwb|tunrwb|rwsubb0) ;; *) return 1 ;; esac
    [ "$(uci -q get "routewolf_ui.$profile" || :)" = profile ] && owned "$dev" || return 1
    if [ "$dev" = rwsubb0 ]; then
        mode=$(cat "$state/backup-proxy/mode" 2>/dev/null || :)
    else
        mode=$(uci -q get "network.$dev.routewolf_backup_mode" || :)
    fi
    case "$mode" in routewolf|inverse|full|json) ;; *) return 1 ;; esac
    [ -x /etc/init.d/routewolf ] && [ ! -e "$state/paused-singbox" ] &&
        [ ! -e "$state/paused-route.conf" ] || return 1
    [ "$(setting active_profile)" != "$profile" ] || return 1
    lan=$(ubus call network.interface.lan status | jsonfilter -e '@.l3_device')
    case "$lan" in ''|*[!a-zA-Z0-9_.-]*) return 1 ;; esac
    selected_primary
    primary_mode=$(setting active_mode)
    case "$primary" in
        rwsub0|awg*|wg*|tunrw0|tunrw1) [ "$primary" != "$dev" ] ;;
        *) return 1 ;;
    esac
}

monitor() {
    . "$subscription_schedule"
    mkdir -p "$run"
    last_policy=
    trap 'teardown; rm -f "$run/busy"; exit' HUP INT TERM
    misses=0
    next_start=0
    last_refresh=-1
    refresh_pid=
    next_recovery=0
    while :; do
        if [ -n "$refresh_pid" ] && ! kill -0 "$refresh_pid" 2>/dev/null; then
            wait "$refresh_pid" || logger -t routewolf-ui-backup 'Subscription check failed'
            refresh_pid=
        fi
        printf '%s\n' "$$" > "$run/busy"
        case "$(cat /tmp/routewolf-ui-job/action 2>/dev/null || :)" in
            backup|activate|pause|resume|restart|repair)
                if [ -d /tmp/routewolf-ui-job/lock ]; then
                    rm -f "$run/busy"
                    sleep 4
                    continue
                fi
                ;;
        esac
        if ! read_settings; then
            teardown
            status idle
            misses=0
            next_recovery=0
        elif ! ensure_policy; then
            teardown
            status wan
            misses=0
            next_recovery=0
        else
            now=$(cut -d. -f1 /proc/uptime)
            held=$(held_primary)
            if [ -n "$held" ] && [ "$held" != "$primary" ]; then
                teardown
                status checking
            elif [ -z "$held" ] && ! release; then
                status conflict
            elif [ -z "$held" ] && primary_healthy; then
                if [ "$primary" != rwsub0 ]; then renew primary_lans || :; fi
                status waiting
                misses=0
                next_start=0
            elif [ -z "$held" ] && [ "$misses" -lt 2 ]; then
                misses=$((misses+1))
                status checking
            elif [ -z "$held" ] && ! suspend_primary; then
                status conflict
            elif [ -n "$held" ] && link_active "$primary" && ! suspend_primary; then
                release || :
                status conflict
            elif [ "$next_recovery" -gt 0 ] && [ "$now" -ge "$next_recovery" ] && recover_primary; then
                if [ "$primary" != rwsub0 ]; then renew primary_lans || :; fi
                unlock_primary
                status waiting
                misses=0
                next_start=0
                next_recovery=0
            elif link_active "$primary" && ! suspend_primary; then
                release || :
                status conflict
            elif duplicate_interface; then
                release || :
                status conflict
            else
                clear_lease primary_lans
                if [ "$next_recovery" -eq 0 ] || [ "$now" -ge "$next_recovery" ]; then
                    next_recovery=$(($(cut -d. -f1 /proc/uptime)+retry_primary_seconds))
                    next_start=0
                    # Cancel an incomplete netifd/procd start before bringing up the reserve.
                    if ! suspend_primary; then
                        status conflict
                        rm -f "$run/busy"
                        sleep 4
                        continue
                    fi
                fi
                if [ "$dev" = rwsubb0 ] && [ -z "$refresh_pid" ] &&
                    [ ! -d /tmp/routewolf-ui-job/lock ] && grep -q '^https://' "$state/backup-proxy/source" &&
                    subscription_refresh_due "$now" "$last_refresh" "$run/refresh-request"; then
                    rm -f "$run/refresh-request"
                    /usr/libexec/routewolf-ui/backup-proxy.sh refresh >/dev/null 2>&1 &
                    refresh_pid=$!
                    last_refresh=$now
                fi
                if link_active "$dev"; then
                    printf '%s\n' "$dev" > "$run/device"
                elif [ "$now" -ge "$next_start" ]; then
                    printf '%s\n' "$dev" > "$run/device"
                    control_device "$dev" start >/dev/null 2>&1 || :
                    next_start=$((now+30))
                fi
                if link_active "$dev" && probe "$dev" 93 "$lookup" && renew active_lans; then
                    status active
                else
                    clear_lease active_lans
                    status wan
                fi
            fi
        fi
        if [ -f "$state/profile-dns" ]; then /usr/libexec/routewolf-ui/dns.sh sync || :; fi
        rm -f "$run/busy"
        sleep 4
    done
}

case "${1:-}" in
    monitor) monitor ;;
    stop) teardown "${2:-}" && { [ ! -d "$run" ] || status idle; } ;;
    *) exit 2 ;;
esac
