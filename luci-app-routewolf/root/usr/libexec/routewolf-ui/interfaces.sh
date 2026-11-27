#!/bin/sh
set -eu
umask 077

state=/etc/routewolf-ui
route=/etc/routewolf/route.conf

valid_name() {
    case "$1" in ''|*[!a-zA-Z0-9_.-]*) return 1 ;; esac
}

route_device() {
    sed -n "s/^VPN_ROUTE_DEV='\([a-zA-Z0-9_.-]*\)'$/\1/p" "$1" 2>/dev/null | head -n1
}

selected_device() {
    if [ -f /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ]; then
        printf '%s\n' rwsub0
    else
        route_device "$route"
    fi
}

openvpn_instances() {
    local instance device config
    for instance in $(uci -q show openvpn | sed -n 's/^openvpn\.\([a-zA-Z0-9_]*\)=openvpn$/\1/p'); do
        [ "$(uci -q get "openvpn.$instance.routewolf_ui" || :)" != 1 ] || continue
        config=$(uci -q get "openvpn.$instance.config" || :)
        device=$(uci -q get "openvpn.$instance.dev" || :)
        if [ -z "$device" ] && [ -f "$config" ]; then
            device=$(awk '$1=="dev" {print $2; exit}' "$config")
        fi
        case "$device" in
            tun|tap)
                [ "$(ip -br link show type tun 2>/dev/null | wc -l)" -le 1 ] || continue
                device=$(ip -br link show type tun 2>/dev/null | awk 'NR==1 {print $1}')
                device=${device:-tun0}
                ;;
        esac
        valid_name "$device" || continue
        printf '%s|%s\n' "$instance" "$device"
    done
}

inventory() {
    local configured interface proto device ovpn instance active managed known
    configured=$(uci -q show network | sed -n "s/^network\.\([a-zA-Z0-9_-]*\)\.proto='\([^']*\)'$/\1|\2/p")
    ovpn=$(openvpn_instances)
    active=$(selected_device)
    managed=
    known=
    while IFS='|' read -r interface proto; do
        [ -n "$interface" ] || continue
        [ "$(uci -q get "network.$interface.routewolf_ui" || :)" != 1 ] || continue
        device=$(uci -q get "network.$interface.device" || :)
        instance=
        case "$proto:$device" in
            wireguard:*) device=$interface ;;
            amneziawg:*|awg:*) proto=amneziawg; device=$interface ;;
            outline:*|none:outline0) proto=outline; device=${device:-$interface}; known="$known $device" ;;
            openvpn:*|none:tun*|none:tap*)
                instance=$(printf '%s\n' "$ovpn" | awk -F'|' -v dev="$device" '$2==dev {print $1; exit}')
                [ "$proto" = openvpn ] || [ -n "$instance" ] ||
                    { [ "$interface" = OpenVPN ] && [ "$device" = "$active" ]; } || continue
                proto=openvpn
                managed="$managed $device "
                ;;
            *) continue ;;
        esac
        valid_name "$device" || continue
        printf 'net_%s|%s|%s|%s|%s\n' "$interface" "$proto" "$device" "$interface" "$instance"
    done <<EOF
$configured
EOF
    while IFS='|' read -r instance device; do
        [ -n "$instance" ] && valid_name "$device" || continue
        case "$managed" in *" $device "*) continue ;; esac
        printf 'ovpn_%s|openvpn|%s||%s\n' "$instance" "$device" "$instance"
    done <<EOF
$ovpn
EOF
    case " $known " in
        *' outline0 '*) ;;
        *)
            if [ -f /etc/routewolf/outline.conf ] || [ -e /sys/class/net/outline0 ]; then
                printf 'outline_existing|outline|outline0||\n'
            fi ;;
    esac
}

lookup() {
    inventory | awk -F'|' -v id="$1" '$1==id {print; exit}'
}

associated() {
    uci -q show routewolf_ui | awk -F= -v ref="'$1'" '
        /^routewolf_ui\.[a-zA-Z0-9_]+\.existing_ref=/ && $2 == ref {
            split($1, parts, "."); print parts[2]; exit
        }'
}

list_interfaces() (
    # jshn initializes its namespace and JSON state using unset shell variables.
    set +u
    . /usr/share/libubox/jshn.sh
    local active mode id proto device interface instance paused
    active=$(selected_device)
    mode=$(uci -q get routewolf_ui.ui.active_mode || echo routewolf)
    paused=$(route_device "$state/paused-route.conf")
    json_init
    json_add_array interfaces
    while IFS='|' read -r id proto device interface instance; do
        [ -n "$id" ] || continue
        json_add_object ''
        json_add_string id "$id"
        json_add_string label "${interface:-${instance:-$device}}"
        json_add_string protocol "$proto"
        json_add_string profile "$(associated "$id")"
        case "$interface" in lan|wan|wan6|loopback) json_add_boolean protected 1 ;; esac
        if [ "$id" = outline_existing ] && [ ! -f /etc/routewolf/outline.conf ]; then
            json_add_boolean protected 1
        fi
        json_add_boolean up "$(if ip link show dev "$device" 2>/dev/null | grep -q '<[^>]*UP'; then echo 1; else echo 0; fi)"
        if [ "$device" = "$active" ] || [ "$device" = "$paused" ]; then
            json_add_string routing "$mode"
        fi
        json_close_object
    done <<EOF
$(inventory)
EOF
    json_close_array
    json_dump
)

adopt() {
    local ref=$1 data proto device iface instance name profile routing
    valid_name "$ref" || return 1
    [ -z "$(uci changes routewolf_ui)" ] || return 1
    [ -z "$(associated "$ref")" ] || return 0
    data=$(lookup "$ref")
    [ -n "$data" ] || return 1
    IFS='|' read -r _ proto device iface instance <<EOF
$data
EOF
    case "$iface" in lan|wan|wan6|loopback) return 1 ;; esac
    [ "$ref" != outline_existing ] || [ -f /etc/routewolf/outline.conf ] || return 1
    name=${iface:-${instance:-$device}}
    routing=full
    if [ "$device" = "$(selected_device)" ] || [ "$device" = "$(route_device "$state/paused-route.conf")" ]; then
        routing=$(uci -q get routewolf_ui.ui.active_mode || echo routewolf)
    fi
    profile=$(uci add routewolf_ui profile) || return 1
    if ! { uci set "routewolf_ui.$profile.name=$name" &&
        uci set "routewolf_ui.$profile.protocol=$proto" &&
        uci set "routewolf_ui.$profile.existing_ref=$ref" &&
        uci set "routewolf_ui.$profile.routing=$routing" &&
        uci set "routewolf_ui.$profile.launch=boot" &&
        uci commit routewolf_ui; }; then
        uci -q revert routewolf_ui
        return 1
    fi
    if [ "$device" = "$(selected_device)" ] &&
       [ -z "$(uci -q get routewolf_ui.ui.active_profile || :)" ]; then
        uci set "routewolf_ui.ui.active_profile=$profile"
        uci set "routewolf_ui.ui.preferred_profile=$profile"
        uci commit routewolf_ui
    fi
}

delete_link() {
    local ref=$1 deleting_all=${2:-} data proto device iface instance
    valid_name "$ref" || return 1
    data=$(lookup "$ref")
    [ -n "$data" ] || return 0
    IFS='|' read -r _ proto device iface instance <<EOF
$data
EOF
    case "$iface" in lan|wan|wan6|loopback) return 1 ;; esac
    if [ "$deleting_all" != all ]; then
        [ "$device" != "$(selected_device)" ] &&
            [ "$device" != "$(route_device "$state/paused-route.conf")" ] || return 1
    fi
    delete_sections "$iface" "$instance"
    if [ "$ref" = outline_existing ] &&
       [ -f /etc/routewolf/outline.conf ] &&
       grep -Eq '"interface_name"[[:space:]]*:[[:space:]]*"outline0"' /etc/sing-box/config.json 2>/dev/null; then
        /etc/init.d/sing-box stop
        /etc/init.d/sing-box disable
        rm -f /etc/routewolf/outline.conf
        if [ -f /etc/sing-box/config.json.routewolf-backup ]; then
            mv /etc/sing-box/config.json.routewolf-backup /etc/sing-box/config.json
        else
            rm -f /etc/sing-box/config.json
        fi
    fi
}

delete_sections() (
    local interfaces=$1 instances=$2 section type cfg draft
    [ -n "$interfaces$instances" ] || return 0
    for cfg in network openvpn firewall; do
        [ -z "$(uci changes "$cfg")" ] || return 1
    done
    draft=$(mktemp -d /tmp/routewolf-remove-profile.XXXXXX)
    for cfg in network openvpn firewall; do
        [ ! -f "/etc/config/$cfg" ] || cp "/etc/config/$cfg" "$draft/$cfg"
    done
    complete=no
    trap '
        if [ "$complete" != yes ]; then
            for cfg in network openvpn firewall; do
                uci -q revert "$cfg" || :
                [ ! -f "$draft/$cfg" ] || cp "$draft/$cfg" "/etc/config/$cfg"
            done
            ubus call network reload >/dev/null 2>&1 || :
            fw4 reload >/dev/null 2>&1 || :
        fi
        rm -rf "$draft"
    ' EXIT
    for iface in $interfaces; do
        for type in "amneziawg_$iface" "wireguard_$iface" "awg_$iface"; do
            while uci -q delete "network.@$type[0]"; do :; done
        done
        for section in $(uci -q show firewall | sed -n 's/^firewall\.\(.*\)=zone$/\1/p'); do
            uci -q del_list "firewall.$section.network=$iface" || :
        done
        uci -q delete "firewall.routewolf_ui_$iface" || :
        uci -q delete "firewall.routewolf_ui_${iface}_lan" || :
        uci delete "network.$iface"
    done
    for instance in $instances; do uci delete "openvpn.$instance"; done
    fw4 check
    uci commit network
    uci commit firewall
    if [ -n "$instances" ]; then uci commit openvpn; fi
    ubus call network reload >/dev/null
    fw4 reload
    for iface in $interfaces; do ifdown "$iface" >/dev/null 2>&1 || :; done
    for instance in $instances; do
        ubus call service delete "$(printf '{"name":"openvpn","instance":"%s"}' "$instance")" >/dev/null 2>&1 || :
    done
    for iface in $interfaces; do
        case "$iface" in tunrw0|tunrw1|tunrwb) rm -f "$state/$iface.ovpn" ;; esac
    done
    complete=yes
)

delete_profile_interfaces() {
    local profile=$1 ref iface instance interfaces instances
    ref=$(uci -q get "routewolf_ui.$profile.existing_ref" || :)
    if [ -n "$ref" ]; then
        delete_link "$ref"
        return
    fi
    interfaces=
    for iface in $(uci -q show network | sed -n "s/^network\.\([a-zA-Z0-9_]*\)\.routewolf_profile='$profile'$/\1/p"); do
        [ "$(uci -q get "network.$iface.routewolf_ui" || :)" = 1 ] || continue
        [ "$iface" != "$(selected_device)" ] &&
            [ "$iface" != "$(route_device "$state/paused-route.conf")" ] || return 1
        interfaces="$interfaces $iface"
    done
    instances=
    for instance in $(uci -q show openvpn | sed -n "s/^openvpn\.\([a-zA-Z0-9_]*\)\.routewolf_profile='$profile'$/\1/p"); do
        [ "$(uci -q get "openvpn.$instance.routewolf_ui" || :)" = 1 ] || continue
        instances="$instances $instance"
    done
    delete_sections "$interfaces" "$instances"
}

mark_legacy_slots() {
    local profile iface instance role changed=0
    [ -z "$(uci changes network)" ] && [ -z "$(uci changes openvpn)" ] || return 0
    for role in active backup; do
        profile=$(uci -q get "routewolf_ui.ui.${role}_profile" || :)
        [ -n "$profile" ] && [ "$(uci -q get "routewolf_ui.$profile" || :)" = profile ] || continue
        if [ "$role" = active ]; then
            iface=$(selected_device)
            [ -n "$iface" ] || iface=$(route_device "$state/paused-route.conf")
        else
            iface=$(uci -q get routewolf_ui.ui.backup_device || :)
        fi
        valid_name "$iface" && [ "$(uci -q get "network.$iface.routewolf_ui" || :)" = 1 ] || continue
        uci set "network.$iface.routewolf_profile=$profile"
        instance="routewolf_ui_$iface"
        if [ "$(uci -q get "openvpn.$instance.routewolf_ui" || :)" = 1 ]; then
            uci set "openvpn.$instance.routewolf_profile=$profile"
        fi
        changed=1
    done
    if [ "$changed" = 1 ]; then
        uci commit network
        if [ -f /etc/config/openvpn ]; then uci commit openvpn; fi
    fi
}

case "${1:-}" in
    list) list_interfaces ;;
    adopt) adopt "$2" ;;
    lookup) valid_name "$2" && lookup "$2" ;;
    remove-profile)
        case "$2" in ''|*[!a-zA-Z0-9_]*) exit 2 ;; esac
        delete_profile_interfaces "$2" ;;
    remove-link) delete_link "$2" "${3:-}" ;;
    mark-legacy) mark_legacy_slots ;;
    *) exit 2 ;;
esac
