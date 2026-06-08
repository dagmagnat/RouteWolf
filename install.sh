#!/bin/sh
# Convenience wrapper for GitHub users.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$DIR/getdomains-install.sh" "$@"
