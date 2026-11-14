#!/bin/sh
# Older rw commands forwarded the literal subcommand as the first argument.
[ "${1:-}" != update ] || shift
[ "$#" -gt 0 ] || set -- check
exec /usr/sbin/routewolf-stable-update.sh "$@"
