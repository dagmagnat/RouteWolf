#!/bin/sh
set -e
umask 077
lib=/usr/libexec/routewolf-ui
state=/etc/routewolf-ui
route=/etc/routewolf/route.conf
watchdog=/etc/routewolf/watchdog.conf
. "$lib/dependencies.sh"

fail() { printf '%s\n' "$*" >&2; exit 1; }
key_ok() { printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9+/]{43}=$'; }

device_up() {
    local flags
    flags=$(cat "/sys/class/net/$1/flags" 2>/dev/null) || return 1
    [ "$((flags & 1))" -ne 0 ]
}

stop_old_wireguard_slots() {
    local previous attempt
    for previous in awgui0 awgui1 wgui0 wgui1; do
        [ "$previous" != "$dev" ] || continue
        [ "$(uci -q get "network.$previous.routewolf_ui" || :)" = 1 ] || continue
        uci set "network.$previous.auto=0" || return 1
        if [ "$previous" = "$active" ] && device_up "$previous"; then
            resume_previous=yes
        fi
        ifdown "$previous" >/dev/null 2>&1 || :
        for attempt in 1 2 3 4 5; do
            device_up "$previous" || break
            sleep 1
        done
        if device_up "$previous"; then return 1; fi
    done
}

native_profile() (
    profile=$1
    backup=${2:-no}
    reason invalid-profile
    case "$profile" in ''|*[!a-zA-Z0-9_]*) fail 'Invalid profile ID.' ;; esac
    [ "$(uci -q get "routewolf_ui.$profile")" = profile ] || fail 'Profile not found.'
    [ -x /usr/sbin/routewolf-route.sh ] || fail 'Install RouteWolf first.'
    for package in network firewall; do
        [ -z "$(uci changes "$package")" ] || fail 'Save or revert pending network and firewall changes first.'
    done

    protocol=$(uci -q get "routewolf_ui.$profile.protocol")
    routing=$(uci -q get "routewolf_ui.$profile.routing")
    launch=$(uci -q get "routewolf_ui.$profile.launch" || echo boot)
    case "$protocol" in wireguard) tool=wg ;; amneziawg) tool=awg ;; openvpn) tool=openvpn ;; *) fail 'This profile type cannot be activated by the trial.' ;; esac
    case "$routing" in routewolf|full) ;; *) fail 'Choose selective or full routing for this profile.' ;; esac
    case "$launch" in boot) auto=1 ;; manual) auto=0 ;; *) fail 'Invalid launch mode.' ;; esac
    if [ "$backup" = yes ]; then
        auto=0
    fi

    temp=$(mktemp -d /tmp/routewolf-ui-vpn.XXXXXX)
    token_dir="$temp"
    changed=no
    ovpn_changed=no
    stopped_singbox=no
    resume_previous=no
    done_ok=no
    cleanup() {
        if [ "$changed" = yes ] && [ "$done_ok" != yes ]; then
            if [ "$ovpn_changed" = yes ]; then
                ubus call service delete "$(printf '{"name":"openvpn","instance":"%s"}' "$peer")" >/dev/null 2>&1 || :
                uci -q revert openvpn || :
                cp "$token_dir/openvpn" /etc/config/openvpn
                if [ -e "$token_dir/old.ovpn" ]; then
                    cp "$token_dir/old.ovpn" "$ovpn_file"
                else
                    rm -f "$ovpn_file"
                fi
            fi
            ifdown "$dev" >/dev/null 2>&1 || :
            for c in network firewall; do
                uci -q revert "$c" || :
                cp "$token_dir/$c" "/etc/config/$c"
            done
            if [ "$backup" != yes ]; then
                for file in "$route" "$watchdog" "$state/full.nft"; do
                    name=${file##*/}
                    if [ -e "$token_dir/$name" ]; then cp "$token_dir/$name" "$file"; else rm -f "$file"; fi
                done
            fi
            ubus call network reload >/dev/null 2>&1 || :
            if [ "$resume_previous" = yes ]; then ifup "$active" >/dev/null 2>&1 || :; fi
            fw4 reload >/dev/null 2>&1 || :
            [ "$backup" = yes ] || /usr/sbin/routewolf-route.sh >/dev/null 2>&1 || :
            if [ "$stopped_singbox" = yes ]; then
                /etc/init.d/routewolf-subscription-engine start >/dev/null 2>&1 || :
                /etc/init.d/routewolf-subscription start >/dev/null 2>&1 || :
            fi
        fi
        rm -rf "$token_dir"
    }
    trap cleanup EXIT
    trap 'exit 1' HUP INT TERM
    uci -q get "routewolf_ui.$profile.config" > "$token_dir/profile"
    bytes=$(wc -c < "$token_dir/profile")
    [ "$bytes" -gt 0 ] && [ "$bytes" -le 65536 ] || fail 'Profile is empty or too large.'
    set -- --luci-profile
    . "$lib/installer-functions.sh"
    phase config
    if [ "$tool" = openvpn ]; then
        [ -z "$(uci changes openvpn)" ] || fail 'Save or revert pending OpenVPN changes first.'
        phase config
        reason config-invalid
        LC_ALL=C awk -f "$lib/openvpn.awk" "$token_dir/profile" > "$token_dir/client.ovpn" ||
            fail 'Use a client profile with inline certificates and no scripts.'
        if [ -n "$(missing_components "$protocol")" ]; then
            prepare_package_index "$protocol"
            pkg_install openvpn-openssl kmod-tun
        fi
        [ -z "$(missing_components "$protocol")" ] || return 1
        mtu=
    else
        [ "$(grep -Eic '^[[:space:]]*\[Peer\][[:space:]]*$' "$token_dir/profile")" -eq 1 ] ||
            fail 'A single peer is required.'
        if grep -Eiq '^[[:space:]]*(PreUp|PostUp|PreDown|PostDown|Table)[[:space:]]*=' "$token_dir/profile"; then
            fail 'Custom hooks and route tables are unsupported.'
        fi

        # Reuse RouteWolf's profile parser and kernel/package compatibility tests.
        parse_awg_config_file "$token_dir/profile"
        private=$AWG_PRIVATE_KEY
        public=$AWG_PUBLIC_KEY
        psk=$AWG_PRESHARED_KEY
        [ -n "$AWG_IP" ] && key_ok "$private" && key_ok "$public" || fail 'Invalid keys or missing address.'
        [ -z "$psk" ] || key_ok "$psk" || fail 'Invalid preshared key.'
        [ "${AWG_ALLOWED_IPS:-0.0.0.0/0}" = 0.0.0.0/0 ] || fail 'The trial needs IPv4 AllowedIPs 0.0.0.0/0.'
        printf '%s\n' "$AWG_IP" | awk -F'[./]' '
            NF==5 && $5~/^[0-9]+$/ && $5>=1 && $5<=32 {
                for(i=1;i<5;i++) if($i!~/^[0-9]+$/ || $i>255) exit 1; ok=1
            } END { if(!ok) exit 1 }' || fail 'Set one IPv4 address with a prefix.'
        case "$AWG_ENDPOINT" in ''|*[!A-Za-z0-9.-]*) fail 'Set an IPv4 address or a hostname for Endpoint.' ;; esac
        port=${AWG_ENDPOINT_PORT:-51820}
        keepalive=${AWG_KEEPALIVE:-25}
        for number in "$port" "$keepalive"; do
            case "$number" in ''|*[!0-9]*) fail 'Invalid endpoint port or keepalive.' ;; esac
            [ "${#number}" -le 5 ] && [ "$number" -le 65535 ] || fail 'Port or keepalive is out of range.'
        done
        [ "$port" -ge 1 ] || fail 'Port must be greater than zero.'
        mtu=$(routewolf_mtu_or_default "$AWG_MTU" 1280)
        if [ "$tool" = awg ]; then
            AWG_PROFILE_MODE=auto
            awg_resolve_profile_version
            capability=$(awg_installed_generation || :)
            if ! awg_generation_supports "$capability" "$AWG_PROFILE_VERSION"; then
                [ -z "$capability" ] || fail 'The installed AmneziaWG version is too old for this profile.'
                prepare_package_index "$protocol"
                phase packages
                reason package-install
                install_awg_packages
            fi
        elif [ -n "$(missing_components "$protocol")" ]; then
            prepare_package_index "$protocol"
            pkg_install wireguard-tools kmod-wireguard
        fi
        [ -z "$(missing_components "$protocol")" ] || return 1
    fi
    if ! network_protocol_loaded "$protocol"; then
        reason network-restart-required
        fail 'OpenWrt has not loaded the installed tunnel protocol. Reboot the router and retry.'
    fi
    phase start
    reason tunnel-start

    active=$(sed -n "s/^VPN_ROUTE_DEV='\([a-zA-Z0-9_.-]*\)'$/\1/p" "$route" 2>/dev/null | head -n1)
    case "$backup:$tool" in
        yes:openvpn) dev=tunrwb ;;
        yes:*) dev="${tool}rwb" ;;
        no:openvpn) dev=tunrw0; [ "$active" != "$dev" ] || dev=tunrw1 ;;
        *) dev="${tool}ui0"; [ "$active" != "$dev" ] || dev="${tool}ui1" ;;
    esac
    peer="routewolf_ui_$dev"
    zone="routewolf_ui_$dev"
    forwarding="${zone}_lan"
    if uci -q get "network.$dev" >/dev/null &&
       { [ "$(uci -q get "network.$dev.routewolf_ui" || :)" != 1 ] ||
         { [ "$backup" = yes ] && [ "$(uci -q get "network.$dev.routewolf_ui_backup" || :)" != 1 ]; }; }; then
        fail 'The candidate interface name is already in use.'
    fi

    main=$(ip -4 route show table main default)
    [ -n "$main" ] || fail 'WAN has no default route.'
    lan=$(ubus call network.interface.lan status | jsonfilter -e '@.l3_device')
    case "$lan" in ''|*[!a-zA-Z0-9_.-]*) fail 'LAN device unavailable.' ;; esac
    mkdir -p "$state" /etc/routewolf
    for c in network firewall; do cp "/etc/config/$c" "$token_dir/$c"; done
    for file in "$route" "$watchdog" "$state/full.nft"; do
        if [ -e "$file" ]; then cp "$file" "$token_dir/${file##*/}"; fi
    done
    changed=yes
    if [ "$backup" != yes ]; then
        stop_old_wireguard_slots || fail 'The previous WireGuard interface is still up.'
    fi
    ifdown "$dev" >/dev/null 2>&1 || :
    uci -q delete "network.$dev" || :
    uci -q delete "network.$peer" || :
    uci set "network.$dev=interface"
    if [ "$tool" = openvpn ]; then
        uci set "network.$dev.proto=none"
        uci set "network.$dev.routewolf_ui=1"
        uci set "network.$dev.device=$dev"
        uci set "network.$dev.auto=$auto"
    else
        uci set "network.$dev.proto=$protocol"
        uci set "network.$dev.routewolf_ui=1"
        uci set "network.$dev.auto=0"
        uci set "network.$dev.peerdns=0"
        uci set "network.$dev.mtu=$mtu"
        uci set "network.$dev.private_key=$private"
        uci add_list "network.$dev.addresses=$AWG_IP"
        if [ "$tool" = awg ]; then
            for pair in "jc=$AWG_JC" "jmin=$AWG_JMIN" "jmax=$AWG_JMAX" "s1=$AWG_S1" "s2=$AWG_S2" \
                        "h1=$AWG_H1" "h2=$AWG_H2" "h3=$AWG_H3" "h4=$AWG_H4"; do
                [ -z "${pair#*=}" ] || uci set "network.$dev.awg_$pair"
            done
            awg_apply_optional_config "$dev"
        fi
        uci set "network.$peer=${protocol}_$dev"
        uci set "network.$peer.public_key=$public"
        [ -z "$psk" ] || uci set "network.$peer.preshared_key=$psk"
        uci set "network.$peer.endpoint_host=$AWG_ENDPOINT"
        uci set "network.$peer.endpoint_port=$port"
        uci set "network.$peer.route_allowed_ips=0"
        uci set "network.$peer.persistent_keepalive=5"
        uci add_list "network.$peer.allowed_ips=0.0.0.0/0"
        if [ "$backup" = yes ]; then
            uci set "network.$peer.persistent_keepalive=$keepalive"
        fi
    fi
    if [ "$backup" = yes ]; then
        uci set "network.$dev.routewolf_ui_backup=1"
        uci set "network.$dev.routewolf_backup_mode=$routing"
    fi
    uci commit network
    ubus call network reload >/dev/null
    if [ "$tool" = openvpn ]; then
        if uci -q get "openvpn.$peer" >/dev/null &&
           [ "$(uci -q get "openvpn.$peer.routewolf_ui" || :)" != 1 ]; then
            fail 'The candidate OpenVPN instance name is in use.'
        fi
        ovpn_file="$state/$dev.ovpn"
        cp /etc/config/openvpn "$token_dir/openvpn"
        if [ -f "$ovpn_file" ]; then cp "$ovpn_file" "$token_dir/old.ovpn"; fi
        ovpn_changed=yes
        ubus call service delete "$(printf '{"name":"openvpn","instance":"%s"}' "$peer")" >/dev/null 2>&1 || :
        {
            cat "$token_dir/client.ovpn"
            printf '\nclient\ndev %s\ndev-type tun\nroute-nopull\nroute-noexec\nscript-security 1\ndisable-dco\n' "$dev"
        } > "$ovpn_file"
        uci set "openvpn.$peer=openvpn"
        uci set "openvpn.$peer.config=$ovpn_file"
        uci set "openvpn.$peer.routewolf_ui=1"
        start_after_save=1
        [ "$backup" != yes ] || start_after_save=0
        uci set "openvpn.$peer.enabled=$start_after_save"
        uci set "openvpn.$peer.script_security=1"
        uci commit openvpn
        if [ "$backup" != yes ]; then /etc/init.d/openvpn start "$peer"; fi
    elif [ "$backup" != yes ]; then
        ifup "$dev"
    fi

    if [ "$backup" != yes ]; then
        phase verify
        reason tunnel-unreachable
        healthy=no
        for attempt in $(seq 1 25); do
            if [ "$tool" = openvpn ]; then
                if ip -4 addr show dev "$dev" 2>/dev/null | grep -q 'inet '; then
                    healthy=yes
                    break
                fi
            elif "$tool" show "$dev" latest-handshakes 2>/dev/null | awk '$2>0{ok=1} END{exit !ok}'; then
                healthy=yes
                break
            fi
            sleep 1
        done
        if [ "$healthy" != yes ]; then
            if [ "$tool" != openvpn ] && ! device_up "$dev"; then reason tunnel-start; fi
            fail 'The candidate did not complete a handshake. Previous routing restored.'
        fi
        [ "$(ip -4 route show table main default)" = "$main" ] || fail 'WAN default route changed unexpectedly.'
        if [ "$tool" = openvpn ]; then
            uci set "openvpn.$peer.enabled=$auto"
            uci commit openvpn
        else
            "$tool" set "$dev" peer "$public" persistent-keepalive "$keepalive"
            uci set "network.$peer.persistent_keepalive=$keepalive"
            uci set "network.$dev.auto=$auto"
            uci commit network
        fi
    fi

    uci set "firewall.$zone=zone"
    uci set "firewall.$zone.name=$dev"
    uci -q delete "firewall.$zone.network" || :
    if [ "$backup" = yes ]; then
        uci -q delete "firewall.$zone.device" || :
        uci add_list "firewall.$zone.device=$dev"
    else
        uci add_list "firewall.$zone.network=$dev"
    fi
    for entry in input=REJECT output=ACCEPT forward=REJECT masq=1 mtu_fix=1; do
        uci set "firewall.$zone.$entry"
    done
    uci set "firewall.$forwarding=forwarding"
    uci set "firewall.$forwarding.src=lan"
    uci set "firewall.$forwarding.dest=$dev"
    if [ "$backup" = yes ]; then
        fw4 check
        uci commit firewall
        fw4 reload
        uci set "routewolf_ui.ui.backup_device=$dev"
        uci set "routewolf_ui.ui.backup_profile=$profile"
        uci commit routewolf_ui
        done_ok=yes
        return 0
    fi
    if [ "$routing" = full ]; then
        cat > "$state/full.nft" <<EOF
chain rwui_full {
    type filter hook prerouting priority -148; policy accept;
    iifname "$lan" fib daddr type local return
    iifname "$lan" ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/3 } return
    iifname "$lan" meta nfproto ipv4 meta mark set meta mark | 1
}
EOF
        uci set firewall.routewolf_ui_full=include
        uci set firewall.routewolf_ui_full.type=nftables
        uci set firewall.routewolf_ui_full.position=table-post
        uci set "firewall.routewolf_ui_full.path=$state/full.nft"
    else
        uci -q delete firewall.routewolf_ui_full || :
    fi
    fw4 check
    uci commit firewall
    fw4 reload
    if [ -f /etc/routewolf-subscription/mode ] && [ ! -e "$state/native-active" ]; then
        stopped_singbox=yes
        /etc/init.d/routewolf-subscription stop
        /etc/init.d/routewolf-subscription-engine stop
    fi
    printf "VPN_ROUTE_DEV='%s'\nVPN_ROUTE_MTU='%s'\n" "$dev" "$mtu" > "$route.new"
    mv "$route.new" "$route"
    /usr/sbin/routewolf-route.sh
    ip -4 route show table 99 default | grep -q "dev $dev"
    # Preserve manual launch: a boot watchdog would bring the tunnel up.
    if [ "$auto" = 1 ]; then
        if [ "$tool" = openvpn ]; then
            /etc/init.d/openvpn enable
            printf "WATCHDOG_TYPE='ovpn'\nWATCHDOG_DEVICE='%s'\nWATCHDOG_UCI_IFACE='%s'\nWATCHDOG_SERVICE='openvpn'\n" "$dev" "$dev" > "$watchdog.new"
        else
            printf "WATCHDOG_TYPE='%s'\nWATCHDOG_DEVICE='%s'\nWATCHDOG_UCI_IFACE='%s'\nWATCHDOG_SERVICE='network'\n" "$tool" "$dev" "$dev" > "$watchdog.new"
        fi
        mv "$watchdog.new" "$watchdog"
        /etc/init.d/routewolf-watchdog enable >/dev/null 2>&1 || :
    else
        printf "WATCHDOG_TYPE='none'\n" > "$watchdog.new"
        mv "$watchdog.new" "$watchdog"
    fi
    uci set "routewolf_ui.ui.active_profile=$profile"
    uci set "routewolf_ui.ui.preferred_profile=$profile"
    uci set "routewolf_ui.ui.active_mode=$routing"
    uci commit routewolf_ui
    if [ "$stopped_singbox" = yes ]; then
        /etc/init.d/routewolf-subscription disable >/dev/null 2>&1 || :
        /etc/init.d/routewolf-subscription-engine disable >/dev/null 2>&1 || :
    fi
    touch "$state/native-active"
    done_ok=yes
    printf '%s\n' 'New profile activated after successful handshake.'
)

case "${1:-}" in
    backup) native_profile "$2" yes ;;
    activate)
        case "${2:-}" in ''|*[!a-zA-Z0-9_]*) exit 2 ;; esac
        case "$(uci -q get "routewolf_ui.$2.protocol" || :)" in
            singbox|vless|outline) exec "$lib/singbox.sh" "$2" ;;
        esac
        native_profile "$2"
        ;;
    *) exit 2 ;;
esac
