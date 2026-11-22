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
mode=$(uci -q get "routewolf_ui.$profile.routing")
case "$mode" in full|routewolf|json) ;; *) fail 'Invalid routing mode.' ;; esac
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
cleanup() {
    if [ "$completed" != yes ]; then
        if [ "$created" = yes ]; then
            "$managed/manage" remove >/dev/null 2>&1 || :
        elif [ "$changed" = yes ]; then
            for file in config.json source token mode controller; do cp "$backup/$file" "$managed/$file"; done
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
set -- --luci-profile
. "$lib/installer-functions.sh"
prepare_package_index singbox
reason package-install
install_singbox_packages subscription
[ -z "$(missing_components singbox)" ] || exit 1
phase download
reason source-download
case "$(cat "$stage/source")" in
    https://*)
        sh "$lib/subscription/install.sh" download "$stage"
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
        sh "$lib/subscription/install.sh" helper "$stage"
        ;;
    vless://*|trojan://*|hysteria2://*|hy2://*)
        cp "$stage/source" "$stage/input"
        sh "$lib/subscription/install.sh" helper "$stage"
        ;;
    *) fail 'Invalid access key or HTTPS subscription.' ;;
esac
phase config
reason config-invalid
if sh "$lib/subscription/install.sh" prepare "$stage" "$mode"; then
    :
else
    result=$?
    case "$result" in
        3) reason subscription-format ;;
        4) reason engine-config ;;
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
if [ -e "$route" ]; then cp "$route" "$backup/route.conf"; fi
if [ -e "$watchdog" ]; then cp "$watchdog" "$backup/watchdog.conf"; fi
if [ -f "$managed/mode" ]; then
    for file in config.json source token mode controller; do cp -p "$managed/$file" "$backup/$file"; done
    [ -e "$state/native-active" ] || was_active=yes
    "$monitor" enabled >/dev/null 2>&1 && was_enabled=yes
    changed=yes
    "$monitor" stop || :
    "$engine" stop || :
    for file in config.json source token mode; do
        cp "$stage/$file" "$managed/$file.new"
        mv "$managed/$file.new" "$managed/$file"
    done
    cp "$stage/controller" "$managed/controller.new"
    chmod 700 "$managed/controller.new"
    mv "$managed/controller.new" "$managed/controller"
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
uci set "routewolf_ui.ui.active_mode=$mode"
uci commit routewolf_ui
rm -f "$state/native-active"
completed=yes
printf '%s\n' 'Subscription activated after successful HTTPS probe.'
