#!/bin/sh

phase() {
    [ -n "${RW_JOB_STATE:-}" ] || return 0
    printf '%s\n' "$1" > "$RW_JOB_STATE/phase.new" &&
        mv "$RW_JOB_STATE/phase.new" "$RW_JOB_STATE/phase"
}

# Only fixed diagnostic identifiers cross RPC. Raw provider/tool output can
# contain credentials and goes into the existing restricted local logs.
reason() {
    [ -n "${RW_JOB_STATE:-}" ] || return 0
    printf '%s\n' "$1" > "$RW_JOB_STATE/reason.new" &&
        mv "$RW_JOB_STATE/reason.new" "$RW_JOB_STATE/reason"
}

present() {
    command -v "$1" >/dev/null 2>&1
}

missing_components() {
    case "$1" in
        wireguard)
            if ! present wg || [ ! -x /lib/netifd/proto/wireguard.sh ]; then
                printf '%s\n' wireguard-tools kmod-wireguard
            fi
            ;;
        amneziawg)
            if ! present awg || { [ ! -x /lib/netifd/proto/amneziawg.sh ] && [ ! -x /lib/netifd/proto/awg.sh ]; }; then
                printf '%s\n' amneziawg-tools kmod-amneziawg
            fi
            ;;
        openvpn)
            present openvpn || printf '%s\n' openvpn-openssl
            [ -c /dev/net/tun ] || printf '%s\n' kmod-tun
            ;;
        singbox|outline)
            present sing-box || printf '%s\n' sing-box-tiny
            [ -c /dev/net/tun ] || printf '%s\n' kmod-tun
            ;;
        *) return 2 ;;
    esac
}

missing_backup_tools() {
    ip -4 rule help 2>&1 | grep -qw oif || printf '%s\n' ip-tiny
    case "$1" in
        singbox|outline) present curl || printf '%s\n' curl ca-bundle ;;
    esac
}

prepare_package_index() {
    local missing
    missing=$(missing_components "$1") || return 1
    if [ -n "$missing" ]; then
        phase packages
        reason package-install
        # One feed can be down even though the feeds for this component
        # succeeded or a usable signed index is already cached.
        pkg_update || :
    fi
}
