#!/bin/sh

subscription_interval() {
    local minutes
    minutes=$(uci -q get routewolf_ui.ui.subscription_refresh_minutes) || minutes=60
    case "$minutes" in
        0) echo 0; return ;;
        ''|0*|*[!0-9]*|?????*) minutes=60 ;;
    esac
    if [ "$minutes" -lt 5 ] || [ "$minutes" -gt 1440 ]; then minutes=60; fi
    echo "$((minutes*60))"
}

subscription_refresh_due() {
    local interval
    [ ! -f "$3" ] || return 0
    interval=$(subscription_interval)
    [ "$interval" -gt 0 ] && { [ "$2" -lt 0 ] || [ "$(($1-$2))" -ge "$interval" ]; }
}
