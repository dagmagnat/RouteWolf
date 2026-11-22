#!/bin/sh
# Stable runtime releases only: no package installation, network reconfiguration or remote installer.
set -u
umask 077
BASE=https://github.com/dagmagnat/RouteWolf/releases
STATE=/etc/routewolf
LOCK=/tmp/routewolf-code-update.lock
WORK=/tmp/routewolf-code-update.$$
MODE=${1:---auto}
BACKUP=$STATE/rollback/runtime.tgz
FILES='etc/init.d/routewolf
etc/init.d/routewolf-watchdog
etc/init.d/routewolf-route
etc/init.d/getdomains
etc/init.d/vpnroute
etc/hotplug.d/iface/30-routewolf-route
etc/hotplug.d/net/30-routewolf-route
usr/sbin/rw
usr/sbin/rwrt
usr/sbin/row
usr/sbin/routewolf-watchdog.sh
usr/sbin/routewolf-awg-watchdog.sh
usr/sbin/routewolf-route.sh
usr/sbin/routewolf-status.sh
usr/sbin/routewolf-diagnose.sh
usr/sbin/routewolf-fetch.sh
usr/sbin/routewolf-purge.sh
usr/sbin/routewolf-youtube.sh
usr/sbin/routewolf-uninstall.sh
usr/sbin/routewolf-diagnose-update.sh
usr/sbin/routewolf-load.sh
usr/sbin/domain-routing-route.sh
usr/sbin/domain-routing-status.sh
usr/sbin/routing-openwrt-diagnose.sh
usr/sbin/routing-openwrt-load.sh
usr/sbin/routewolf-apply.sh
usr/sbin/routewolf-healthcheck.sh
usr/sbin/routewolf-reliability.sh
usr/sbin/routewolf-stable-update.sh
usr/sbin/routewolf-update.sh'
log() { printf '[RouteWolf] %s\n' "$*"; logger -t RouteWolf-update -- "$*" 2>/dev/null || true; }
status() {
    printf 'Installed stable runtime: '; cat "$STATE/runtime_version" 2>/dev/null || echo legacy
    printf 'Automatic code updates: '; [ "$(sed -n 's/^AUTO_CODE_UPDATES=//p' "$STATE/update.conf" 2>/dev/null)" = 0 ] && echo off || echo on
    [ ! -f /tmp/routewolf-update-status ] || cat /tmp/routewolf-update-status
    [ ! -f /tmp/routewolf-lists-status ] || cat /tmp/routewolf-lists-status
    printf 'Nightly schedule: lists 02:00, code releases 03:00 (%s)\n' "$(date '+%Z %z')"
    [ ! -f "$STATE/failed-runtime" ] || { printf 'Blocked failed release: '; cat "$STATE/failed-runtime"; }
}
refresh_lists() {
    [ ! -x /etc/init.d/routewolf ] || /etc/init.d/routewolf start
}
fetch() {
    url=$1; dest=$2; limit=${3:-1048576}
    case "$url" in https://github.com/dagmagnat/RouteWolf/releases/*) ;; *) return 1 ;; esac
    rm -f "$dest"
    # Never execute code fetched with certificate verification disabled.
    if command -v curl >/dev/null 2>&1; then
        (ulimit -f "$(((limit + 511) / 512))"; exec curl -fsSL --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 75 --retry 1 --max-filesize "$limit" "$url" -o "$dest") && [ -s "$dest" ] && [ "$(wc -c <"$dest")" -le "$limit" ] && return 0
        rm -f "$dest"
    fi
    if [ -x /bin/uclient-fetch ]; then
        (ulimit -f "$(((limit + 511) / 512))"; exec /bin/uclient-fetch -T 30 -O "$dest" "$url") >/dev/null 2>&1 && [ -s "$dest" ] && [ "$(wc -c <"$dest")" -le "$limit" ] && return 0
        rm -f "$dest"
    fi
    return 1
}
field() { sed -n "s/^$1=//p" "$WORK/release.manifest"; }
record() {
    target=/tmp/routewolf-update-status
    [ "$MODE" != --lists-auto ] || target=/tmp/routewolf-lists-status
    printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >"$target"
}
resources_ok() {
    avail=$(df -Pk /overlay 2>/dev/null | awk 'NR==2{print $4}')
    case "$avail" in ''|*[!0-9]*) return 1 ;; esac
    [ "$avail" -ge 2048 ] || { log 'less than 2 MiB free flash; current version retained'; return 1; }
    memory=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
    case "$memory" in ''|*[!0-9]*) return 1 ;; esac
    [ "$memory" -ge 8192 ] || { log 'less than 8 MiB available RAM; current version retained'; return 1; }
}
make_snapshot() {
    mkdir -p "$WORK/snapshot" "$STATE/rollback" || return 1
    : >"$WORK/snapshot/files"
    echo 56 >"$WORK/snapshot/format"
    for path in $FILES etc/config/firewall etc/crontabs/root etc/routewolf/installed_version etc/routewolf/runtime_version; do
        if [ -f "/$path" ] && [ ! -L "/$path" ]; then
            mkdir -p "$WORK/snapshot/$(dirname "$path")" || return 1
            cp -p "/$path" "$WORK/snapshot/$path" || return 1
            echo "$path" >>"$WORK/snapshot/files"
        elif [ -e "/$path" ] || [ -L "/$path" ]; then
            log "unsupported symlink or non-file: $path"; return 1
        fi
    done
    tar -czf "$WORK/runtime.tgz" -C "$WORK/snapshot" . || return 1
    tar -tzf "$WORK/runtime.tgz" >/dev/null 2>&1 || return 1
    cp "$WORK/runtime.tgz" "$STATE/rollback/runtime.tgz.new" || return 1
    sha256sum "$STATE/rollback/runtime.tgz.new" | awk '{print $1}' >"$STATE/rollback/runtime.sha256.new" || return 1
    mv "$STATE/rollback/runtime.tgz.new" "$BACKUP" && mv "$STATE/rollback/runtime.sha256.new" "$STATE/rollback/runtime.sha256"
}
restore_snapshot() {
    [ -f "$BACKUP" ] || { log 'no rollback snapshot'; return 1; }
    # v55 backups predate the checksum sidecar; gzip CRC still verifies those.
    format=$(tar -xzOf "$BACKUP" ./format 2>/dev/null || true)
    if [ "$format" = 56 ]; then
        expected=$(cat "$STATE/rollback/runtime.sha256" 2>/dev/null || true)
        [ "${#expected}" = 64 ] && [ "$(sha256sum "$BACKUP" | awk '{print $1}')" = "$expected" ] || return 1
    fi
    mkdir -p "$WORK/restore" || return 1
    tar -xzf "$BACKUP" -C "$WORK/restore" || return 1
    for path in $FILES etc/config/firewall etc/crontabs/root etc/routewolf/installed_version etc/routewolf/runtime_version; do
        if grep -Fx "$path" "$WORK/restore/files" >/dev/null 2>&1; then
            mkdir -p "/$(dirname "$path")" || return 1
            cp -p "$WORK/restore/$path" "/$path.rw-restore.$$" && mv "/$path.rw-restore.$$" "/$path" || return 1
        else
            rm -f "/$path"
        fi
    done
    # Delete-and-recreate type changes in a single transaction; never stop the firewall.
    fw4 print 2>/dev/null >"$WORK/restore.nft" || return 1
    { nft list table inet fw4 >/dev/null 2>&1 && echo 'delete table inet fw4'; cat "$WORK/restore.nft"; } >"$WORK/restore-full.nft"
    nft -c -f "$WORK/restore-full.nft" && nft -f "$WORK/restore-full.nft" || return 1
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || return 1
    /etc/init.d/cron restart >/dev/null 2>&1 || true
    return 0
}
configure_cron() {
    mkdir -p /etc/crontabs || return 1
    # Preserve all unrelated jobs, old tunnel watchdog and the operator's other settings.
    sed '/routewolf-update.sh.*--auto/d; /routewolf-update.sh.*--lists-auto/d; /routewolf-update.sh.*--code-auto/d; /routewolf-reliability.sh.*check/d' /etc/crontabs/root >"$WORK/cron.new" 2>/dev/null || : >"$WORK/cron.new"
    echo '0 2 * * * /usr/sbin/routewolf-update.sh --lists-auto >/tmp/routewolf-lists-update.log 2>&1' >>"$WORK/cron.new"
    echo '0 3 * * * /usr/sbin/routewolf-update.sh --code-auto >/tmp/routewolf-code-update.log 2>&1' >>"$WORK/cron.new"
    echo '*/5 * * * * /usr/sbin/routewolf-reliability.sh check >/tmp/routewolf-domain-health.log 2>&1' >>"$WORK/cron.new"
    if ! cmp -s "$WORK/cron.new" /etc/crontabs/root; then
        cp "$WORK/cron.new" /etc/crontabs/root || return 1
        /etc/init.d/cron restart >/dev/null 2>&1 || return 1
    fi
}
validate_bundle() {
    [ "$(field format)" = 1 ] || return 1
    version=$(field version); name=$(field name); archive=$(field archive); digest=$(field archive_sha256)
    case "$version" in ''|*[!0-9]*) return 1 ;; esac
    [ "${#version}" -le 6 ] && [ "$version" -ge 55 ] || return 1
    case "$name" in *[!a-zA-Z0-9._-]*|'') return 1 ;; esac
    case "$name" in v[0-9]*) ;; *) return 1 ;; esac
    [ "$archive" = "routewolf-v$version.tar.gz" ] || return 1
    [ "${#digest}" = 64 ] || return 1
    case "$digest" in *[!a-f0-9]*) return 1 ;; esac
    [ "$(sha256sum "$WORK/runtime.tgz" | awk '{print $1}')" = "$digest" ] || return 1
    [ "$(wc -c <"$WORK/runtime.tgz")" -le 1048576 ] || return 1
    tar -tzf "$WORK/runtime.tgz" >"$WORK/archive.files" || return 1
    printf '%s\n' "$FILES" | sed 's|^|payload/|' | sort >"$WORK/expected.files"
    sort "$WORK/archive.files" >"$WORK/actual.files"
    cmp -s "$WORK/expected.files" "$WORK/actual.files" || return 1
    # Reject links, devices and other non-regular entries BEFORE extraction.
    tar -tvzf "$WORK/runtime.tgz" | awk 'substr($0,1,1)!="-" || $3 !~ /^[0-9]+$/ || $3>524288{bad=1} {total+=$3} END{exit(bad||total>1048576)}' || return 1
    mkdir -p "$WORK/extract" || return 1
    tar -xzf "$WORK/runtime.tgz" -C "$WORK/extract" || return 1
    for path in $FILES; do
        [ -f "$WORK/extract/payload/$path" ] && [ ! -L "$WORK/extract/payload/$path" ] || return 1
        sh -n "$WORK/extract/payload/$path" || return 1
    done
}
local_health() {
    fw4 check >"$WORK/fw-check.log" 2>&1 || return 1
    /usr/sbin/routewolf-reliability.sh repair || return 1
    pidof dnsmasq >/dev/null 2>&1 || return 1
    ip route show default >"$WORK/default.after"
    cmp -s "$WORK/default.before" "$WORK/default.after" || return 1
    [ "$(sha256sum /etc/config/network | awk '{print $1}')" = "$network_hash" ] || return 1
}
apply_release() {
    installed=$(cat "$STATE/runtime_version" 2>/dev/null || echo 0)
    case "$installed" in ''|*[!0-9]*) installed=0 ;; esac
    [ "$version" -ge "$installed" ] || { log 'runtime downgrade refused'; return 1; }
    # No pending UI edits, unsupported filesystems or unbounded unpack on tiny routers.
    [ -z "$(uci changes firewall 2>/dev/null)" ] || { log 'pending firewall edits; update deferred'; return 1; }
    for busy in /tmp/routewolf-domain-health.lock/pid /tmp/routewolf-lists.lock/pid; do
        owner=$(cat "$busy" 2>/dev/null || true)
        case "$owner" in ''|*[!0-9]*) continue ;; esac
        kill -0 "$owner" 2>/dev/null && { log 'health/list job active; update deferred'; return 1; }
    done
    resources_ok || return 1
    ip route show default >"$WORK/default.before"
    network_hash=$(sha256sum /etc/config/network | awk '{print $1}')
    make_snapshot || return 1
    printf '%s\n' "$version" >"$STATE/pending-runtime" || return 1
    applying=1
    for path in $FILES; do
        mkdir -p "/$(dirname "$path")" || return 1
        cp "$WORK/extract/payload/$path" "/$path.rw-new.$$" && chmod 755 "/$path.rw-new.$$" && mv "/$path.rw-new.$$" "/$path" || return 1
    done
    # Existing interval sets must migrate before fw4 validates the new configuration.
    /usr/sbin/routewolf-reliability.sh repair || return 1
    local_health || return 1
    # Explicit upgrades preserve the existing cron, including list-only and
    # custom weekly schedules. Fresh provisioning still initializes it.
    if [ "$MODE" = --local ]; then
        configure_cron || return 1
    fi
    printf '%s\n' "$version" >"$STATE/runtime_version" || return 1
    printf '%s\n' "$name" >"$STATE/installed_version" || return 1
    rm -f "$STATE/failed-runtime"
    rm -f "$STATE/pending-runtime"
    applying=0
    record "updated runtime to $name; local health passed"
    log "runtime updated to $name; tunnel keys and network configuration preserved"
}
finish() {
    rc=$?
    trap - EXIT HUP INT TERM
    if [ "${applying:-0}" = 1 ]; then
        log 'runtime update failed; restoring previous snapshot'
        if restore_snapshot; then
            record 'update failed; previous runtime restored'
            rm -f "$STATE/pending-runtime"
        else
            record 'ERROR: update and rollback failed; pending recovery marker retained'
        fi
        printf '%s\n' "${version:-unknown}" >"$STATE/failed-runtime"
        rc=1
    fi
    rm -rf "$WORK"
    rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null || true
    exit "$rc"
}
case "$MODE" in
    status) status; exit 0 ;;
    on|off) mkdir -p "$STATE"; value=1; [ "$MODE" = off ] && value=0; printf 'AUTO_CODE_UPDATES=%s\n' "$value" >"$STATE/update.conf"; status; exit 0 ;;
    --release)
        requested=${2:-}
        case "$requested" in ''|0*|*[!0-9]*) exit 2 ;; esac
        [ "${#requested}" -le 6 ] && [ "$requested" -ge 60 ] || exit 2
        ;;
    --auto|--lists-auto|--code-auto|check|--local|rollback|recover) ;;
    *) echo 'Usage: routewolf-stable-update.sh --lists-auto|--code-auto|--auto|check|status|on|off|rollback|recover|--release VERSION|--local ARCHIVE MANIFEST' >&2; exit 2 ;;
esac
command -v sha256sum >/dev/null 2>&1 || { log 'sha256sum unavailable; update skipped'; exit 1; }
for required in uci nft fw4 tar; do
    command -v "$required" >/dev/null 2>&1 || { log "required feature unavailable: $required; code retained"; refresh_lists; exit 1; }
done
mkdir -p "$STATE"
if ! mkdir "$LOCK" 2>/dev/null; then
    owner=$(cat "$LOCK/pid" 2>/dev/null || true)
    case "$owner" in ''|*[!0-9]*) log 'update lock busy; retry later'; exit 75 ;; esac
    kill -0 "$owner" 2>/dev/null && exit 75
    rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null || exit 75
    mkdir "$LOCK" 2>/dev/null || exit 75
fi
echo $$ >"$LOCK/pid"
mkdir -p "$WORK" || exit 1
applying=0
trap finish EXIT
trap 'exit 1' HUP INT TERM
if [ -f "$STATE/pending-runtime" ]; then
    interrupted=$(cat "$STATE/pending-runtime")
    restore_snapshot || { record 'ERROR: interrupted update could not be restored'; exit 1; }
    printf '%s\n' "$interrupted" >"$STATE/failed-runtime"
    rm -f "$STATE/pending-runtime"
    record 'interrupted update restored; release blocked until manual retry'
    exit 0
fi
if [ "$MODE" = recover ]; then exit 0; fi
if [ "$MODE" = rollback ]; then
    failed=$(cat "$STATE/runtime_version" 2>/dev/null || true)
    restore_snapshot || exit 1
    printf '%s\n' "$failed" >"$STATE/failed-runtime"
    record 'manual rollback complete; reverted release blocked from automatic retry'
    exit 0
fi
if [ "$MODE" = --lists-auto ]; then
    refresh_lists || { record 'list refresh failed; existing cache retained'; exit 1; }
    record 'list check complete'; exit 0
fi
if { [ "$MODE" != --auto ] && [ "$MODE" != --code-auto ]; } || [ "$(sed -n 's/^AUTO_CODE_UPDATES=//p' "$STATE/update.conf" 2>/dev/null)" != 0 ]; then
    resources_ok || exit 1
    if [ "$MODE" = --local ]; then
        cp "$2" "$WORK/runtime.tgz" && cp "$3" "$WORK/release.manifest" || exit 1
    else
        manifest_url="$BASE/latest/download/stable.manifest"
        [ "$MODE" != --release ] || manifest_url="$BASE/download/v$requested/stable.manifest"
        if ! fetch "$manifest_url" "$WORK/release.manifest" 4096; then
            record 'stable manifest unavailable or TLS verification failed; existing code retained'
            case "$MODE" in --code-auto|--release) ;; *) refresh_lists || true ;; esac
            exit 1
        fi
        # No shell evaluation of downloaded manifest fields.
        version=$(field version)
        case "$version" in ''|*[!0-9]*) log 'invalid release manifest'; exit 1 ;; esac
        [ "${#version}" -le 6 ] || exit 1
        current=$(cat "$STATE/runtime_version" 2>/dev/null || echo 0)
        case "$current" in ''|*[!0-9]*) current=0 ;; esac
        if [ "$MODE" = --release ]; then
            [ "$version" = "$requested" ] || { log 'release manifest version mismatch'; exit 1; }
            [ "$version" -ge "$current" ] || { log 'runtime downgrade refused'; exit 1; }
        fi
        blocked=$(cat "$STATE/failed-runtime" 2>/dev/null || true)
        if [ "$version" -gt "$current" ] && { [ "$version" != "$blocked" ] || [ "$MODE" = check ] || [ "$MODE" = --release ]; }; then
            fetch "$BASE/download/v$version/routewolf-v$version.tar.gz" "$WORK/runtime.tgz" || { record 'runtime download failed; existing code retained'; exit 1; }
        fi
    fi
    if [ -f "$WORK/runtime.tgz" ]; then
        validate_bundle || { record 'release verification failed; existing code retained'; exit 1; }
        apply_release || exit 1
    fi
fi
case "$MODE" in --code-auto|--release) record 'release check complete'; exit 0 ;; esac
# Lists remain independent of code version and use their own transaction/cache.
if [ -x /usr/sbin/routewolf-reliability.sh ]; then /usr/sbin/routewolf-reliability.sh check || exit 1; fi
refresh_lists || { record 'list refresh failed; previous lists retained where possible'; exit 1; }
record 'runtime/list check complete'
