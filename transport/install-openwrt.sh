#!/bin/sh
# Install a RouteWolf client exported by the control panel on a new wg0 interface.
set -eu
umask 077
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
profile=$1
config_dir=/etc/routewolf-transport
service=/etc/init.d/routewolf-wg-transport
local_port=51987
wg_port=57684

fail() { printf '%s\n' "$*" >&2; exit 1; }
# This format intentionally supports one IPv4 peer and never executes hooks.
field() {
    awk -v section="$1" -v key="$2" '
        /^[[:space:]]*\[/ {
            active=($0 ~ "^ *\\[" section "\\][[:space:]]*$")
            next
        }
        active {
            line=$0
            sub(/[[:space:]]*[#;].*/, "", line)
            if (index(line, "=") == 0) next
            name=substr(line, 1, index(line, "=") - 1)
            sub(/^[[:space:]]+/, "", name)
            sub(/[[:space:]]+$/, "", name)
            if (name != key) next
            value=substr(line, index(line, "=") + 1)
            sub(/^[[:space:]]+/, "", value)
            sub(/[[:space:]]+$/, "", value)
            print value
            count++
        }
        END { if (count > 1) exit 1 }
    ' "$profile"
}
wg_key() { printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9+/]{43}=$'; }

[ -z "$(uci changes network)" ] || fail "Save pending network changes first."
if uci -q get network.wg0 >/dev/null 2>&1 ||
   uci -q get network.routewolf_transport_peer >/dev/null 2>&1 ||
   uci -q get network.routewolf_transport_local >/dev/null 2>&1 ||
   [ -e "$config_dir" ] || [ -e "$service" ]; then
    fail "A wg0 interface or RouteWolf transport already exists. Use the existing profile or replace it explicitly."
fi
! uci -q show 'network.@wireguard_wg0[0]' >/dev/null 2>&1 || fail "An existing wg0 peer must be removed first."
if ip -4 rule show | grep -q '^101:'; then fail "IP rule priority 101 is already in use."; fi
for port in "$local_port" "$wg_port"; do
    hex=$(printf '%04X' "$port")
    if awk -v p=":$hex" '$2 ~ (p "$") { found=1 } END { exit !found }' /proc/net/udp /proc/net/udp6; then
        fail "UDP port $port is already in use."
    fi
done

private=$(field Interface PrivateKey)
address=$(field Interface Address)
public=$(field Peer PublicKey)
psk=$(field Peer PresharedKey)
endpoint=$(field Peer Endpoint)
allowed=$(field Peer AllowedIPs)
transport_key=$(field RouteWolf Key)
mtu=$(field Interface MTU)
mtu=${mtu:-1380}
[ "$(grep -Ec '^[[:space:]]*\[Peer\][[:space:]]*$' "$profile")" -eq 1 ] || fail "Expected one RouteWolf peer."
wg_key "$private" && wg_key "$public" && wg_key "$psk" || fail "Invalid WireGuard profile keys."
printf '%s\n' "$transport_key" | grep -Eq '^[0-9a-f]{64}$' || fail "Missing [RouteWolf] Key. Export the OpenWrt profile from Amnezia Control."
printf '%s\n' "$address" | awk -F'[./]' 'NF==5 && $5==32 { for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || $i>255) exit 1; ok=1 } END { if(!ok) exit 1 }' ||
    fail "Expected one IPv4 /32 address."
[ "$allowed" = '0.0.0.0/0' ] || fail "The RouteWolf export must have IPv4 AllowedIPs 0.0.0.0/0."
case "$mtu" in ''|*[!0-9]*) fail "Invalid WireGuard MTU." ;; esac
[ "$mtu" -ge 576 ] && [ "$mtu" -le 1380 ] || fail "The transport supports MTU values from 576 to 1380."
host=${endpoint%:*}
port=${endpoint##*:}
case "$host" in ''|*[!A-Za-z0-9.-]*) fail "Invalid RouteWolf endpoint." ;; esac
case "$port" in ''|*[!0-9]*) fail "Invalid RouteWolf port." ;; esac
[ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || fail "Invalid RouteWolf port."

case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64) arch=arm64 ;;
    armv7l) arch=armv7 ;;
    mips*)
        case "$(. /etc/openwrt_release; printf '%s' "$DISTRIB_ARCH")" in
            mipsel_*) arch=mipsle ;;
            mips_*) arch=mips ;;
            *) fail "Unsupported OpenWrt CPU architecture." ;;
        esac ;;
    *) fail "Unsupported OpenWrt CPU architecture." ;;
esac
asset="routewolf-wg-transport-$arch.gz"
ref=$(sed -n '1p' "$here/assets.txt")
checksum=$(awk -v asset="$asset" '$2 == asset { print $1; exit }' "$here/assets.txt")
printf '%s\n' "$ref" | grep -Eq '^[a-f0-9]{40}$' || fail "Invalid transport asset manifest."
printf '%s\n' "$checksum" | grep -Eq '^[a-f0-9]{64}$' || fail "No verified transport build for this CPU."
url="https://raw.githubusercontent.com/dagmagnat/RouteWolf/$ref/$asset"

stage=$(mktemp -d /tmp/routewolf-transport.XXXXXX)
created=no
committed=no
finished=no
cleanup() {
    if [ "$finished" != yes ]; then
        if [ "$committed" = yes ]; then
            for name in wg0 routewolf_transport_peer routewolf_transport_local; do
                uci -q delete "network.$name" || true
            done
            uci commit network || true
        fi
        if [ "$created" = yes ]; then
            if [ -x "$service" ]; then "$service" stop || true; "$service" disable || true; fi
            rm -f "$service" "$config_dir/config.json" "$config_dir/transport" "$config_dir/managed-by-routewolf"
            rmdir "$config_dir" || true
        fi
    fi
    rm -rf "$stage"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
if [ -n "${ROUTEWOLF_TRANSPORT_ASSET_DIR:-}" ]; then
    cp "$ROUTEWOLF_TRANSPORT_ASSET_DIR/$asset" "$stage/$asset"
elif command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 10 --max-time 45 --max-filesize 3145728 "$url" -o "$stage/$asset"
else
    /bin/uclient-fetch -T 30 -O "$stage/$asset" "$url"
fi
(cd "$stage"; printf '%s  %s\n' "$checksum" "$asset" | sha256sum -c)
gzip -dc "$stage/$asset" > "$stage/transport"
mkdir -m 700 "$config_dir"
created=yes
touch "$config_dir/managed-by-routewolf"
mv "$stage/transport" "$config_dir/transport"
chmod 755 "$config_dir/transport"
printf '{"Mode":"client","Listen":"127.0.0.1:%s","WireGuard":"127.0.0.1:%s","Remote":"%s","Key":"%s"}\n' \
    "$local_port" "$wg_port" "$endpoint" "$transport_key" > "$config_dir/config.json"
cp "$here/openwrt-init.sh" "$service"
chmod 755 "$service"
"$service" enable
"$service" start
for attempt in 1 2 3 4 5; do
    if ubus call service list '{"name":"routewolf-wg-transport"}' | grep -q '"running": true'; then break; fi
    sleep 1
done
ubus call service list '{"name":"routewolf-wg-transport"}' | grep -q '"running": true' ||
    fail "RouteWolf transport did not start. Check logread for details."

mkdir "$stage/uci"
network() { uci -q -t "$stage/uci" "$@"; }
network batch <<CONFIG
set network.wg0=interface
set network.wg0.proto=wireguard
set network.wg0.private_key=$private
set network.wg0.listen_port=$wg_port
set network.wg0.nohostroute=1
set network.wg0.mtu=$mtu
set network.wg0.auto=1
add_list network.wg0.addresses=$address
set network.routewolf_transport_peer=wireguard_wg0
set network.routewolf_transport_peer.public_key=$public
set network.routewolf_transport_peer.preshared_key=$psk
set network.routewolf_transport_peer.endpoint_host=127.0.0.1
set network.routewolf_transport_peer.endpoint_port=$local_port
set network.routewolf_transport_peer.route_allowed_ips=0
set network.routewolf_transport_peer.persistent_keepalive=25
add_list network.routewolf_transport_peer.allowed_ips=0.0.0.0/0
set network.routewolf_transport_local=rule
set network.routewolf_transport_local.out=wg0
set network.routewolf_transport_local.priority=101
set network.routewolf_transport_local.lookup=99
CONFIG
[ "$(network get network.routewolf_transport_peer.endpoint_port)" = "$local_port" ]
[ "$(network get network.routewolf_transport_local.lookup)" = 99 ]
[ -z "$(uci changes network)" ] || fail "Another network edit appeared; retry after saving it."
network commit network
committed=yes
finished=yes
