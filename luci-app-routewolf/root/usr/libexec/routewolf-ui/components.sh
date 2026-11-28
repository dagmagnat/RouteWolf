#!/bin/sh
set -eu
umask 077

lib=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$lib/dependencies.sh"

groups='xray singbox openvpn amneziawg wireguard'

group_packages() {
    case "$1" in
        xray) echo 'xray-core xray' ;;
        singbox) echo 'sing-box-tiny sing-box sing-box-full' ;;
        openvpn) echo 'luci-i18n-openvpn-ru luci-app-openvpn openvpn-openssl openvpn-mbedtls openvpn-wolfssl kmod-ovpn-dco-v2 kmod-ovpn-dco' ;;
        amneziawg) echo 'luci-i18n-amneziawg-ru luci-proto-amneziawg luci-app-amneziawg amneziawg-tools kmod-amneziawg' ;;
        wireguard) echo 'luci-proto-wireguard wireguard-tools kmod-wireguard' ;;
        *) return 1 ;;
    esac
}

group_protocols() {
    case "$1" in
        xray) echo 'vless xray' ;;
        singbox) echo 'singbox outline' ;;
        amneziawg) echo 'amneziawg awg' ;;
        *) echo "$1" ;;
    esac
}

read_inventory() {
    local version
    version=$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '"' | cut -d. -f1)
    case "$version" in ''|*[!0-9]*) version=0 ;; esac
    if present apk && { [ "$version" -ge 25 ] || ! present opkg; }; then
        manager=apk
        installed=$(apk --no-network --repositories-file /dev/null info 2>/dev/null) || return 1
        built_in=$(sed -n 's/^P://p' /rom/lib/apk/db/installed /rom/usr/lib/apk/db/installed 2>/dev/null || :)
    else
        manager=opkg
        local entries
        entries=$(opkg list-installed 2>/dev/null) || return 1
        installed=$(printf '%s\n' "$entries" | awk '{print $1}')
        built_in=$(sed -n 's/^Package: //p' /rom/usr/lib/opkg/status 2>/dev/null || :)
    fi
}

package_set() {
    local names=$1 group=$2 package
    for package in $(group_packages "$group"); do
        if printf '%s\n' "$names" | grep -Fxq "$package"; then
            printf '%s\n' "$package"
        fi
    done
}

removable_packages() {
    local package
    for package in $(package_set "$installed" "$1"); do
        if ! printf '%s\n' "$built_in" | grep -Fxq "$package"; then
            printf '%s\n' "$package"
        fi
    done
}

orphaned_subscription() {
    [ -f /etc/routewolf-subscription/mode ] &&
        [ -e /etc/routewolf-ui/paused-singbox ] &&
        [ ! -e /etc/routewolf-ui/native-active ] &&
        [ -z "$profiles" ]
}

subscription_group() {
    if grep -qx xray /etc/routewolf-subscription/engine 2>/dev/null; then
        echo xray
    else
        echo singbox
    fi
}

group_blocker() {
    local group=$1 protocol section binary subsystem utility
    for protocol in $(group_protocols "$group"); do
        if printf '%s\n' "$profiles" | grep -Fxq "$protocol"; then
            echo profile
            return
        fi
    done
    if [ "$group" = xray ] || [ "$group" = singbox ]; then
        if [ -f /etc/routewolf-subscription/mode ] && [ ! -e /etc/routewolf-ui/native-active ] &&
           ! orphaned_subscription; then
            subsystem=$(subscription_group)
            if [ "$group" = "$subsystem" ]; then echo running; return; fi
        fi
    fi
    case "$group" in
        xray) binary=xray ;;
        singbox) binary=sing-box ;;
        openvpn) binary=openvpn ;;
        *) binary= ;;
    esac
    if [ -n "$binary" ] && pidof "$binary" >/dev/null 2>&1; then echo running; return; fi
    case "$group" in
        wireguard|amneziawg)
            case "$group" in wireguard) utility=wg ;; *) utility=awg ;; esac
            if present "$utility" && [ -n "$("$utility" show interfaces 2>/dev/null || :)" ]; then
                echo running
                return
            fi
            for protocol in $(group_protocols "$group"); do
                for section in $(printf '%s\n' "$network" |
                        sed -n "s/^network\.\(.*\)\.proto='$protocol'\$/\1/p"); do
                    if [ "$(uci -q get "network.$section.routewolf_ui" || :)" = 1 ] &&
                       [ "$(uci -q get "network.$section.auto" || :)" = 0 ] &&
                       ! printf '%s\n' "$route_devices" | grep -Fxq "$section"; then
                        continue
                    fi
                    echo network
                    return
                done
            done
            ;;
        openvpn)
            for section in $(uci -q show openvpn | sed -n 's/^openvpn\.\(.*\)=openvpn$/\1/p'); do
                if [ "$(uci -q get "openvpn.$section.enabled" || :)" = 0 ] &&
                   ! printf '%s\n' "$route_devices" | grep -Fxq "${section#routewolf_ui_}"; then
                    continue
                fi
                echo network
                return
            done
            ;;
    esac
    return 0
}

read_configuration() {
    profiles=$(uci -q show routewolf_ui | sed -n "s/^routewolf_ui\..*\.protocol='\([^']*\)'\$/\1/p")
    network=$(uci -q show network)
    route_devices=$(sed -n "s/^VPN_ROUTE_DEV='\([a-zA-Z0-9_]*\)'\$/\1/p" \
        /etc/routewolf/route.conf /etc/routewolf-ui/paused-route.conf 2>/dev/null || :)
}

list_components() (
    # jshn initializes its namespace and JSON state using unset shell variables.
    set +u
    . /usr/share/libubox/jshn.sh
    local group current available blocker package
    read_inventory && read_configuration || return 1
    json_init
    json_add_array groups
    for group in $groups; do
        current=$(package_set "$installed" "$group")
        [ -n "$current" ] || continue
        available=$(removable_packages "$group")
        blocker=$(group_blocker "$group")
        if [ -z "$available" ] && [ -z "$blocker" ]; then blocker=built-in; fi
        json_add_object ''
        json_add_string id "$group"
        json_add_string blocker "$blocker"
        json_add_array packages
        for package in $current; do json_add_string '' "$package"; done
        json_close_array
        json_add_array removable
        for package in $available; do json_add_string '' "$package"; done
        json_close_array
        json_close_object
    done
    json_close_array
    json_dump
)

remove_components() {
    local selected=$1 owner_file=${2:-} group package target old_ifs section profile
    case "$selected" in ''|*[!a-z,]*) return 2 ;; esac
    old_ifs=$IFS
    IFS=,
    set -- $selected
    IFS=$old_ifs
    [ "$#" -ge 1 ] && [ "$#" -le 5 ] || return 2
    reason components-read
    read_inventory && read_configuration || return 1
    reason components-in-use
    target=
    for group in "$@"; do
        group_packages "$group" >/dev/null || return 2
        [ -z "$(group_blocker "$group")" ] || return 1
        for package in $(removable_packages "$group"); do
            if [ -z "$owner_file" ] || grep -Fxq "$package" "$owner_file"; then
                target="$target $package"
            fi
        done
    done
    if orphaned_subscription; then
        for group in "$@"; do
            [ "$group" = "$(subscription_group)" ] || continue
            sh "$lib/subscription/install.sh" remove || return 1
            rm -f /etc/routewolf-ui/paused-singbox
            for section in active_profile preferred_profile backup_profile; do
                profile=$(uci -q get "routewolf_ui.ui.$section" || :)
                if [ -n "$profile" ] && [ "$(uci -q get "routewolf_ui.$profile" || :)" != profile ]; then
                    uci -q delete "routewolf_ui.ui.$section" || return 1
                fi
            done
            uci commit routewolf_ui || return 1
        done
    fi
    set -- $target
    [ "$#" -gt 0 ] || return 0
    phase remove
    reason components-remove
    case "$manager" in
        apk) apk --no-network del "$@" >/tmp/routewolf-component-remove.log 2>&1 || return 1 ;;
        opkg) opkg remove "$@" >/tmp/routewolf-component-remove.log 2>&1 || return 1 ;;
    esac
    read_inventory || return 1
    for package in "$@"; do
        if printf '%s\n' "$installed" | grep -Fxq "$package"; then return 1; fi
    done
    return 0
}

record_components() {
    local before=$1 group package ledger=/etc/routewolf/component-packages staging
    [ -r "$before" ] || return 1
    read_inventory || return 1
    mkdir -p /etc/routewolf
    staging=$(mktemp /etc/routewolf/component-packages.XXXXXX)
    {
        if [ -f "$ledger" ]; then cat "$ledger"; fi
        for group in $groups; do
            for package in $(removable_packages "$group"); do
                grep -Fxq "$package" "$before" || printf '%s\n' "$package"
            done
        done
    } | sort -u > "$staging"
    mv "$staging" "$ledger"
}

remove_owned() {
    local ledger=$1 group package
    [ -s "$ledger" ] || return 0
    for group in $groups; do
        for package in $(group_packages "$group"); do
            grep -Fxq "$package" "$ledger" || continue
            if ! remove_components "$group" "$ledger"; then
                printf '%s\n' "Сохранены пакеты группы $group: используются или защищены зависимостями." >&2
            fi
            break
        done
    done
}

legacy_packages() {
    local group protocol found
    read_inventory || return 1
    found=$(uci -q show routewolf_ui | awk -F= '
        /\.protocol=/ { protocol[$1]=substr($2,2,length($2)-2) }
        /\.existing_ref=/ { sub(/\.existing_ref$/, ".protocol", $1); external[$1]=1 }
        END { for (key in protocol) if (!external[key]) print protocol[key] }')
    protocol=$(sed -n "s/^WATCHDOG_TYPE='\([^']*\)'$/\1/p" /etc/routewolf/watchdog.conf 2>/dev/null | head -n1)
    case "$protocol" in wg) protocol=wireguard ;; awg) protocol=amneziawg ;; ovpn) protocol=openvpn ;; esac
    found="$found $protocol"
    if [ -f /etc/routewolf/outline.conf ]; then found="$found outline"; fi
    if [ -f /etc/routewolf/singbox.conf ]; then found="$found singbox"; fi
    if [ -f /etc/routewolf-subscription/mode ]; then
        if grep -qx xray /etc/routewolf-subscription/engine 2>/dev/null; then
            found="$found vless"
        else
            found="$found singbox"
        fi
    fi
    for group in $groups; do
        for protocol in $(group_protocols "$group"); do
            case " $(printf '%s' "$found" | tr '\n' ' ') " in
                *" $protocol "*) removable_packages "$group"; break ;;
            esac
        done
    done
}

case "${1:-}" in
    list) list_components ;;
    remove) remove_components "${2:-}" ;;
    snapshot) read_inventory; printf '%s\n' "$installed" ;;
    record) record_components "$2" ;;
    legacy-packages) legacy_packages ;;
    remove-owned) remove_owned "$2" ;;
    *) exit 2 ;;
esac
