#!/bin/sh
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
state=/etc/routewolf-subscription
monitor=/etc/init.d/routewolf-subscription
engine=/etc/init.d/routewolf-subscription-engine

fail() { printf '%s\n' "$*" >&2; exit 1; }

download() {
    stage=$1
    case "$(uname -m)" in
        x86_64) arch=amd64 ;;
        aarch64) arch=arm64 ;;
        armv7l) arch=armv7 ;;
        mips*)
            case "$(. /etc/openwrt_release; printf '%s' "$DISTRIB_ARCH")" in
                mipsel_*) arch=mipsle ;;
                mips_*) arch=mips ;;
                *) fail "Unsupported CPU for RouteWolf sing-box subscriptions." ;;
            esac ;;
        *) fail "Unsupported CPU for RouteWolf sing-box subscriptions." ;;
    esac
    asset="routewolf-subscription-$arch.gz"
    ref=$(sed -n '1p' "$here/assets.txt")
    checksum=$(awk -v name="$asset" '$2 == name { print $1; exit }' "$here/assets.txt")
    printf '%s\n' "$ref" | grep -Eq '^[a-f0-9]{40}$' || fail "Invalid subscription asset manifest."
    printf '%s\n' "$checksum" | grep -Eq '^[a-f0-9]{64}$' || fail "No verified subscription helper for this CPU."
    url="https://raw.githubusercontent.com/dagmagnat/RouteWolf/$ref/$asset"
    if [ -n "${ROUTEWOLF_SUBSCRIPTION_ASSET_DIR:-}" ]; then
        cp "$ROUTEWOLF_SUBSCRIPTION_ASSET_DIR/$asset" "$stage/$asset"
    elif command -v curl >/dev/null 2>&1; then
        curl -fsSL --connect-timeout 10 --max-time 45 --max-filesize 4194304 "$url" -o "$stage/$asset"
    else
        /bin/uclient-fetch -T 30 -O "$stage/$asset" "$url"
    fi
    (cd "$stage"; printf '%s  %s\n' "$checksum" "$asset" | sha256sum -c)
    gzip -dc "$stage/$asset" > "$stage/subscription"
    rm -f "$stage/$asset"
    chmod 700 "$stage/subscription"
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n' > "$stage/token"
    "$stage/subscription" fetch "$stage/source" > "$stage/input"
}

prepare() {
    stage=$1
    mode=$2
    printf '%s\n' "$mode" > "$stage/mode"
    "$stage/subscription" render "$stage/input" "$stage/token" "$mode" "$stage/config.json"
    [ -c /dev/net/tun ] || fail "TUN device unavailable. Install kmod-tun for this kernel."
    sing-box check -c "$stage/config.json" >/dev/null 2>&1 ||
        fail "The installed sing-box cannot load this subscription. Some transports require the full package or a newer engine."
    cp "$here/controller.sh" "$stage/controller"
    cp "$here/install.sh" "$stage/manage"
    chmod 700 "$stage/controller" "$stage/manage"
}

restore_offload() {
    for option in flow_offloading flow_offloading_hw; do
        if [ -f "$state/$option" ] && [ "$(uci -q get "firewall.@defaults[0].$option")" = 0 ]; then
            uci set "firewall.@defaults[0].$option=$(cat "$state/$option")"
        fi
    done
}

remove() {
    [ -x "$state/controller" ] || return 0
    "$monitor" stop >/dev/null 2>&1 || true
    "$monitor" disable >/dev/null 2>&1 || true
    "$engine" stop >/dev/null 2>&1 || true
    "$engine" disable >/dev/null 2>&1 || true
    "$state/controller" stop
    restore_offload
    uci -q delete firewall.routewolf_sub_zone || true
    uci -q delete firewall.routewolf_sub_forward || true
    uci commit firewall
    fw4 reload
    rm -f "$monitor" "$engine"
    rm -rf "$state"
}

activate() {
    stage=$1
    [ ! -e "$state" ] && [ ! -e "$engine" ] && [ ! -e "$monitor" ] ||
        fail "A RouteWolf subscription is already installed."
    [ -z "$(uci changes firewall)" ] || fail "Save pending firewall changes before installing a subscription."
    for section in routewolf_sub_zone routewolf_sub_forward; do
        if uci -q get "firewall.$section" >/dev/null; then
            fail "RouteWolf subscription firewall section already exists."
        fi
    done
    for family in -4 -6; do
        if ip "$family" rule show | grep -Eq '^92:|fwmark 0x2000000(/0x2000000)? .*lookup'; then
            fail "Routing policy for RouteWolf subscription is in use."
        fi
    done
    if ip link show dev rwsub0 >/dev/null 2>&1 || nft list table inet routewolf_subscription >/dev/null 2>&1; then
        fail "RouteWolf subscription interface or nftables table is in use."
    fi

    mkdir -m 700 "$state"
    rollback=yes
    trap '[ "$rollback" = no ] || remove' EXIT
    cp "$stage"/controller "$state/controller"
    cp "$stage"/manage "$stage"/subscription "$stage"/config.json "$stage"/source "$stage"/mode "$stage"/token "$state/"
    chmod 700 "$state/controller" "$state/manage" "$state/subscription"
    cp "$here/engine.init" "$engine"
    cp "$here/monitor.init" "$monitor"
    chmod 755 "$engine" "$monitor"

    # Offloaded LAN packets bypass the prerouting hook and its health lease.
    for option in flow_offloading flow_offloading_hw; do
        value=$(uci -q get "firewall.@defaults[0].$option" || :)
        if [ "$value" = 1 ]; then
            printf '%s\n' "$value" > "$state/$option"
            uci set "firewall.@defaults[0].$option=0"
        fi
    done
    uci set firewall.routewolf_sub_zone=zone
    uci set firewall.routewolf_sub_zone.name=rwsub
    uci set firewall.routewolf_sub_zone.device=rwsub0
    uci set firewall.routewolf_sub_zone.input=REJECT
    uci set firewall.routewolf_sub_zone.output=ACCEPT
    uci set firewall.routewolf_sub_zone.forward=REJECT
    uci set firewall.routewolf_sub_forward=forwarding
    uci set firewall.routewolf_sub_forward.src=lan
    uci set firewall.routewolf_sub_forward.dest=rwsub
    fw4 check
    uci commit firewall
    fw4 reload
    "$engine" enable
    "$monitor" enable
    "$engine" start
    "$monitor" start
    rollback=no
}

case "${1:-}" in
    download) download "$2" ;;
    prepare) prepare "$2" "$3" ;;
    activate) activate "$2" ;;
    remove) remove ;;
    *) exit 2 ;;
esac
