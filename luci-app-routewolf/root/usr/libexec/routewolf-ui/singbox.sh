#!/bin/sh
set -e
umask 077
lib=/usr/libexec/routewolf-ui
state=/etc/routewolf-ui
managed=/etc/routewolf-subscription
engine=/etc/init.d/routewolf-subscription-engine
monitor=/etc/init.d/routewolf-subscription
route=/etc/routewolf/route.conf
watchdog=/etc/routewolf/watchdog.conf
. "$lib/dependencies.sh"

fail() { printf '%s\n' "$*" >&2; exit 1; }

profile=$1
reserve=${2:-no}
reason invalid-profile
case "$profile" in ''|*[!a-zA-Z0-9_]*) fail 'Invalid profile ID.' ;; esac
[ "$(uci -q get "routewolf_ui.$profile")" = profile ] || fail 'Profile not found.'
[ -x /etc/init.d/routewolf ] || fail 'Install RouteWolf first.'
protocol=$(uci -q get "routewolf_ui.$profile.protocol")
mode=$(uci -q get "routewolf_ui.$profile.routing")
case "$mode" in full|routewolf|inverse|json) ;; *) fail 'Invalid routing mode.' ;; esac
if [ "$protocol" = vless ]; then
    [ "$mode" != json ] || fail 'Unsupported VLESS profile mode.'
fi
set -- --luci-profile
. "$lib/installer-functions.sh"
if ! require_proxy_ram; then
    reason insufficient-proxy-ram
    exit 1
fi
launch=$(uci -q get "routewolf_ui.$profile.launch" || echo boot)
case "$launch" in boot|manual) ;; *) fail 'Invalid launch mode.' ;; esac
for package in firewall network; do
    [ -z "$(uci changes "$package")" ] || fail 'Save or revert pending changes before activating a tunnel.'
done

stage=$(mktemp -d /tmp/routewolf-ui-sub.XXXXXX)
backup=$(mktemp -d /tmp/routewolf-ui-sub-backup.XXXXXX)
created=no
changed=no
native_changed=no
completed=no
was_active=no
was_enabled=no
managed_files='config.json source token mode controller subscription engine'
cleanup() {
    if [ "$completed" != yes ]; then
        if [ "$created" = yes ]; then
            "$managed/manage" remove >/dev/null 2>&1 || :
        elif [ "$changed" = yes ]; then
            "$monitor" stop || :
            "$engine" stop || :
            for file in $managed_files previous.json candidate.json; do
                if [ -e "$backup/$file" ]; then cp -p "$backup/$file" "$managed/$file"; else rm -f "$managed/$file"; fi
            done
            cp -p "$backup/engine.init" "$engine"
            if [ "$was_active" = yes ]; then
                "$engine" start || :
                "$monitor" start || :
                if [ "$was_enabled" = yes ]; then "$engine" enable || :; "$monitor" enable || :; fi
            else
                "$monitor" stop || :
                "$engine" stop || :
            fi
        fi
        if [ "$native_changed" = yes ]; then
            if [ -e "$backup/route.conf" ]; then cp "$backup/route.conf" "$route"; else rm -f "$route"; fi
            if [ -e "$backup/watchdog.conf" ]; then cp "$backup/watchdog.conf" "$watchdog"; else rm -f "$watchdog"; fi
            if [ -e "$backup/full-enabled" ]; then
                uci set firewall.routewolf_ui_full=include
                uci set firewall.routewolf_ui_full.type=nftables
                uci set firewall.routewolf_ui_full.position=table-post
                uci set "firewall.routewolf_ui_full.path=$state/full.nft"
                uci commit firewall
                fw4 reload >/dev/null 2>&1 || :
            fi
            /usr/sbin/routewolf-route.sh >/dev/null 2>&1 || :
        fi
    fi
    rm -rf "$stage" "$backup"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP
uci -q get "routewolf_ui.$profile.source" > "$stage/source"
[ "$(wc -c < "$stage/source")" -le 8192 ] || fail 'Subscription URL or access key is too long.'
if [ "$reserve" = preview ]; then
    case "$protocol" in vless|singbox) ;; *) exit 1 ;; esac
    phase download
    reason source-download
    grep -q '^https://' "$stage/source" || exit 1
    sh "$lib/subscription/install.sh" download "$stage" "$protocol"
    render=render
    [ "$protocol" != vless ] || render=render-xray
    [ "$mode" != inverse ] || mode=full
    reason subscription-format
    "$stage/subscription" "$render" "$stage/input" "$stage/token" "$mode" "$stage/config.json"
    "$lib/nodes.sh" preview "$profile" "$stage/config.json"
    exit
fi
if [ "$protocol" = vless ]; then
    case "$(cat "$stage/source")" in https://*|vless://*) ;; *) fail 'Expected a VLESS link or HTTPS subscription.' ;; esac
fi
prepare_package_index "$protocol"
reason package-install
if [ "$protocol" = vless ]; then
    missing=$(missing_components vless)
    if [ -n "$missing" ]; then pkg_install $missing; fi
else
    install_singbox_packages subscription
fi
[ -z "$(missing_components "$protocol")" ] || exit 1
phase download
reason source-download
case "$(cat "$stage/source")" in
    https://*)
        sh "$lib/subscription/install.sh" download "$stage" "$protocol"
        ;;
    ss://*)
        outline_parse_key "$(cat "$stage/source")" || fail 'Invalid Outline access key.'
        . /usr/share/libubox/jshn.sh
        json_init
        json_add_array outbounds
        json_add_object ''
        json_add_string type shadowsocks
        json_add_string tag proxy
        json_add_string server "$OUTLINE_SERVER"
        json_add_int server_port "$OUTLINE_PORT"
        json_add_string method "$OUTLINE_METHOD"
        json_add_string password "$OUTLINE_PASSWORD"
        json_close_object
        json_close_array
        json_dump > "$stage/input"
        sh "$lib/subscription/install.sh" helper "$stage" "$protocol"
        ;;
    vless://*|trojan://*|hysteria2://*|hy2://*)
        cp "$stage/source" "$stage/input"
        sh "$lib/subscription/install.sh" helper "$stage" "$protocol"
        ;;
    *) fail 'Invalid access key or HTTPS subscription.' ;;
esac
phase config
reason config-invalid
if sh "$lib/subscription/install.sh" prepare "$stage" "$mode" "$protocol"; then
    :
else
    result=$?
    case "$result" in
        3) reason subscription-format ;;
        4)
            if [ "$protocol" = vless ]; then reason xray-config; else reason engine-config; fi
            ;;
    esac
    exit "$result"
fi
phase start
reason tunnel-start
if [ "$reserve" = yes ]; then
    "$lib/backup-proxy.sh" install "$stage" "$profile"
    completed=yes
    exit 0
fi
if [ -n "$(uci -q get "routewolf_ui.$profile.preferred_node" || :)" ]; then
    "$lib/nodes.sh" apply "$stage/config.json" "$profile" "$(cat "$stage/engine")" primary
    if [ "$protocol" = vless ]; then
        reason xray-config
        xray run -test -c "$stage/config.json" >/dev/null 2>&1
    else
        reason engine-config
        sing-box check -c "$stage/config.json" >/dev/null 2>&1
    fi
fi
previous_native=
if [ -e "$route" ]; then
    cp "$route" "$backup/route.conf"
    previous_native=$(sed -n "s/^VPN_ROUTE_DEV='\([A-Za-z0-9_]*\)'$/\1/p" "$backup/route.conf" | head -n 1)
fi
if [ -e "$watchdog" ]; then cp "$watchdog" "$backup/watchdog.conf"; fi
if [ -f "$managed/mode" ]; then
    [ -e "$state/native-active" ] || was_active=yes
    "$monitor" enabled >/dev/null 2>&1 && was_enabled=yes
    for file in $managed_files previous.json candidate.json; do
        [ ! -e "$managed/$file" ] || cp -p "$managed/$file" "$backup/$file"
    done
    cp -p "$engine" "$backup/engine.init"
    changed=yes
    "$monitor" stop || :
    "$engine" stop || :
    rm -f "$managed/previous.json" "$managed/candidate.json"
    for file in $managed_files; do
        cp -p "$stage/$file" "$managed/$file.new"
        mv "$managed/$file.new" "$managed/$file"
    done
    cp -p "$lib/subscription/engine.init" "$engine.new"
    chmod 755 "$engine.new"
    mv "$engine.new" "$engine"
    "$engine" start
    "$monitor" start
else
    sh "$lib/subscription/install.sh" activate "$stage"
    created=yes
fi
ready=no
phase verify
reason tunnel-unreachable
for attempt in $(seq 1 30); do
    if [ "$("$managed/controller" status 2>/dev/null)" = 'Proxy available' ]; then
        ready=yes
        break
    fi
    sleep 1
done
[ "$ready" = yes ] || fail 'No healthy server in the subscription; previous tunnel retained.'
mkdir -p "$state" /etc/routewolf
native_changed=yes
if uci -q get firewall.routewolf_ui_full >/dev/null; then
    touch "$backup/full-enabled"
    uci -q delete firewall.routewolf_ui_full
    fw4 check
    uci commit firewall
    fw4 reload
fi
printf "VPN_ROUTE_DEV=''\n" > "$route.new" && mv "$route.new" "$route"
printf "WATCHDOG_TYPE='none'\n" > "$watchdog.new" && mv "$watchdog.new" "$watchdog"
ip -4 route del default table 99 >/dev/null 2>&1 || :
ip -6 route del default table 99 >/dev/null 2>&1 || :
if [ "$launch" = boot ]; then
    "$engine" enable
    "$monitor" enable
else
    "$engine" disable
    "$monitor" disable
fi
uci set "routewolf_ui.ui.active_profile=$profile"
    uci set "routewolf_ui.ui.preferred_profile=$profile"
uci set "routewolf_ui.ui.active_mode=$mode"
uci commit routewolf_ui
rm -f "$state/native-active"
completed=yes
"$lib/profiles.sh" retire "$previous_native" || logger -t routewolf-ui 'Could not retire the old native tunnel'
printf '%s\n' 'Subscription activated after successful HTTPS probe.'
