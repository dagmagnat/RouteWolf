#!/bin/sh
set -eu
umask 077
cron=/etc/crontabs/root
state=/etc/routewolf-ui
prefix='# routewolf-ui-list-pause '

# Only known list-only jobs are marked. Legacy --auto also checks code and
# therefore must be left alone.
cron_lines() {
    awk -v mode="$1" -v prefix="$prefix" '
        function scheduled(line) {
            return line ~ /^[ \t]*[0-9*]/ &&
                (line ~ /\/usr\/sbin\/routewolf-update\.sh[ \t]+--lists-auto([ \t]|$)/ ||
                 line ~ /\/usr\/sbin\/routewolf-stable-update\.sh[ \t]+--lists-auto([ \t]|$)/ ||
                 line ~ /\/etc\/init\.d\/routewolf[ \t]+start([ \t]|$)/)
        }
        {
            if (scheduled($0)) active++
            if (index($0,prefix)==1) saved++
            if (mode=="disable" && scheduled($0)) print prefix $0
            else if (mode=="enable" && index($0,prefix)==1) print substr($0,length(prefix)+1)
            else if (mode=="enable" || mode=="disable") print
        }
        END { if (mode=="status") print (active?1:0), (active||saved?1:0) }
    ' "$2"
}

apply_schedule() (
    command=$1
    current=$(cron_lines status "$cron")
    [ "${current#* }" = 1 ] || exit 1
    mkdir -p "$state"
    temp=$(mktemp /etc/crontabs/.routewolf-ui.XXXXXX)
    trap 'rm -f "$temp"' EXIT
    cron_lines "$command" "$cron" > "$temp"
    if ! cmp -s "$temp" "$cron"; then
        chmod 600 "$temp"
        mv "$temp" "$cron"
        /etc/init.d/cron restart
    fi
    if [ "$command" = disable ]; then touch "$state/lists-paused"; else rm -f "$state/lists-paused"; fi
)

case "${1:-}" in
    status) if [ -f "$cron" ]; then cron_lines status "$cron"; else printf '%s\n' '0 0'; fi ;;
    enable|disable) apply_schedule "$1" ;;
    keep) [ ! -e "$state/lists-paused" ] || apply_schedule disable ;;
    render) cron_lines "$2" "$3" ;;
    *) exit 2 ;;
esac
