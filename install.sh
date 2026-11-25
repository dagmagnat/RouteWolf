#!/bin/sh
# Bootstrap RouteWolf on OpenWrt, or run from a local source archive.

REPO=dagmagnat/RouteWolf
BRANCH=${ROUTEWOLF_BRANCH:-main}
DIR=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd)

run_installer() {
    if [ -t 0 ]; then
        sh ./routewolf-install.sh "$@"
    elif ( : </dev/tty ) 2>/dev/null; then
        sh ./routewolf-install.sh "$@" </dev/tty
    else
        sh ./routewolf-install.sh "$@"
    fi
}

# A locally unpacked project does not need to contact GitHub for its archive.
if [ "${0##*/}" = install.sh ] && [ -f "$DIR/routewolf-install.sh" ]; then
    cd "$DIR" || exit 1
    run_installer "$@"
    exit $?
fi

archive_tar() {
    if command -v tar >/dev/null 2>&1; then tar "$@"; else busybox tar "$@"; fi
}

archive_complete() {
    [ -s "$archive" ] || return 1
    # Some fetchers leave a nonempty file when the connection closes early.
    # Read through the gzip trailer as tar can stop at the end of its own stream.
    if command -v gzip >/dev/null 2>&1; then
        gzip -t "$archive" >/dev/null 2>&1 || return 1
    fi
    archive_tar -tzf "$archive" >/dev/null 2>&1
}

try_archive() {
    rm -f "$archive"
    if "$@" && archive_complete; then return 0; fi
    echo 'RouteWolf: download failed or archive is incomplete; trying another download.' >&2
    rm -f "$archive"
    return 1
}

fetch_archive() {
    local url="$1" native wget_path
    native=$(command -v uclient-fetch 2>/dev/null)
    [ ! -x /bin/uclient-fetch ] || native=/bin/uclient-fetch
    if [ -n "$native" ] && try_archive "$native" -T 25 -O "$archive" "$url"; then return 0; fi
    if command -v curl >/dev/null 2>&1 &&
        try_archive curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 10 --max-time 90 -o "$archive" "$url"; then
        return 0
    fi
    wget_path=$(command -v wget 2>/dev/null)
    if [ -n "$wget_path" ] && { [ -z "$native" ] || [ ! "$wget_path" -ef "$native" ]; }; then
        try_archive "$wget_path" -T 25 -O "$archive" "$url" && return 0
    fi
    return 1
}

work=$(mktemp -d /tmp/routewolf-install.XXXXXX) || exit 1
trap 'cd /; rm -rf "$work"' EXIT
trap 'exit 1' HUP INT TERM
archive="$work/routewolf.tar.gz"

echo "RouteWolf: downloading ${REPO}@${BRANCH}..."
if ! fetch_archive "https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}" &&
   ! fetch_archive "https://api.github.com/repos/${REPO}/tarball/${BRANCH}"; then
    echo 'Error: GitHub did not deliver a complete RouteWolf archive over HTTPS.' >&2
    echo 'Download and extract the archive on a computer, copy the directory to OpenWrt, and run sh ./install.sh there.' >&2
    exit 1
fi

mkdir "$work/source" || exit 1
if ! archive_tar -xzf "$archive" -C "$work/source"; then
    echo 'Error: could not extract the verified RouteWolf archive. Check available space in /tmp.' >&2
    exit 1
fi
rm -f "$archive"

# GitHub's API and codeload use different names for the top-level directory.
source_dir=
for candidate in "$work/source/"*; do
    [ -d "$candidate" ] && [ -f "$candidate/routewolf-install.sh" ] || continue
    if [ -n "$source_dir" ]; then
        echo 'Error: more than one RouteWolf source directory in archive.' >&2
        exit 1
    fi
    source_dir="$candidate"
done
if [ -z "$source_dir" ]; then
    echo 'Error: RouteWolf installer is missing from the downloaded archive.' >&2
    exit 1
fi

# This installer uses the panel source. Release bundles are used by update.sh.
rm -f "$source_dir"/releases/routewolf-luci-*.tar.gz || exit 1

cd "$source_dir" || exit 1
run_installer "$@"
