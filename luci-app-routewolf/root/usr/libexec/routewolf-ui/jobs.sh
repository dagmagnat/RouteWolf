#!/bin/sh
set -u
umask 077
work=/tmp/routewolf-ui-job
lib=/usr/libexec/routewolf-ui
state=/etc/routewolf-ui
route=/etc/routewolf/route.conf
watchdog=/etc/routewolf/watchdog.conf
. "$lib/dependencies.sh"

run_runtime() {
    if [ ! -x "$1" ]; then
        reason runtime-missing
        return 127
    fi
    "$@"
}

route_device() {
    sed -n "s/^VPN_ROUTE_DEV='\([a-zA-Z0-9_.-]*\)'$/\1/p" "$1" 2>/dev/null | head -n1
}

device_up() {
    local flags
    flags=$(cat "/sys/class/net/$1/flags" 2>/dev/null) || return 1
    [ "$((flags & 1))" -ne 0 ]
}

start_openvpn_device() {
    local instance="routewolf_ui_$1" result
    if [ "$(uci -q get "openvpn.$instance.routewolf_ui" || :)" != 1 ]; then
        /etc/init.d/openvpn start
        return
    fi
    if [ "$(uci -q get "openvpn.$instance.enabled" || :)" = 1 ]; then
        /etc/init.d/openvpn start "$instance"
        return
    fi
    [ -z "$(uci changes openvpn)" ] || return 1
    uci set "openvpn.$instance.enabled=1" || return 1
    /etc/init.d/openvpn start "$instance"
    result=$?
    uci -q revert "openvpn.$instance.enabled" || return 1
    return "$result"
}

start_routing_device() {
    local dev iface protocol attempt
    dev=$(route_device "$1")
    [ -n "$dev" ] || return 1
    device_up "$dev" && return 0
    phase start
    reason tunnel-start
    iface=$(sed -n "s/^WATCHDOG_UCI_IFACE='\([a-zA-Z0-9_-]*\)'$/\1/p" "$2" 2>/dev/null | head -n1)
    iface=${iface:-$dev}
    protocol=$(uci -q get "network.$iface.proto" || :)
    case "$protocol:$dev" in
        amneziawg:*|wireguard:*) ifup "$iface" || return 1 ;;
        *:tun*) start_openvpn_device "$dev" || return 1 ;;
        *:sbtun*|*:outline*) /etc/init.d/sing-box start || return 1 ;;
        *) return 1 ;;
    esac
    for attempt in $(seq 1 20); do
        device_up "$dev" && return 0
        sleep 1
    done
    return 1
}

install_current_route() {
    local dev
    phase verify
    reason route-unavailable
    dev=$(route_device "$route")
    [ -n "$dev" ] && /usr/sbin/routewolf-route.sh &&
        ip -4 route show table 99 default dev "$dev" | grep -q '^default'
}

control_routing() {
    mkdir -p "$state" || return 1
    case "$1" in
        pause)
            if [ -e /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ]; then
                /etc/init.d/routewolf-subscription disable &&
                    /etc/init.d/routewolf-subscription stop &&
                    /etc/init.d/routewolf-subscription-engine disable &&
                    /etc/init.d/routewolf-subscription-engine stop && touch "$state/paused-singbox"
                return
            fi
            [ -s "$route" ] && [ ! -e "$state/paused-route.conf" ] || return 1
            cp "$route" "$state/paused-route.conf" || return 1
            if [ -f "$watchdog" ]; then
                cp "$watchdog" "$state/paused-watchdog.conf" || return 1
                printf "WATCHDOG_TYPE='none'\n"> "$watchdog.new" && mv "$watchdog.new" "$watchdog" || return 1
            fi
            printf "VPN_ROUTE_DEV=''\n" > "$route.new" && mv "$route.new" "$route" || return 1
            ip -4 route del default table 99 >/dev/null 2>&1 || :
            ip -6 route del default table 99 >/dev/null 2>&1 || :
            ;;
        resume)
            if [ -e "$state/paused-singbox" ]; then
                /etc/init.d/routewolf-subscription-engine enable &&
                    /etc/init.d/routewolf-subscription enable && /etc/init.d/routewolf-subscription start &&
                    rm -f "$state/paused-singbox"
                return
            fi
            [ -s "$state/paused-route.conf" ] || return 1
            start_routing_device "$state/paused-route.conf" "$state/paused-watchdog.conf" || return 1
            cp "$state/paused-route.conf" "$route.new" && mv "$route.new" "$route" || return 1
            if [ -e "$state/paused-watchdog.conf" ]; then
                cp "$state/paused-watchdog.conf" "$watchdog.new" && mv "$watchdog.new" "$watchdog" || return 1
            fi
            if ! install_current_route; then
                printf "VPN_ROUTE_DEV=''\n" > "$route.new" && mv "$route.new" "$route"
                if [ -e "$state/paused-watchdog.conf" ]; then
                    printf "WATCHDOG_TYPE='none'\n" > "$watchdog.new" && mv "$watchdog.new" "$watchdog"
                fi
                ip -4 route del default table 99 >/dev/null 2>&1 || :
                ip -6 route del default table 99 >/dev/null 2>&1 || :
                return 1
            fi
            rm -f "$state/paused-route.conf" "$state/paused-watchdog.conf"
            ;;
        *) return 1 ;;
    esac
}

stage_backup() (
    profile=$1
    reason invalid-profile
    [ "$(uci -q get "routewolf_ui.$profile" || :)" = profile ] &&
        [ "$(uci -q get routewolf_ui.ui.active_profile || :)" != "$profile" ] &&
        [ -z "$(uci -q get "routewolf_ui.$profile.existing_ref" || :)" ] || return 1
    prepare_dns "$profile" || return 1
    protocol=$(uci -q get "routewolf_ui.$profile.protocol") || return 1
    case "$protocol" in amneziawg|wireguard|openvpn|singbox|vless|outline) ;; *) return 1 ;; esac
    case "$protocol" in
        singbox|vless|outline)
            . "$lib/installer-functions.sh"
            if ! require_proxy_ram; then reason insufficient-proxy-ram; return 1; fi
            ;;
    esac
    set -- $(missing_backup_tools "$protocol")
    if [ "$#" -gt 0 ]; then
        phase packages
        reason package-install
        . "$lib/installer-functions.sh"
        pkg_update || :
        pkg_install "$@" || return 1
        [ -z "$(missing_backup_tools "$protocol")" ] || return 1
    fi
    case "$protocol" in
        singbox|vless|outline) "$lib/singbox.sh" "$profile" yes ;;
        *) "$lib/profiles.sh" backup "$profile" ;;
    esac
)

prepare_dns() {
    [ -n "$(uci -q get "routewolf_ui.$1.dns" || :)" ] || return 0
    reason profile-dns
    "$lib/dns.sh" prepare "$1"
}

clear_backup() {
    "$lib/backup.sh" stop && /etc/init.d/routewolf-ui-backup stop &&
        { uci -q delete routewolf_ui.ui.backup_profile || :; } &&
        { uci -q delete routewolf_ui.ui.backup_device || :; } &&
        uci commit routewolf_ui || return 1
    if [ -e "$state/profile-dns" ]; then
        /etc/init.d/routewolf-ui-backup start
    else
        /etc/init.d/routewolf-ui-backup disable
    fi
}

wait_for_backup_monitor() {
    local pid attempt=0
    while [ "$attempt" -lt 45 ]; do
        pid=$(cat /var/run/routewolf-ui-backup/busy 2>/dev/null || :)
        case "$pid" in ''|*[!0-9]*) return 0 ;; esac
        kill -0 "$pid" 2>/dev/null || return 0
        sleep 1
        attempt=$((attempt+1))
    done
    return 1
}

request_subscription_refresh() {
    local target
    if [ "$(cat /var/run/routewolf-ui-backup/device 2>/dev/null || :)" = rwsubb0 ] &&
        /etc/init.d/routewolf-ui-backup running &&
        grep -q '^https://' "$state/backup-proxy/source"; then
        target=/var/run/routewolf-ui-backup
    elif [ ! -e "$state/paused-singbox" ] && [ ! -e "$state/native-active" ] &&
        /etc/init.d/routewolf-subscription running &&
        grep -q '^https://' /etc/routewolf-subscription/source; then
        target=/var/run/routewolf-subscription
    else
        reason subscription-unavailable
        return 1
    fi
    mkdir -p "$target" && touch "$target/refresh-request"
}

remove_profile() {
    local profile=$1
    reason profile-in-use
    [ "$(uci -q get routewolf_ui.ui.active_profile || :)" != "$profile" ] &&
        [ "$(uci -q get routewolf_ui.ui.backup_profile || :)" != "$profile" ] || return 1
    reason profile-remove
    [ "$(uci -q get "routewolf_ui.$profile" || :)" = profile ] &&
        [ -z "$(uci changes routewolf_ui)" ] || return 1
    "$lib/interfaces.sh" remove-profile "$profile" || return 1
    uci delete "routewolf_ui.$profile" || return 1
    if [ "$(uci -q get routewolf_ui.ui.preferred_profile || :)" = "$profile" ]; then
        if ! uci delete routewolf_ui.ui.preferred_profile; then
            uci -q revert routewolf_ui
            return 1
        fi
    fi
    if ! uci commit routewolf_ui; then
        uci -q revert routewolf_ui
        return 1
    fi
}

if [ "${1:-}" = worker ]; then
    shift
    export RW_JOB_STATE="$work"
    trap 'rm -f "$work/pid" "$work/packages-before"; rmdir "$work/lock" 2>/dev/null || :' EXIT
    trap 'exit 1' HUP INT TERM
    # Never return raw VPN diagnostics or provider responses through RPC.
    case "$1" in
        activate|backup)
            "$lib/components.sh" snapshot > "$work/packages-before" || rm -f "$work/packages-before"
            ;;
    esac
    case "$1" in
        backup|activate|pause|resume|restart|repair)
            if ! wait_for_backup_monitor; then
                reason backup-transition
                printf '1\n' > "$work/result"
                exit 1
            fi
            ;;
    esac
    case "$1" in
        activate|pause|backup)
            if ! "$lib/backup.sh" stop "$1"; then
                reason backup-transition
                printf '1\n' > "$work/result"
                exit 1
            fi
            ;;
        restart|repair)
            if [ -f /tmp/routewolf-watchdog.lock/routewolf-ui-primary ]; then
                reason backup-transition
                printf '1\n' > "$work/result"
                exit 1
            fi
            ;;
    esac
    case "$1" in
        activate)
            if prepare_dns "$2" && "$lib/profiles.sh" activate "$2"; then
                if [ "$(uci -q get routewolf_ui.ui.backup_profile || :)" = "$2" ]; then clear_backup || :; fi
                if [ -e "$state/profile-dns" ]; then
                    "$lib/dns.sh" sync || :
                    /etc/init.d/routewolf-ui-backup enable &&
                        /etc/init.d/routewolf-ui-backup running || /etc/init.d/routewolf-ui-backup start
                fi
            else
                (exit "$?")
            fi
            ;;
        backup)
            if [ "$2" = none ]; then
                clear_backup
            else
                stage_backup "$2" &&
                    /etc/init.d/routewolf-ui-backup enable &&
                    /etc/init.d/routewolf-ui-backup restart
            fi
            ;;
        nodes) "$lib/singbox.sh" "$2" preview ;;
        remove_profile) remove_profile "$2" ;;
        adopt_interface)
            reason interface-changed
            "$lib/interfaces.sh" adopt "$2"
            ;;
        remove_components) "$lib/components.sh" remove "$2" ;;
        local_lists) "$lib/lists.sh" apply ;;
        lists) run_runtime /usr/sbin/routewolf-stable-update.sh --lists-auto ;;
        subscription_refresh) request_subscription_refresh ;;
        update)
            reason update-failed
            if run_runtime /usr/sbin/routewolf-update.sh check; then
                reason update-schedule
                "$lib/schedule.sh" keep
            else
                (exit "$?")
            fi
            ;;
        reload_project) run_runtime /usr/sbin/routewolf-apply.sh /tmp/routewolf-ui-apply.log ;;
        repair)
            if [ -e "$state/paused-route.conf" ] || [ -e "$state/paused-singbox" ]; then
                reason paused
                false
            elif [ -f /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ]; then
                /etc/init.d/routewolf-subscription start
            else
                start_routing_device "$route" "$watchdog" && install_current_route
            fi
            ;;
        check) run_runtime /usr/sbin/routewolf-reliability.sh check ;;
        pause|resume) control_routing "$1" ;;
        dns_on) run_runtime /usr/sbin/rw dns on && fw4 reload ;;
        dns_off) run_runtime /usr/sbin/rw dns off && fw4 reload ;;
        restart)
            if [ -f /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ]; then
                [ ! -e "$state/paused-singbox" ] && /etc/init.d/routewolf-subscription-engine restart
            else
                run_runtime /usr/sbin/routewolf-watchdog.sh restart
            fi
            ;;
        dco_on) run_runtime /usr/sbin/rw dco on ;;
        dco_off) run_runtime /usr/sbin/rw dco off ;;
        *) exit 2 ;;
    esac
    result=$?
    if [ -f "$work/packages-before" ]; then
        "$lib/components.sh" record "$work/packages-before" ||
            logger -t routewolf-ui 'Could not record installed VPN components'
    fi
    if [ "$result" -eq 0 ]; then
        case "$1" in
            activate|backup) "$lib/profiles.sh" prune || logger -t routewolf-ui 'Could not remove unused tunnel slots' ;;
        esac
        phase done
        reason none
    fi
    printf '%s\n' "$result" > "$work/result"
    exit "$result"
fi

case "${1:-}" in
    activate)
        case "${2:-}" in ''|*[!a-zA-Z0-9_]*) exit 2 ;; esac
        [ ! -e "$state/paused-route.conf" ] && [ ! -e "$state/paused-singbox" ] || exit 2
        ;;
    backup|nodes|remove_profile)
        case "${2:-}" in ''|*[!a-zA-Z0-9_]*) exit 2 ;; esac
        ;;
    remove_components)
        case "${2:-}" in ''|*[!a-z,]*) exit 2 ;; esac
        [ "${#2}" -le 48 ] || exit 2
        ;;
    adopt_interface)
        case "${2:-}" in ''|*[!a-zA-Z0-9_.-]*) exit 2 ;; esac
        [ "${#2}" -le 80 ] || exit 2
        ;;
    local_lists|lists|subscription_refresh|update|reload_project|repair|check|pause|resume|dns_on|dns_off|restart|dco_on|dco_off) ;;
    *) exit 2 ;;
esac

mkdir -p "$work" || exit 1
if ! mkdir "$work/lock" 2>/dev/null; then
    pid=$(cat "$work/pid" 2>/dev/null || :)
    case "$pid" in ''|*[!0-9]*) exit 1 ;; esac
    kill -0 "$pid" 2>/dev/null && exit 1
    rm -f "$work/pid"
    rmdir "$work/lock" && mkdir "$work/lock" || exit 1
fi
printf '%s\n' "$1" > "$work/action"
rm -f "$work/result" "$work/reason"
printf '%s\n' preflight > "$work/phase"
"$lib/jobs.sh" worker "$@" </dev/null >/dev/null 2>&1 &
printf '%s\n' "$!" > "$work/pid"
