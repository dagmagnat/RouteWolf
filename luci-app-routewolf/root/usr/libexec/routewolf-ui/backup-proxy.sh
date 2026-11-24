#!/bin/sh
# A subscription/Outline reserve runs on its own TUN and loopback API.
set -eu
umask 077
dir=/etc/routewolf-ui/backup-proxy
service=/etc/init.d/routewolf-ui-backup-engine
api=http://127.0.0.1:19097
device=rwsubb0
backend() { if grep -qx xray "$1/engine" 2>/dev/null; then echo xray; else echo sing-box; fi; }

prepare_config() {
    if [ "$3" = xray ]; then
        sed -e '/^  "outbounds":/,$b' \
            -e 's/"name": "rwsub0"/"name": "rwsubb0"/' \
            -e 's/"port": 18683/"port": 18684/' \
            -e 's/198\.18\.79\.1\/30/198.18.80.1\/30/' \
            -e 's/fdfe:dcba:9876:79::1\/126/fdfe:dcba:9876:80::1\/126/' "$1" > "$2"
        grep -q '"name": "rwsubb0"' "$2" &&
            grep -q '"port": 18684' "$2" &&
            xray run -test -c "$2" >/dev/null 2>&1
        return
    fi
    sed -e 's/"interface_name": "rwsub0"/"interface_name": "rwsubb0"/' \
        -e 's/"external_controller": "127\.0\.0\.1:19095"/"external_controller": "127.0.0.1:19097"/' "$1" > "$2"
    grep -q '"interface_name": "rwsubb0"' "$2" &&
        grep -q '"external_controller": "127.0.0.1:19097"' "$2" &&
        sing-box check -c "$2" >/dev/null 2>&1
}

install() (
    source=$1 profile=$2
    [ -z "$(uci changes firewall)" ] || return 1
    mkdir -p /etc/routewolf-ui
    stage=$(mktemp -d /etc/routewolf-ui/.backup-proxy.XXXXXX)
    replaced=no
    changed=no
    committed=no
    cleanup() {
        if [ "$committed" != yes ]; then
            if [ "$changed" = yes ]; then
                uci -q revert firewall || :
                cp "$stage/firewall" /etc/config/firewall
                fw4 reload >/dev/null 2>&1 || :
            fi
            if [ "$replaced" = yes ]; then
                rm -rf "$dir"
                if [ -d "$stage/previous" ]; then mv "$stage/previous" "$dir"; fi
            fi
        fi
        rm -rf "$stage"
    }
    trap cleanup EXIT
    trap 'exit 1' INT HUP TERM
    mkdir "$stage/candidate"
    engine=$(backend "$source")
    prepare_config "$source/config.json" "$stage/candidate/config.json" "$engine" || return 1
    printf '%s\n' "$engine" > "$stage/candidate/engine"
    for file in token mode source subscription; do cp -p "$source/$file" "$stage/candidate/$file"; done
    cp /etc/config/firewall "$stage/firewall"
    changed=yes
    zone=routewolf_ui_rwsubb0
    forward=${zone}_lan
    uci set "firewall.$zone=zone"
    uci set "firewall.$zone.name=$device"
    uci -q delete "firewall.$zone.device" || :
    uci add_list "firewall.$zone.device=$device"
    for entry in input=REJECT output=ACCEPT forward=REJECT; do uci set "firewall.$zone.$entry"; done
    uci set "firewall.$forward=forwarding"
    uci set "firewall.$forward.src=lan"
    uci set "firewall.$forward.dest=$device"
    fw4 check
    uci commit firewall
    fw4 reload
    "$service" stop >/dev/null 2>&1 || :
    if [ -d "$dir" ]; then mv "$dir" "$stage/previous"; fi
    replaced=yes
    mv "$stage/candidate" "$dir"
    uci set "routewolf_ui.ui.backup_device=$device"
    uci set "routewolf_ui.ui.backup_profile=$profile"
    uci commit routewolf_ui
    committed=yes
)

request() {
    curl -fSs --noproxy '*' --max-time 4 --header "Authorization: Bearer $token" "$@"
}

health() (
    if [ "$(backend "$dir")" = xray ]; then
        exec sh /usr/libexec/routewolf-ui/subscription/controller.sh health-xray "$dir/token" 18684
    fi
    token=$(cat "$dir/token")
    printf '%s\n' "$token" | grep -Eq '^[0-9a-f]{48}$' || return 1
    groups=$(jsonfilter -i "$dir/config.json" -e "@.outbounds[@.type='selector'].tag")
    [ -n "$groups" ] || return 1
    checks=$(mktemp -d /tmp/routewolf-backup-probe.XXXXXX)
    trap 'rm -rf "$checks"' EXIT
    selected=no
    for group in $groups; do
        printf '%s\n' "$group" | grep -Eq '^rw-group-[0-9]+$' || return 1
        nodes=$(jsonfilter -i "$dir/config.json" -e "@.outbounds[@.tag='$group'].outbounds[*]")
        current=$(request "$api/proxies/$group" | jsonfilter -e '@.now') || return 1
        choice=rw-direct
        pending=
        # Check in batches so the slowest failed node won't delay a whole list.
        for node in $nodes; do
            case "$node" in rw-direct) continue ;; esac
            printf '%s\n' "$node" | grep -Eq '^rw-node-[0-9]+$' || return 1
            pending="$pending $node"
            set -- $pending
            if [ "$#" -ge 8 ]; then
                choice=$(check_nodes "$checks" "$@")
                [ "$choice" = rw-direct ] || break
                pending=
            fi
        done
        if [ "$choice" = rw-direct ] && [ -n "$pending" ]; then
            choice=$(check_nodes "$checks" $pending)
        fi
        if [ "$choice" != "$current" ]; then
            request --request PUT --header 'Content-Type: application/json' \
                --data "{\"name\":\"$choice\"}" "$api/proxies/$group" >/dev/null || return 1
        fi
        [ "$choice" = rw-direct ] || selected=yes
    done
    [ "$selected" = yes ]
)

check_nodes() {
    local tests=$1 node pids=
    shift
    for node; do
        request "$api/proxies/$node/delay?timeout=1800&url=https%3A%2F%2Fcp.cloudflare.com%2Fgenerate_204" > "$tests/$node" 2>/dev/null &
        pids="$pids $!"
    done
    for pid in $pids; do wait "$pid" || :; done
    for node; do
        if jsonfilter -i "$tests/$node" -e '@.delay' 2>/dev/null | grep -Eq '^[1-9][0-9]*$'; then
            printf '%s\n' "$node"
            return 0
        fi
    done
    echo rw-direct
}

refresh() (
    mode=$(cat "$dir/mode")
    [ "$mode" != inverse ] || mode=full
    grep -q '^https://' "$dir/source" || return 0
    stage=$(mktemp -d "$dir/.refresh.XXXXXX")
    trap 'rm -rf "$stage"' EXIT
    engine=$(backend "$dir")
    render=render
    [ "$engine" != xray ] || render=render-xray
    "$dir/subscription" fetch "$dir/source" > "$stage/input" &&
        "$dir/subscription" "$render" "$stage/input" "$dir/token" "$mode" "$stage/config.json" &&
        prepare_config "$stage/config.json" "$stage/backup.json" "$engine" || return 1
    cmp -s "$dir/config.json" "$stage/backup.json" && return 0
    [ ! -d /tmp/routewolf-ui-job/lock ] || return 1
    mv "$stage/backup.json" "$dir/config.json"
    if "$service" running; then "$service" restart; fi
)

case "${1:-}" in
    install) install "$2" "$3" ;;
    health) health ;;
    refresh) refresh ;;
    *) exit 2 ;;
esac
