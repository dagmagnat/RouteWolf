#!/bin/sh
# Run the canonical installed diagnostic instead of obsolete opkg-only checks.
if [ -x /usr/sbin/routewolf-diagnose.sh ]; then
    exec /usr/sbin/routewolf-diagnose.sh "$@"
fi
echo 'RouteWolf diagnostics are not installed. Install/update RouteWolf first, then run: rw diag' >&2
exit 1
