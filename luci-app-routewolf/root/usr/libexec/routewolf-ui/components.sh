#!/bin/sh
set -eu
umask 077

lib=/usr/libexec/routewolf-ui
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
        installed=$(apk info 2>/dev/null) || return 1
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

group_blocker() {
    local group=$1 protocol section binary subsystem utility
    for protocol in $(group_protocols "$group"); do
        if printf '%s\n' "$profiles" | grep -Fxq "$protocol"; then
            echo profile
            return
        fi
    done
    if [ "$group" = xray ] || [ "$group" = singbox ]; then
        if [ -f /etc/routewolf-subscription/mode ] && [ ! -e /etc/routewolf-ui/native-active ]; then
            subsystem=singbox
            if grep -qx xray /etc/routewolf-subscription/engine 2>/dev/null; then subsystem=xray; fi
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

list_components() {
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
}

remove_components() {
    local selected=$1 group package target old_ifs
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
        target="$target $(removable_packages "$group")"
    done
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

case "${1:-}" in
    list) list_components ;;
    remove) remove_components "${2:-}" ;;
    *) exit 2 ;;
esac
