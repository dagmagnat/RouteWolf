#!/bin/sh
set -eu
umask 077
lib=/usr/libexec/routewolf-ui
cache=/tmp/routewolf-ui-nodes

source_id() {
    uci -q get "routewolf_ui.$1.source" | sha256sum | cut -d ' ' -f1
}

case "${1:-}" in
    list)
        case "$2" in ''|*[!a-zA-Z0-9_]*) exit 2 ;; esac
        [ "$(uci -q get "routewolf_ui.$2")" = profile ] || exit 2
        case "$(uci -q get "routewolf_ui.$2.protocol")" in vless|singbox) ;; *) exit 2 ;; esac
        uci -q get "routewolf_ui.$2.source" | grep -q '^https://' || exit 2
        if [ "$(uci -q get routewolf_ui.ui.active_profile || :)" = "$2" ] &&
            uci -q get "routewolf_ui.$2.source" | cmp -s - /etc/routewolf-subscription/source; then
            config=/etc/routewolf-subscription/config.json
        elif [ "$(uci -q get routewolf_ui.ui.backup_profile || :)" = "$2" ] &&
            uci -q get "routewolf_ui.$2.source" | cmp -s - /etc/routewolf-ui/backup-proxy/source; then
            config=/etc/routewolf-ui/backup-proxy/config.json
        else
            id=$(source_id "$2")
            if [ -s "$cache/$2" ] && [ "$(sed -n '1p' "$cache/$2")" = "$id" ]; then
                printf '{"nodes":'
                tail -n +2 "$cache/$2"
                printf '}\n'
                exit 0
            fi
            config=
        fi
        if [ -s "$config" ]; then
            printf '{"nodes":'
            ucode "$lib/nodes.uc" list "$config"
            printf '}\n'
        else
            printf '{"fetch":true}\n'
        fi
        ;;
    preview)
        mkdir -p "$cache"
        # Keep only the redacted list in RAM, indexed by profile and source.
        { source_id "$2"; ucode "$lib/nodes.uc" list "$3"; } > "$cache/$2.new"
        mv "$cache/$2.new" "$cache/$2"
        ;;
    apply)
        config=$2 profile=$3 engine=$4 role=$5
        [ -n "$profile" ] || exit 0
        id=$(uci -q get "routewolf_ui.$profile.preferred_node" || :)
        printf '%s\n' "$id" | grep -Eq '^[a-f0-9]{64}$' || exit 0
        ucode "$lib/nodes.uc" apply "$config" "$id" "$engine" "$role" "$config.preferred"
        if [ -s "$config.preferred" ]; then mv "$config.preferred" "$config"; fi
        ;;
    *) exit 2 ;;
esac
