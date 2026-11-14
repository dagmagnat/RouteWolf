#!/bin/sh
# Check actual nft writes, not just interface UP or an HTTPS response from the router.
set -u
STATE=/etc/routewolf
LOCK=/tmp/routewolf-domain-health.lock
WORK=/tmp/routewolf-domain-health.$$
MODE=${1:-check}
log() { logger -t RouteWolf-health -- "$*" 2>/dev/null || printf '%s\n' "$*"; }
cleanup() { rm -rf "$WORK"; rmdir "$LOCK" 2>/dev/null || true; }

probe() {
    family=$1; name=$2
    case "$family" in 4) test_ip=192.0.2.254 ;; 6) test_ip=2001:db8::ffff ;; *) return 1 ;; esac
    # Never delete an address that was present before our probe.
    if nft get element inet fw4 "$name" "{ $test_ip }" >/dev/null 2>&1; then
        case "$family" in 4) test_ip=192.0.2.253 ;; 6) test_ip=2001:db8::fffe ;; esac
        nft get element inet fw4 "$name" "{ $test_ip }" >/dev/null 2>&1 && return 1
    fi
    nft add element inet fw4 "$name" "{ $test_ip }" >"$WORK/probe.log" 2>&1 || return 1
    nft get element inet fw4 "$name" "{ $test_ip }" >/dev/null 2>&1 || return 1
    nft delete element inet fw4 "$name" "{ $test_ip }" >/dev/null 2>&1
}

save_elements() {
    # Old interval sets can contain merged hosts. Preserve them when converting.
    # Bound expansion; an unexpectedly large range requires manual inspection.
    family=$1; name=$2
    nft list set inet fw4 "$name" >"$WORK/$name.old" 2>/dev/null || return 1
    awk -v family="$family" '
        function number(s,a){split(s,a,".");return ((a[1]*256+a[2])*256+a[3])*256+a[4]}
        function address(n,a,b,c,d){d=n%256;n=int(n/256);c=n%256;n=int(n/256);b=n%256;a=int(n/256);return a"."b"."c"."d}
        /elements[[:space:]]*=/ { active=1; sub(/^.*elements[[:space:]]*=[[:space:]]*\{/, "") }
        active {
            done=($0 ~ /}/); sub(/}.*/, ""); gsub(/,/, " ")
            for(i=1;i<=NF;i++) {
                t=$i
                if(family==4 && t ~ /^[0-9.]+(-[0-9.]+|\/[0-9]+)?$/) {
                    n=split(t,r,"-"); start=number(r[1]); finish=start
                    if(n==2) finish=number(r[2])
                    else if(index(t,"/")){split(t,r,"/");start=number(r[1]);bits=r[2]+0;if(bits<18||bits>32)exit 1;span=2^(32-bits);start=int(start/span)*span;finish=start+span-1}
                    if(finish<start||finish-start>16384||count+finish-start+1>16384)exit 1
                    for(j=start;j<=finish;j++){print address(j);count++}
                } else if(family==6 && t ~ /^[0-9a-fA-F:]+$/ && index(t,":")) {print t;count++;if(count>16384)exit 1}
                else if(t!="") exit 1
            }
            if(done)active=0
        }
    ' "$WORK/$name.old" >"$WORK/$name.addresses"
}

repair_set() {
    family=$1; name=$2; section=$3
    [ "$MODE" != status ] || return 1
    # Do not commit somebody else's pending LuCI changes.
    [ -z "$(uci changes firewall 2>/dev/null)" ] || { log 'firewall has pending changes; repair deferred'; return 1; }
    save_elements "$family" "$name" || { log "$name: cannot safely preserve old addresses"; return 1; }
    nft -a list table inet fw4 >"$WORK/table.old" 2>/dev/null || return 1
    # Preserve every existing rule and its interface, mark, comment and counter.
    # Refuse unknown references, verdict maps, or unexpected chains.
    awk -v name="$name" '
        /^[[:space:]]*chain / {chain=$2}
        index($0,"@"name" ") || index($0,"@"name"\t") {
            if(chain!="mangle_prerouting" || $0 !~ /meta mark set/ || $0 !~ /# handle [0-9]+$/)exit 1
            handle=$NF; rule=$0;sub(/^[[:space:]]*/,"",rule);sub(/[[:space:]]*# handle [0-9]+$/, "",rule)
            print "delete rule inet fw4 "chain" handle "handle > del
            print "add rule inet fw4 "chain" "rule > add
            count++
        }
        END {if(!count)exit 1}
    ' del="$WORK/delete.rules" add="$WORK/add.rules" "$WORK/table.old" || return 1
    type=ipv4_addr; [ "$family" = 6 ] && type=ipv6_addr
    {
        cat "$WORK/delete.rules"
        echo "delete set inet fw4 $name"
        echo "add set inet fw4 $name { type $type; }"
        if [ -s "$WORK/$name.addresses" ]; then
            printf 'add element inet fw4 %s { ' "$name"
            awk 'NR>1{printf ", "}{printf "%s",$0}END{print " }"}' "$WORK/$name.addresses"
        fi
        cat "$WORK/add.rules"
    } >"$WORK/repair.nft"
    nft -c -f "$WORK/repair.nft" >"$WORK/check.log" 2>&1 || return 1
    nft -f "$WORK/repair.nft" >"$WORK/apply.log" 2>&1 || return 1
    probe "$family" "$name" || return 1
    old_match=$(uci -q get "firewall.$section.match")
    if [ "$old_match" != dst_ip ]; then
        uci set "firewall.$section.match=dst_ip" && uci commit firewall || return 1
    fi
    changed=1
    log "$name: replaced dynamic interval set with host-address set; preserved cached addresses"
}

run() {
    command -v nft >/dev/null 2>&1 && command -v uci >/dev/null 2>&1 || return 1
    changed=0
    for name in vpn_domains vpn_domains6; do
        section=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.\([^.=]*\)\.name='$name'$/\1/p")
        [ -n "$section" ] || continue
        # A duplicate section must be fixed explicitly; do not guess which one to overwrite.
        case "$section" in *'
'*) return 1 ;; esac
        family=4; [ "$name" = vpn_domains6 ] && family=6
        nft -t list set inet fw4 "$name" >"$WORK/definition" 2>/dev/null || { log "$name: missing; firewall repair required"; return 1; }
        if grep -q 'flags interval' "$WORK/definition" || ! probe "$family" "$name"; then
            sleep 1
            if grep -q 'flags interval' "$WORK/definition" || ! probe "$family" "$name"; then
                repair_set "$family" "$name" "$section" || { log "$name: repair failed; previous firewall rules retained where possible"; return 1; }
            fi
        fi
    done
    if [ "$changed" = 1 ]; then
        /etc/init.d/dnsmasq restart >"$WORK/dns-restart.log" 2>&1 || return 1
    fi
    return 0
}

case "$MODE" in check|repair|status) ;; *) echo 'Usage: routewolf-reliability.sh check|repair|status' >&2; exit 2 ;; esac
if [ "$MODE" != repair ] && [ -f /tmp/routewolf-code-update.lock/pid ]; then
    updater=$(cat /tmp/routewolf-code-update.lock/pid)
    case "$updater" in ''|*[!0-9]*) ;; *) [ "$updater" = "$PPID" ] || { kill -0 "$updater" 2>/dev/null && exit 75; } ;; esac
fi
if ! mkdir "$LOCK" 2>/dev/null; then
    # mkdir is atomic. Release stale locks only when the recorded owner is gone.
    owner=$(cat "$LOCK/pid" 2>/dev/null || true)
    case "$owner" in ''|*[!0-9]*) exit 1 ;; esac
    kill -0 "$owner" 2>/dev/null && exit 75
    rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null || exit 75
    mkdir "$LOCK" 2>/dev/null || exit 75
fi
echo $$ >"$LOCK/pid"
mkdir -p "$WORK" || exit 1
trap 'rm -f "$LOCK/pid"; cleanup' EXIT
trap 'exit 1' HUP INT TERM
run
