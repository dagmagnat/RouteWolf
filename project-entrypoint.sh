#!/bin/sh
# Keep old aliases and scheduled commands working with the same runtime.
[ "${1:-}" != update ] || shift
case "${1:-}" in
    ''|check|--luci|--console|--version)
        exec sh /usr/libexec/routewolf/project-update.sh "$@" ;;
    --code-auto)
        if [ -f /usr/share/luci/menu.d/luci-app-routewolf.json ] &&
            ! grep -qx 'AUTO_CODE_UPDATES=0' /etc/routewolf/update.conf 2>/dev/null; then
            exec sh /usr/libexec/routewolf/project-update.sh --luci
        fi
        ;;
esac
exec /usr/sbin/routewolf-stable-update.sh "$@"
