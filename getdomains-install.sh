#!/bin/sh

#set -x
PROJECT_VERSION="v16"

# Project defaults for dagmagnat/routing-openwrt.
# Lists are read from GitHub RAW links. By default they are stored in this repository,
# but you can move lists to a separate repo later by changing DEFAULT_LISTS_REPO/BRANCH.
DEFAULT_PROJECT_REPO="dagmagnat/routing-openwrt"
DEFAULT_LISTS_REPO="${ROUTING_OPENWRT_LISTS_REPO:-dagmagnat/routing-openwrt}"
DEFAULT_LISTS_BRANCH="${ROUTING_OPENWRT_LISTS_BRANCH:-main}"
DEFAULT_LISTS_BASE_URL="https://raw.githubusercontent.com/${DEFAULT_LISTS_REPO}/${DEFAULT_LISTS_BRANCH}/lists"
DEFAULT_DOMAIN_LIST_URL="${ROUTING_OPENWRT_DOMAINS_URL:-${DEFAULT_LISTS_BASE_URL}/domains-dnsmasq-nfset.lst}"
DEFAULT_IPV4_LIST_URL="${ROUTING_OPENWRT_IPV4_URL:-${DEFAULT_LISTS_BASE_URL}/ipv4.lst}"
DEFAULT_IPV6_LIST_URL="${ROUTING_OPENWRT_IPV6_URL:-${DEFAULT_LISTS_BASE_URL}/ipv6.lst}"

# Safe defaults. 1 = use, 0 = skip.
# Domain routing is enabled. IPv4 CIDR, IPv6, DNS redirect and blackhole are OFF by default
# so ordinary WAN internet is not broken if VPN/list/DNS is unavailable.
DEFAULT_USE_DOMAIN_LIST="1"
DEFAULT_USE_IPV4_LIST="0"
DEFAULT_IPV6_SUPPORT="0"
DEFAULT_DNS_REDIRECT="0"
DEFAULT_FAIL_MODE="open"
FORCE_REINSTALL="0"
[ "$1" = "--reinstall" ] && FORCE_REINSTALL="1"

clear_screen() { command -v clear >/dev/null 2>&1 && clear; }

pause_screen() {
    echo ""
    read -r -p "Press Enter to continue / Нажмите Enter для продолжения..." _pause
}

is_back() { [ "$1" = "?" ] || [ "$1" = "back" ] || [ "$1" = "назад" ]; }

read_multiline_config() {
    tmp_file="$1"
    : > "$tmp_file"
    echo "Paste full WireGuard/AmneziaWG config. End with a single line: END"
    echo "Вставьте полный конфиг WireGuard/AmneziaWG. Завершите отдельной строкой: END"
    while IFS= read -r line; do
        [ "$line" = "END" ] && break
        printf '%s
' "$line" >> "$tmp_file"
    done
}

cfg_get_section_value() {
    section="$1"; key="$2"; file="$3"
    awk -v section="$section" -v key="$key" '
        /^[[:space:]]*\[/ { in_section=(index($0, "[" section "]") > 0); next }
        in_section {
            line=$0
            sub(/[[:space:]]*[#;].*/, "", line)
            split(line, a, "=")
            k=a[1]; v=substr(line, index(line, "=")+1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", k)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
            if (tolower(k)==tolower(key)) { print v; exit }
        }' "$file"
}

cfg_get_endpoint_host() { echo "$1" | sed 's#^\[##; s#\]##; s#:[0-9][0-9]*$##'; }
cfg_get_endpoint_port() { echo "$1" | sed -n 's#.*:\([0-9][0-9]*\)$#\1#p'; }

parse_awg_config_file() {
    cfg="$1"
    AWG_PRIVATE_KEY=$(cfg_get_section_value Interface PrivateKey "$cfg")
    AWG_IP=$(cfg_get_section_value Interface Address "$cfg")
    AWG_DNS=$(cfg_get_section_value Interface DNS "$cfg")
    AWG_JC=$(cfg_get_section_value Interface Jc "$cfg")
    AWG_JMIN=$(cfg_get_section_value Interface Jmin "$cfg")
    AWG_JMAX=$(cfg_get_section_value Interface Jmax "$cfg")
    AWG_S1=$(cfg_get_section_value Interface S1 "$cfg")
    AWG_S2=$(cfg_get_section_value Interface S2 "$cfg")
    AWG_H1=$(cfg_get_section_value Interface H1 "$cfg")
    AWG_H2=$(cfg_get_section_value Interface H2 "$cfg")
    AWG_H3=$(cfg_get_section_value Interface H3 "$cfg")
    AWG_H4=$(cfg_get_section_value Interface H4 "$cfg")
    AWG_S3=$(cfg_get_section_value Interface S3 "$cfg")
    AWG_S4=$(cfg_get_section_value Interface S4 "$cfg")
    AWG_I1=$(cfg_get_section_value Interface I1 "$cfg")
    AWG_I2=$(cfg_get_section_value Interface I2 "$cfg")
    AWG_I3=$(cfg_get_section_value Interface I3 "$cfg")
    AWG_I4=$(cfg_get_section_value Interface I4 "$cfg")
    AWG_I5=$(cfg_get_section_value Interface I5 "$cfg")
    AWG_PUBLIC_KEY=$(cfg_get_section_value Peer PublicKey "$cfg")
    AWG_PRESHARED_KEY=$(cfg_get_section_value Peer PresharedKey "$cfg")
    AWG_ALLOWED_IPS=$(cfg_get_section_value Peer AllowedIPs "$cfg")
    AWG_KEEPALIVE=$(cfg_get_section_value Peer PersistentKeepalive "$cfg")
    endpoint_full=$(cfg_get_section_value Peer Endpoint "$cfg")
    AWG_ENDPOINT=$(cfg_get_endpoint_host "$endpoint_full")
    AWG_ENDPOINT_PORT=$(cfg_get_endpoint_port "$endpoint_full")
    AWG_ENDPOINT_PORT=${AWG_ENDPOINT_PORT:-51820}
}


ask_yes_no_global() {
    prompt="$1"
    default_answer="$2"
    while true; do
        read -r -p "$prompt (y/n) [$default_answer]: " answer
        answer=${answer:-$default_answer}
        is_back "$answer" && return 2
        case "$answer" in
            y|Y|yes|YES|Yes|д|Д|да|ДА|Да) return 0 ;;
            n|N|no|NO|No|н|Н|нет|НЕТ|Нет) return 1 ;;
            *) echo "Please enter y or n / Введите y или n" ;;
        esac
    done
}

delete_uci_sections_by_name() {
    config="$1"
    type="$2"
    name="$3"
    while true; do
        idx=$(uci show "$config" 2>/dev/null | sed -n "s/^${config}\.@${type}\[\([0-9]*\)\]\.name='${name}'.*/\1/p" | head -n 1)
        [ -z "$idx" ] && break
        uci -q delete "${config}.@${type}[$idx]"
    done
}

delete_uci_sections_by_type() {
    config="$1"
    type="$2"
    while uci -q delete "${config}.@${type}[0]" 2>/dev/null; do :; done
}

detect_existing_routing_config() {
    EXISTING_TUNNEL=""
    EXISTING_IFACE=""

    if [ "$(uci -q get network.awg0.proto 2>/dev/null)" = "amneziawg" ]; then
        EXISTING_TUNNEL="awg"
        EXISTING_IFACE="awg0"
    elif [ "$(uci -q get network.wg0.proto 2>/dev/null)" = "wireguard" ]; then
        EXISTING_TUNNEL="wg"
        EXISTING_IFACE="wg0"
    elif uci show network 2>/dev/null | grep -q '^network\.@amneziawg_awg0\['; then
        # Orphaned peer section without network.awg0 interface: previous broken cleanup/install.
        EXISTING_TUNNEL="0"
        EXISTING_IFACE="orphaned-awg0-peer"
    elif uci show network 2>/dev/null | grep -q '^network\.@wireguard_wg0\['; then
        EXISTING_TUNNEL="0"
        EXISTING_IFACE="orphaned-wg0-peer"
    elif [ -f /etc/domain-routing-route.conf ]; then
        old_route_dev=$(grep -m1 "^VPN_ROUTE_DEV=" /etc/domain-routing-route.conf 2>/dev/null | cut -d= -f2 | tr -d "'")
        old_route_dev=$(echo "$old_route_dev" | tr -d '"')
        case "$old_route_dev" in
            awg0) EXISTING_TUNNEL="awg"; EXISTING_IFACE="awg0" ;;
            wg0) EXISTING_TUNNEL="wg"; EXISTING_IFACE="wg0" ;;
            tun0) EXISTING_TUNNEL="tun2socks"; EXISTING_IFACE="tun0" ;;
        esac
    fi

    if [ -n "$EXISTING_TUNNEL" ]; then
        return 0
    fi

    if [ "$(uci -q get network.vpn_route.table 2>/dev/null)" = "vpn" ] ||        uci show network 2>/dev/null | grep -q "mark0x1" ||        uci show firewall 2>/dev/null | grep -q "name='mark_domains'" ||        [ -f /etc/domain-routing-user.conf ]; then
        EXISTING_TUNNEL="0"
        EXISTING_IFACE="unknown"
        return 0
    fi

    return 1
}

cleanup_existing_routing_config() {
    echo "Removing old project tunnel/routing config / Удаляю старый конфиг туннеля/маршрутизации проекта..."

    uci -q delete network.wg0
    uci -q delete network.awg0
    uci -q delete network.vpn_route
    delete_uci_sections_by_type network wireguard_wg0
    delete_uci_sections_by_type network amneziawg_awg0
    delete_uci_sections_by_name network rule mark0x1
    uci commit network 2>/dev/null || true

    delete_uci_sections_by_name firewall zone wg
    delete_uci_sections_by_name firewall zone awg
    delete_uci_sections_by_name firewall forwarding wg-lan
    delete_uci_sections_by_name firewall forwarding awg-lan
    uci commit firewall 2>/dev/null || true

    rm -f /etc/domain-routing-route.conf
    rm -f /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute
    /etc/init.d/vpnroute disable >/dev/null 2>&1 || true
    rm -f /etc/init.d/vpnroute /usr/sbin/domain-routing-route.sh
}

handle_existing_routing_config() {
    detect_existing_routing_config || return 1

    echo "Existing routing configuration detected / Найден существующий конфиг маршрутизации."
    if [ -n "$EXISTING_IFACE" ]; then
        echo "Detected interface / Найден интерфейс: $EXISTING_IFACE"
    fi
    echo "1) Skip tunnel setup and use existing config / Пропустить настройку туннеля и использовать существующий [default]"
    echo "2) Replace old config and create a new one / Заменить старый конфиг и настроить новый"

    while true; do
        read -r -p "Select / Выберите [1]: " existing_choice
        existing_choice=${existing_choice:-1}
        case "$existing_choice" in
            1)
                TUNNEL="$EXISTING_TUNNEL"
                [ -z "$TUNNEL" ] && TUNNEL=0
                if [ "$TUNNEL" != "0" ]; then
                    route_vpn
                fi
                echo "Tunnel setup skipped / Настройка туннеля пропущена"
                return 0
                ;;
            2)
                cleanup_existing_routing_config
                return 1
                ;;
            *) echo "Choose 1 or 2 / Выберите 1 или 2" ;;
        esac
    done
}


# OpenWrt 24.10 and older use opkg; OpenWrt 25.12 and newer use apk.
# Keep all package operations behind these helpers.
detect_pkg_manager() {
    if command -v apk >/dev/null 2>&1; then
        PKG_MANAGER="apk"
    elif command -v opkg >/dev/null 2>&1; then
        PKG_MANAGER="opkg"
    else
        echo "Error: neither apk nor opkg was found on this OpenWrt system."
        exit 1
    fi
}

pkg_update() {
    detect_pkg_manager
    case "$PKG_MANAGER" in
        apk) apk update ;;
        opkg) opkg update ;;
    esac
}

pkg_install() {
    detect_pkg_manager
    case "$PKG_MANAGER" in
        apk) apk -U add "$@" ;;
        opkg) opkg install "$@" ;;
    esac
}

pkg_remove() {
    detect_pkg_manager
    case "$PKG_MANAGER" in
        apk) apk del "$@" ;;
        opkg) opkg remove "$@" ;;
    esac
}

pkg_is_installed() {
    detect_pkg_manager
    pkg="$1"
    case "$PKG_MANAGER" in
        apk) apk info -e "$pkg" >/dev/null 2>&1 ;;
        opkg) opkg list-installed | grep -q "^$pkg " ;;
    esac
}

check_repo() {
    printf "\033[32;1mChecking OpenWrt package repository...\033[0m\n"
    if ! pkg_update; then
        printf "\033[31;1mPackage repository update failed. Check internet, DNS or router date/time. Try: ntpd -p ptbtime1.ptb.de\033[0m\n"
        exit 1
    fi
}

route_vpn () {
    if [ "$TUNNEL" = wg ]; then
        VPN_ROUTE_DEV="wg0"
        VPN_ROUTE_UCI_INTERFACE="wg0"
    elif [ "$TUNNEL" = awg ]; then
        VPN_ROUTE_DEV="awg0"
        VPN_ROUTE_UCI_INTERFACE="awg0"
    elif [ "$TUNNEL" = singbox ] || [ "$TUNNEL" = ovpn ] || [ "$TUNNEL" = tun2socks ]; then
        VPN_ROUTE_DEV="tun0"
        VPN_ROUTE_UCI_INTERFACE=""
    else
        return 0
    fi

    grep -q "99 vpn" /etc/iproute2/rt_tables || echo '99 vpn' >> /etc/iproute2/rt_tables

    # For UCI-managed WireGuard/AmneziaWG interfaces, let netifd recreate the route on boot.
    # For manual tun0-based tunnels we still rely on the init/hotplug helper below.
    if [ -n "$VPN_ROUTE_UCI_INTERFACE" ]; then
        uci set network.vpn_route=route
        uci set network.vpn_route.name='vpn'
        uci set network.vpn_route.interface="$VPN_ROUTE_UCI_INTERFACE"
        uci set network.vpn_route.table='vpn'
        uci set network.vpn_route.target='0.0.0.0/0'
        uci commit network
    fi

    cat << EOF > /etc/domain-routing-route.conf
VPN_ROUTE_DEV='$VPN_ROUTE_DEV'
EOF

    cat << 'EOF' > /usr/sbin/domain-routing-route.sh
#!/bin/sh

# Maintains the separate "vpn" routing table used only by marked traffic.
# Normal, unmarked internet uses the main routing table and is not changed.
# Default safety mode is FAIL-OPEN: if VPN is missing/down, table vpn is left empty
# and Linux policy routing falls back to the main WAN table. This prevents Android/iOS
# from showing "No internet" when connectivity-check domains are in the routing list.
# Leak-protection/fail-closed can be added later as an explicit optional mode.

[ -f /etc/domain-routing-route.conf ] && . /etc/domain-routing-route.conf
[ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf
[ -n "$VPN_ROUTE_DEV" ] || exit 0

TABLE="vpn"
grep -q "99 $TABLE" /etc/iproute2/rt_tables 2>/dev/null || echo "99 $TABLE" >> /etc/iproute2/rt_tables

ensure_rule() {
    ip rule show 2>/dev/null | grep -q "fwmark 0x1.*lookup $TABLE" || ip rule add fwmark 0x1 table "$TABLE" priority 100 >/dev/null 2>&1 || true
    if [ "$IPV6_SUPPORT" = "1" ]; then
        ip -6 rule show 2>/dev/null | grep -q "fwmark 0x1.*lookup $TABLE" || ip -6 rule add fwmark 0x1 table "$TABLE" priority 100 >/dev/null 2>&1 || true
    fi
}

fail_open_route() {
    # Remove stale blackhole or stale VPN default routes from earlier versions.
    ip route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
    ip route del default table "$TABLE" >/dev/null 2>&1 || true
    if [ "$IPV6_SUPPORT" = "1" ]; then
        ip -6 route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
        ip -6 route del default table "$TABLE" >/dev/null 2>&1 || true
    fi
}

use_vpn_route() {
    # Always remove the old fail-closed blackhole before installing a working VPN route.
    ip route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
    ip route replace default dev "$VPN_ROUTE_DEV" table "$TABLE" scope link metric 10 >/dev/null 2>&1 || return 1
    if [ "$IPV6_SUPPORT" = "1" ]; then
        ip -6 route del blackhole default table "$TABLE" metric 42767 >/dev/null 2>&1 || true
        ip -6 route replace default dev "$VPN_ROUTE_DEV" table "$TABLE" metric 10 >/dev/null 2>&1 || true
    fi
    return 0
}

ensure_rule

i=0
while [ "$i" -lt 30 ]; do
    if ip link show dev "$VPN_ROUTE_DEV" >/dev/null 2>&1; then
        if ip link show dev "$VPN_ROUTE_DEV" | grep -q "UP"; then
            use_vpn_route && exit 0
        fi
    fi
    i=$((i + 1))
    sleep 1
done

fail_open_route
exit 0
EOF
    chmod +x /usr/sbin/domain-routing-route.sh

    cat << 'EOF' > /usr/sbin/domain-routing-status.sh
#!/bin/sh

[ -f /etc/domain-routing-route.conf ] && . /etc/domain-routing-route.conf
[ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf

echo "=== routing-openwrt v13 status ==="
echo "VPN_ROUTE_DEV=${VPN_ROUTE_DEV:-not set}"
echo "IPV6_SUPPORT=${IPV6_SUPPORT:-0}"
echo "DOMAINS_URL=${DOMAINS_URL:-not set}"
echo "IPV4_URL=${IPV4_URL:-not set}"
echo ""
echo "=== main default route, unaffected by this project ==="
ip route show default 2>/dev/null || true
echo ""
echo "=== vpn policy route ==="
ip rule show 2>/dev/null | grep -E "fwmark 0x1|lookup vpn" || true
ip route show table vpn 2>/dev/null || true
echo ""
echo "=== vpn interface ==="
[ -n "$VPN_ROUTE_DEV" ] && ip addr show dev "$VPN_ROUTE_DEV" 2>/dev/null || echo "No VPN route device configured"
echo ""
echo "=== lists ==="
ls -lah /tmp/dnsmasq.d/domains.lst /tmp/lst/ipv4.lst /tmp/lst/ipv6.lst 2>/dev/null || true
echo ""
echo "=== firewall DNS redirect ==="
uci show firewall 2>/dev/null | grep -E "routing_openwrt_force_dns|src_dport='53'|dest_port='53'|dest_ip" || true
echo ""
echo "=== firewall marks ==="
nft list ruleset 2>/dev/null | grep -E "vpn_domains|vpn_subnets|mark_domains|mark_subnet" -n || true
echo ""
echo "=== quick checks ==="
echo "If table vpn shows blackhole default, it is stale from older builds: run /usr/sbin/domain-routing-route.sh."
echo "If mark counters stay at 0 while opening a site from LAN, the client is probably using DoH/Private DNS/cache or not going through br-lan."
EOF
    chmod +x /usr/sbin/domain-routing-status.sh

    cat << 'EOF' > /etc/init.d/vpnroute
#!/bin/sh /etc/rc.common

START=98

start() {
    /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 &
}
EOF
    chmod +x /etc/init.d/vpnroute
    /etc/init.d/vpnroute enable

    cat << 'EOF' > /etc/hotplug.d/iface/30-vpnroute
#!/bin/sh

case "$ACTION" in
    ifup|ifupdate|add) /usr/sbin/domain-routing-route.sh >/dev/null 2>&1 & ;;
esac
EOF
    chmod +x /etc/hotplug.d/iface/30-vpnroute
    cp /etc/hotplug.d/iface/30-vpnroute /etc/hotplug.d/net/30-vpnroute

    /etc/init.d/vpnroute start
}

add_mark() {
    grep -q "99 vpn" /etc/iproute2/rt_tables || echo '99 vpn' >> /etc/iproute2/rt_tables
    
    if ! uci show network | grep -q mark0x1; then
        printf "\033[32;1mConfigure mark rule\033[0m\n"
        uci add network rule
        uci set network.@rule[-1].name='mark0x1'
        uci set network.@rule[-1].mark='0x1'
        uci set network.@rule[-1].priority='100'
        uci set network.@rule[-1].lookup='vpn'
        uci commit
    fi

    # v12 default is fail-open. Do not install blackhole routes automatically.
    # If VPN is not available, routed domains fall back to the normal WAN route instead
    # of breaking Android/iOS connectivity checks and normal internet indicators.
    ip route del blackhole default table vpn metric 42767 >/dev/null 2>&1 || true
}

add_tunnel() {
    clear_screen
    if [ "$FORCE_REINSTALL" = "1" ]; then
        echo "Forced reinstall requested / Запрошена принудительная переустановка"
        cleanup_existing_routing_config
    elif handle_existing_routing_config; then
        return
    fi
    clear_screen
    echo "Select a tunnel / Выберите туннель:"
    echo "1) WireGuard                         [active / работает]"
    echo "2) OpenVPN                           [later / позже]"
    echo "3) Sing-box                          [later / позже]"
    echo "4) tun2socks                         [later / позже]"
    echo "5) Skip tunnel setup / Пропустить настройку туннеля"
    echo "6) AmneziaWG / Amnezia WireGuard     [active / работает]"
    echo
    echo "Currently only WireGuard and AmneziaWG are configured automatically."
    echo "Сейчас автоматически настраиваются только WireGuard и AmneziaWG."

    while true; do
        read -r -p "Choice [6]: " TUNNEL
        TUNNEL=${TUNNEL:-6}
        case $TUNNEL in
        1) TUNNEL=wg; break ;;
        2) echo "OpenVPN support is planned, but not enabled yet. Choose 1, 5 or 6." ;;
        3) echo "Sing-box support is planned, but not enabled yet. Choose 1, 5 or 6." ;;
        4) echo "tun2socks support is planned, but not enabled yet. Choose 1, 5 or 6." ;;
        5) echo "Skip"; TUNNEL=0; break ;;
        6) TUNNEL=awg; break ;;
        *) echo "Choose 1, 5 or 6. OpenVPN/Sing-box/tun2socks are planned for later." ;;
        esac
    done

    if [ "$TUNNEL" == 'wg' ]; then
        printf "\033[32;1mConfigure WireGuard\033[0m\n"
        if pkg_is_installed wireguard-tools; then
            echo "Wireguard already installed"
        else
            echo "Installed wg..."
            pkg_install wireguard-tools
        fi

        route_vpn

        read -r -p "Enter the private key (from [Interface]):"$'\n' WG_PRIVATE_KEY

        while true; do
            read -r -p "Enter internal IP address with subnet, example 192.168.100.5/24 (from [Interface]):"$'\n' WG_IP
            if echo "$WG_IP" | egrep -oq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]+$'; then
                break
            else
                echo "This IP is not valid. Please repeat"
            fi
        done

        read -r -p "Enter the public key (from [Peer]):"$'\n' WG_PUBLIC_KEY
        read -r -p "If use PresharedKey, Enter this (from [Peer]). If your don't use leave blank:"$'\n' WG_PRESHARED_KEY
        read -r -p "Enter Endpoint host without port (Domain or IP) (from [Peer]):"$'\n' WG_ENDPOINT

        read -r -p "Enter Endpoint host port (from [Peer]) [51820]:"$'\n' WG_ENDPOINT_PORT
        WG_ENDPOINT_PORT=${WG_ENDPOINT_PORT:-51820}
        if [ "$WG_ENDPOINT_PORT" = '51820' ]; then
            echo $WG_ENDPOINT_PORT
        fi
        
        uci set network.wg0=interface
        uci set network.wg0.proto='wireguard'
        uci set network.wg0.private_key=$WG_PRIVATE_KEY
        uci set network.wg0.listen_port='51820'
        uci set network.wg0.addresses=$WG_IP

        if ! uci show network | grep -q wireguard_wg0; then
            uci add network wireguard_wg0
        fi
        uci set network.@wireguard_wg0[0]=wireguard_wg0
        uci set network.@wireguard_wg0[0].name='wg0_client'
        uci set network.@wireguard_wg0[0].public_key=$WG_PUBLIC_KEY
        uci set network.@wireguard_wg0[0].preshared_key=$WG_PRESHARED_KEY
        uci set network.@wireguard_wg0[0].route_allowed_ips='0'
        uci set network.@wireguard_wg0[0].persistent_keepalive='25'
        uci set network.@wireguard_wg0[0].endpoint_host=$WG_ENDPOINT
        uci set network.@wireguard_wg0[0].allowed_ips='0.0.0.0/0'
        uci set network.@wireguard_wg0[0].endpoint_port=$WG_ENDPOINT_PORT
        uci commit
    fi

    if [ "$TUNNEL" == 'ovpn' ]; then
        if pkg_is_installed openvpn-openssl; then
            echo "OpenVPN already installed"
        else
            echo "Installed openvpn"
            pkg_install openvpn-openssl
        fi
        printf "\033[32;1mConfigure route for OpenVPN\033[0m\n"
        route_vpn
    fi

    if [ "$TUNNEL" == 'singbox' ]; then
        if pkg_is_installed sing-box; then
            echo "Sing-box already installed"
        else
            AVAILABLE_SPACE=$(df / | awk 'NR>1 { print $4 }')
            if  [[ "$AVAILABLE_SPACE" -gt 2000 ]]; then
                echo "Installed sing-box"
                pkg_install sing-box
            else
                printf "\033[31;1mNo free space for a sing-box. Sing-box is not installed.\033[0m\n"
                exit 1
            fi
        fi
        if grep -q "option enabled '0'" /etc/config/sing-box; then
            sed -i "s/	option enabled \'0\'/	option enabled \'1\'/" /etc/config/sing-box
        fi
        if grep -q "option user 'sing-box'" /etc/config/sing-box; then
            sed -i "s/	option user \'sing-box\'/	option user \'root\'/" /etc/config/sing-box
        fi
        if grep -q "tun0" /etc/sing-box/config.json; then
        printf "\033[32;1mConfig /etc/sing-box/config.json already exists\033[0m\n"
        else
cat << 'EOF' > /etc/sing-box/config.json
{
  "log": {
    "level": "debug"
  },
  "inbounds": [
    {
      "type": "tun",
      "interface_name": "tun0",
      "domain_strategy": "ipv4_only",
      "address": ["172.16.250.1/30"],
      "auto_route": false,
      "strict_route": false,
      "sniff": true 
   }
  ],
  "outbounds": [
    {
      "type": "$TYPE",
      "server": "$HOST",
      "server_port": $PORT,
      "method": "$METHOD",
      "password": "$PASS"
    }
  ],
  "route": {
    "auto_detect_interface": true
  }
}
EOF
        printf "\033[32;1mCreate template config in /etc/sing-box/config.json. Edit it manually. Official doc: https://sing-box.sagernet.org/configuration/outbound/\033[0m\n"
        printf "\033[32;1mOfficial doc: https://sing-box.sagernet.org/configuration/outbound/\033[0m\n"
        printf "\033[32;1mManual with example SS: https://cli.co/Badmn3K \033[0m\n"

        fi
        printf "\033[32;1mConfigure route for Sing-box\033[0m\n"
        route_vpn
    fi

    if [ "$TUNNEL" == 'wgForYoutube' ]; then
        add_internal_wg Wireguard
    fi

    if [ "$TUNNEL" == 'awgForYoutube' ]; then
        add_internal_wg AmneziaWG
    fi

    if [ "$TUNNEL" == 'awg' ]; then
        printf "\033[32;1mConfigure Amnezia WireGuard\033[0m\n"

        install_awg_packages

        route_vpn

        read -r -p "Paste full AmneziaWG config now? / Вставить полный конфиг AmneziaWG? (y/n) [y]: " PASTE_AWG_CONFIG
        PASTE_AWG_CONFIG=${PASTE_AWG_CONFIG:-y}
        if [ "$PASTE_AWG_CONFIG" = "y" ] || [ "$PASTE_AWG_CONFIG" = "Y" ]; then
            AWG_CFG_TMP="/tmp/awg-client.conf"
            read_multiline_config "$AWG_CFG_TMP"
            parse_awg_config_file "$AWG_CFG_TMP"
            rm -f "$AWG_CFG_TMP"
        else
            read -r -p "Enter the private key (from [Interface]):"$'\n' AWG_PRIVATE_KEY
            while true; do
                read -r -p "Enter internal IP address with subnet, example 192.168.100.5/24 (Address from [Interface]):"$'\n' AWG_IP
                if echo "$AWG_IP" | egrep -oq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]+$'; then break; else echo "This IP is not valid. Please repeat"; fi
            done
            read -r -p "Enter DNS value [optional] (from [Interface]):"$'\n' AWG_DNS
            read -r -p "Enter Jc value (from [Interface]):"$'\n' AWG_JC
            read -r -p "Enter Jmin value (from [Interface]):"$'\n' AWG_JMIN
            read -r -p "Enter Jmax value (from [Interface]):"$'\n' AWG_JMAX
            read -r -p "Enter S1 value (from [Interface]):"$'\n' AWG_S1
            read -r -p "Enter S2 value (from [Interface]):"$'\n' AWG_S2
            read -r -p "Enter H1 value (from [Interface]):"$'\n' AWG_H1
            read -r -p "Enter H2 value (from [Interface]):"$'\n' AWG_H2
            read -r -p "Enter H3 value (from [Interface]):"$'\n' AWG_H3
            read -r -p "Enter H4 value (from [Interface]):"$'\n' AWG_H4
            if [ "$AWG_VERSION" = "2.0" ]; then
                read -r -p "Enter S3 value [optional]:"$'\n' AWG_S3
                read -r -p "Enter S4 value [optional]:"$'\n' AWG_S4
                read -r -p "Enter I1 value [optional]:"$'\n' AWG_I1
                read -r -p "Enter I2 value [optional]:"$'\n' AWG_I2
                read -r -p "Enter I3 value [optional]:"$'\n' AWG_I3
                read -r -p "Enter I4 value [optional]:"$'\n' AWG_I4
                read -r -p "Enter I5 value [optional]:"$'\n' AWG_I5
            fi
            read -r -p "Enter the public key (from [Peer]):"$'\n' AWG_PUBLIC_KEY
            read -r -p "If use PresharedKey, enter it; otherwise leave blank:"$'\n' AWG_PRESHARED_KEY
            read -r -p "Enter Endpoint host without port (Domain or IP) (from [Peer]):"$'\n' AWG_ENDPOINT
            read -r -p "Enter Endpoint host port (from [Peer]) [51820]:"$'\n' AWG_ENDPOINT_PORT
            AWG_ENDPOINT_PORT=${AWG_ENDPOINT_PORT:-51820}
            read -r -p "Enter AllowedIPs [0.0.0.0/0]:"$'\n' AWG_ALLOWED_IPS
            AWG_ALLOWED_IPS=${AWG_ALLOWED_IPS:-0.0.0.0/0}
            read -r -p "Enter PersistentKeepalive [25]:"$'\n' AWG_KEEPALIVE
            AWG_KEEPALIVE=${AWG_KEEPALIVE:-25}
        fi

        if [ -z "$AWG_PRIVATE_KEY" ] || [ -z "$AWG_IP" ] || [ -z "$AWG_PUBLIC_KEY" ] || [ -z "$AWG_ENDPOINT" ]; then
            echo "Required AmneziaWG values are missing. Check pasted config."
            exit 1
        fi
        AWG_ALLOWED_IPS=${AWG_ALLOWED_IPS:-0.0.0.0/0}
        AWG_KEEPALIVE=${AWG_KEEPALIVE:-25}
        
        uci set network.awg0=interface
        uci set network.awg0.proto='amneziawg'
        uci set network.awg0.private_key="$AWG_PRIVATE_KEY"
        uci set network.awg0.listen_port='51820'
        uci set network.awg0.addresses="$AWG_IP"
        if [ -n "$AWG_DNS" ]; then
            uci -q delete network.awg0.dns
            OLD_IFS="$IFS"
            IFS=','
            for dns_server in $AWG_DNS; do
                IFS="$OLD_IFS"
                dns_server=$(echo "$dns_server" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                [ -n "$dns_server" ] && uci add_list network.awg0.dns="$dns_server"
                IFS=','
            done
            IFS="$OLD_IFS"
        fi

        uci set network.awg0.awg_jc="$AWG_JC"
        uci set network.awg0.awg_jmin="$AWG_JMIN"
        uci set network.awg0.awg_jmax="$AWG_JMAX"
        uci set network.awg0.awg_s1="$AWG_S1"
        uci set network.awg0.awg_s2="$AWG_S2"
        uci set network.awg0.awg_h1="$AWG_H1"
        uci set network.awg0.awg_h2="$AWG_H2"
        uci set network.awg0.awg_h3="$AWG_H3"
        uci set network.awg0.awg_h4="$AWG_H4"
        [ -n "$AWG_S3" ] && uci set network.awg0.awg_s3="$AWG_S3"
        [ -n "$AWG_S4" ] && uci set network.awg0.awg_s4="$AWG_S4"
        [ -n "$AWG_I1" ] && uci set network.awg0.awg_i1="$AWG_I1"
        [ -n "$AWG_I2" ] && uci set network.awg0.awg_i2="$AWG_I2"
        [ -n "$AWG_I3" ] && uci set network.awg0.awg_i3="$AWG_I3"
        [ -n "$AWG_I4" ] && uci set network.awg0.awg_i4="$AWG_I4"
        [ -n "$AWG_I5" ] && uci set network.awg0.awg_i5="$AWG_I5"

        if ! uci show network | grep -q amneziawg_awg0; then
            uci add network amneziawg_awg0
        fi

        uci set network.@amneziawg_awg0[0]=amneziawg_awg0
        uci set network.@amneziawg_awg0[0].name='awg0_client'
        uci set network.@amneziawg_awg0[0].public_key="$AWG_PUBLIC_KEY"
        uci set network.@amneziawg_awg0[0].preshared_key="$AWG_PRESHARED_KEY"
        uci set network.@amneziawg_awg0[0].route_allowed_ips='0'
        uci set network.@amneziawg_awg0[0].persistent_keepalive="$AWG_KEEPALIVE"
        uci set network.@amneziawg_awg0[0].endpoint_host="$AWG_ENDPOINT"
        uci set network.@amneziawg_awg0[0].allowed_ips="$AWG_ALLOWED_IPS"
        uci set network.@amneziawg_awg0[0].endpoint_port="$AWG_ENDPOINT_PORT"
        uci commit
    fi

}

dnsmasqfull() {
    if pkg_is_installed dnsmasq-full; then
        printf "\033[32;1mdnsmasq-full already installed\033[0m\n"
    else
        printf "\033[32;1mInstalling dnsmasq-full\033[0m\n"
        detect_pkg_manager
        if [ "$PKG_MANAGER" = "apk" ]; then
            # OpenWrt 25.12+ uses apk. apk resolves package replacement itself on most builds.
            pkg_install dnsmasq-full || { pkg_remove dnsmasq; pkg_install dnsmasq-full; }
        else
            cd /tmp/ && opkg download dnsmasq-full
            opkg remove dnsmasq && opkg install dnsmasq-full --cache /tmp/
            [ -f /etc/config/dhcp-opkg ] && cp /etc/config/dhcp /etc/config/dhcp-old && mv /etc/config/dhcp-opkg /etc/config/dhcp
        fi
    fi
}

dnsmasqconfdir() {
    if [ $VERSION_ID -ge 24 ]; then
        if uci get dhcp.@dnsmasq[0].confdir | grep -q /tmp/dnsmasq.d; then
            printf "\033[32;1mconfdir already set\033[0m\n"
        else
            printf "\033[32;1mSetting confdir\033[0m\n"
            uci set dhcp.@dnsmasq[0].confdir='/tmp/dnsmasq.d'
            uci commit dhcp
        fi
    fi
}

remove_forwarding() {
    if [ ! -z "$forward_id" ]; then
        while uci -q delete firewall.@forwarding[$forward_id]; do :; done
    fi
}

add_zone() {
    if  [ "$TUNNEL" == 0 ]; then
        printf "\033[32;1mZone setting skipped\033[0m\n"
    elif uci show firewall | grep -q "@zone.*name='$TUNNEL'"; then
        printf "\033[32;1mZone already exist\033[0m\n"
    else
        printf "\033[32;1mCreate zone\033[0m\n"

        # Delete exists zone
        zone_tun_id=$(uci show firewall | grep -E '@zone.*tun0' | awk -F '[][{}]' '{print $2}' | head -n 1)
        if [ "$zone_tun_id" == 0 ] || [ "$zone_tun_id" == 1 ]; then
            printf "\033[32;1mtun0 zone has an identifier of 0 or 1. That's not ok. Fix your firewall. lan and wan zones should have identifiers 0 and 1. \033[0m\n"
            exit 1
        fi
        if [ ! -z "$zone_tun_id" ]; then
            while uci -q delete firewall.@zone[$zone_tun_id]; do :; done
        fi

        zone_wg_id=$(uci show firewall | grep -E '@zone.*wg0' | awk -F '[][{}]' '{print $2}' | head -n 1)
        if [ "$zone_wg_id" == 0 ] || [ "$zone_wg_id" == 1 ]; then
            printf "\033[32;1mwg0 zone has an identifier of 0 or 1. That's not ok. Fix your firewall. lan and wan zones should have identifiers 0 and 1. \033[0m\n"
            exit 1
        fi
        if [ ! -z "$zone_wg_id" ]; then
            while uci -q delete firewall.@zone[$zone_wg_id]; do :; done
        fi

        zone_awg_id=$(uci show firewall | grep -E '@zone.*awg0' | awk -F '[][{}]' '{print $2}' | head -n 1)
        if [ "$zone_awg_id" == 0 ] || [ "$zone_awg_id" == 1 ]; then
            printf "\033[32;1mawg0 zone has an identifier of 0 or 1. That's not ok. Fix your firewall. lan and wan zones should have identifiers 0 and 1. \033[0m\n"
            exit 1
        fi
        if [ ! -z "$zone_awg_id" ]; then
            while uci -q delete firewall.@zone[$zone_awg_id]; do :; done
        fi

        uci add firewall zone
        uci set firewall.@zone[-1].name="$TUNNEL"
        if [ "$TUNNEL" == wg ]; then
            uci set firewall.@zone[-1].network='wg0'
        elif [ "$TUNNEL" == awg ]; then
            uci set firewall.@zone[-1].network='awg0'
        elif [ "$TUNNEL" == singbox ] || [ "$TUNNEL" == ovpn ] || [ "$TUNNEL" == tun2socks ]; then
            uci set firewall.@zone[-1].device='tun0'
        fi
        if [ "$TUNNEL" == wg ] || [ "$TUNNEL" == awg ] || [ "$TUNNEL" == ovpn ] || [ "$TUNNEL" == tun2socks ]; then
            uci set firewall.@zone[-1].forward='REJECT'
            uci set firewall.@zone[-1].output='ACCEPT'
            uci set firewall.@zone[-1].input='REJECT'
        elif [ "$TUNNEL" == singbox ]; then
            uci set firewall.@zone[-1].forward='ACCEPT'
            uci set firewall.@zone[-1].output='ACCEPT'
            uci set firewall.@zone[-1].input='ACCEPT'
        fi
        uci set firewall.@zone[-1].masq='1'
        uci set firewall.@zone[-1].mtu_fix='1'
        uci set firewall.@zone[-1].family='ipv4'
        uci commit firewall
    fi
    
    if [ "$TUNNEL" == 0 ]; then
        printf "\033[32;1mForwarding setting skipped\033[0m\n"
    elif uci show firewall | grep -q "@forwarding.*name='$TUNNEL-lan'"; then
        printf "\033[32;1mForwarding already configured\033[0m\n"
    else
        printf "\033[32;1mConfigured forwarding\033[0m\n"
        # Delete exists forwarding
        if [[ $TUNNEL != "wg" ]]; then
            forward_id=$(uci show firewall | grep -E "@forwarding.*dest='wg'" | awk -F '[][{}]' '{print $2}' | head -n 1)
            remove_forwarding
        fi

        if [[ $TUNNEL != "awg" ]]; then
            forward_id=$(uci show firewall | grep -E "@forwarding.*dest='awg'" | awk -F '[][{}]' '{print $2}' | head -n 1)
            remove_forwarding
        fi

        if [[ $TUNNEL != "ovpn" ]]; then
            forward_id=$(uci show firewall | grep -E "@forwarding.*dest='ovpn'" | awk -F '[][{}]' '{print $2}' | head -n 1)
            remove_forwarding
        fi

        if [[ $TUNNEL != "singbox" ]]; then
            forward_id=$(uci show firewall | grep -E "@forwarding.*dest='singbox'" | awk -F '[][{}]' '{print $2}' | head -n 1)
            remove_forwarding
        fi

        if [[ $TUNNEL != "tun2socks" ]]; then
            forward_id=$(uci show firewall | grep -E "@forwarding.*dest='tun2socks'" | awk -F '[][{}]' '{print $2}' | head -n 1)
            remove_forwarding
        fi

        uci add firewall forwarding
        uci set firewall.@forwarding[-1]=forwarding
        uci set firewall.@forwarding[-1].name="$TUNNEL-lan"
        uci set firewall.@forwarding[-1].dest="$TUNNEL"
        uci set firewall.@forwarding[-1].src='lan'
        uci set firewall.@forwarding[-1].family='ipv4'
        uci commit firewall
    fi
}

show_manual() {
    if [ "$TUNNEL" == tun2socks ]; then
        printf "\033[42;1mZone for tun2socks cofigured. But you need to set up the tunnel yourself.\033[0m\n"
        echo "Use this manual: https://cli.co/VNZISEM"
    elif [ "$TUNNEL" == ovpn ]; then
        printf "\033[42;1mZone for OpenVPN cofigured. But you need to set up the tunnel yourself.\033[0m\n"
        echo "Use this manual: https://itdog.info/nastrojka-klienta-openvpn-na-openwrt/"
    fi
}

add_set() {
    # Recreate project domain set/rule idempotently. This prevents fw4 errors like
    # "set vpn_domains: File exists" after previous broken installs or manual tests.
    delete_uci_sections_by_name firewall ipset vpn_domains
    delete_uci_sections_by_name firewall rule mark_domains

    printf "[32;1mCreate domain nft set and mark rule[0m
"
    uci add firewall ipset >/dev/null
    uci set firewall.@ipset[-1].name='vpn_domains'
    uci set firewall.@ipset[-1].match='dst_net'

    uci add firewall rule >/dev/null
    uci set firewall.@rule[-1]=rule
    uci set firewall.@rule[-1].name='mark_domains'
    uci set firewall.@rule[-1].src='lan'
    uci set firewall.@rule[-1].dest='*'
    uci set firewall.@rule[-1].proto='all'
    uci set firewall.@rule[-1].ipset='vpn_domains'
    uci set firewall.@rule[-1].set_mark='0x1'
    uci set firewall.@rule[-1].target='MARK'
    uci set firewall.@rule[-1].family='ipv4'
    uci commit firewall
}

add_dns_resolver() {
    echo "Configure DNSCrypt2 or Stubby? It does matter if your ISP is spoofing DNS requests"
    DISK=$(df -m / | awk 'NR==2{ print $2 }')
    if [[ "$DISK" -lt 32 ]]; then 
        printf "\033[31;1mYour router a disk have less than 32MB. It is not recommended to install DNSCrypt, it takes 10MB\033[0m\n"
    fi
    echo "Select:"
    echo "1) No [Default]"
    echo "2) DNSCrypt2 (10.7M)"
    echo "3) Stubby (36K)"

    while true; do
    read -r -p '' DNS_RESOLVER
        case $DNS_RESOLVER in 

        1) 
            echo "Skiped"
            break
            ;;

        2)
            DNS_RESOLVER=DNSCRYPT
            break
            ;;

        3) 
            DNS_RESOLVER=STUBBY
            break
            ;;

        *)
            echo "Choose from the following options"
            ;;
        esac
    done

    if [ "$DNS_RESOLVER" == 'DNSCRYPT' ]; then
        if pkg_is_installed dnscrypt-proxy2; then
            printf "\033[32;1mDNSCrypt2 already installed\033[0m\n"
        else
            printf "\033[32;1mInstalled dnscrypt-proxy2\033[0m\n"
            pkg_install dnscrypt-proxy2
            if grep -q "# server_names" /etc/dnscrypt-proxy2/dnscrypt-proxy.toml; then
                sed -i "s/^# server_names =.*/server_names = [\'google\', \'cloudflare\', \'scaleway-fr\', \'yandex\']/g" /etc/dnscrypt-proxy2/dnscrypt-proxy.toml
            fi

            printf "\033[32;1mDNSCrypt restart\033[0m\n"
            service dnscrypt-proxy restart
            printf "\033[32;1mDNSCrypt needs to load the relays list. Please wait\033[0m\n"
            sleep 30

            if [ -f /etc/dnscrypt-proxy2/relays.md ]; then
                uci set dhcp.@dnsmasq[0].noresolv="1"
                uci -q delete dhcp.@dnsmasq[0].server
                uci add_list dhcp.@dnsmasq[0].server="127.0.0.53#53"
                uci add_list dhcp.@dnsmasq[0].server='/use-application-dns.net/'
                uci commit dhcp
                
                printf "\033[32;1mDnsmasq restart\033[0m\n"

                /etc/init.d/dnsmasq restart
            else
                printf "\033[31;1mDNSCrypt not download list on /etc/dnscrypt-proxy2. Repeat install DNSCrypt by script.\033[0m\n"
            fi
    fi

    fi

    if [ "$DNS_RESOLVER" == 'STUBBY' ]; then
        printf "\033[32;1mConfigure Stubby\033[0m\n"

        if pkg_is_installed stubby; then
            printf "\033[32;1mStubby already installed\033[0m\n"
        else
            printf "\033[32;1mInstalled stubby\033[0m\n"
            pkg_install stubby

            printf "\033[32;1mConfigure Dnsmasq for Stubby\033[0m\n"
            uci set dhcp.@dnsmasq[0].noresolv="1"
            uci -q delete dhcp.@dnsmasq[0].server
            uci add_list dhcp.@dnsmasq[0].server="127.0.0.1#5453"
            uci add_list dhcp.@dnsmasq[0].server='/use-application-dns.net/'
            uci commit dhcp

            printf "\033[32;1mDnsmasq restart\033[0m\n"

            /etc/init.d/dnsmasq restart
        fi
    fi
}

add_packages() {
    for package in curl nano; do
        if pkg_is_installed "$package"; then
            printf "\033[32;1m$package already installed\033[0m\n"
        else
            printf "\033[32;1mInstalling $package...\033[0m\n"
            pkg_install "$package"
            
            if "$package" --version >/dev/null 2>&1; then
                printf "\033[32;1m$package was successfully installed and available\033[0m\n"
            else
                printf "\033[31;1mError: failed to install $package\033[0m\n"
                exit 1
            fi
        fi
    done
}



ensure_lan_dns_redirect() {
    # Force ordinary LAN DNS (TCP/UDP 53) to the router so dnsmasq can fill nftsets.
    # This does not affect DoH/DoT; users must disable Private DNS/Secure DNS in browsers/devices.
    LAN_IP=$(uci -q get network.lan.ipaddr 2>/dev/null)
    [ -z "$LAN_IP" ] && LAN_IP="192.168.1.1"

    delete_uci_sections_by_name firewall redirect routing_openwrt_force_dns

    uci add firewall redirect >/dev/null
    uci set firewall.@redirect[-1].name='routing_openwrt_force_dns'
    uci set firewall.@redirect[-1].src='lan'
    uci add_list firewall.@redirect[-1].proto='tcp'
    uci add_list firewall.@redirect[-1].proto='udp'
    uci set firewall.@redirect[-1].src_dport='53'
    uci set firewall.@redirect[-1].target='DNAT'
    uci set firewall.@redirect[-1].dest_ip="$LAN_IP"
    uci set firewall.@redirect[-1].dest_port='53'
    uci set firewall.@redirect[-1].family='ipv4'
    uci commit firewall
    echo "LAN DNS redirect enabled / DNS LAN перенаправляется на роутер: $LAN_IP:53"
}

install_management_commands() {
    mkdir -p /usr/sbin
    cat << 'EOF' > /usr/sbin/routing-openwrt-update.sh
#!/bin/sh
# Update routing-openwrt from GitHub without deleting the current tunnel config.
cd /tmp && wget --no-check-certificate -O /tmp/routing-openwrt-update.sh https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/update.sh && sh /tmp/routing-openwrt-update.sh
EOF
    chmod +x /usr/sbin/routing-openwrt-update.sh

    cat << 'EOF' > /usr/sbin/routing-openwrt-uninstall.sh
#!/bin/sh
# Remove routing-openwrt rules, lists, cron and helper scripts.
cd /tmp && wget --no-check-certificate -O /tmp/routing-openwrt-uninstall.sh https://raw.githubusercontent.com/dagmagnat/routing-openwrt/main/uninstall.sh && sh /tmp/routing-openwrt-uninstall.sh
EOF
    chmod +x /usr/sbin/routing-openwrt-uninstall.sh
}

update_existing_installation() {
    clear_screen
    echo "routing-openwrt update mode / режим обновления routing-openwrt"
    echo "This updates project scripts, list URLs, cron, firewall marks and cached lists."
    echo "Tunnel configuration is kept. / Конфиг туннеля сохраняется."

    # Detect existing tunnel only for the policy route helper.
    if [ "$(uci -q get network.awg0.proto 2>/dev/null)" = "amneziawg" ]; then
        TUNNEL="awg"
        route_vpn
    elif [ "$(uci -q get network.wg0.proto 2>/dev/null)" = "wireguard" ]; then
        TUNNEL="wg"
        route_vpn
    elif [ -f /etc/domain-routing-route.conf ]; then
        . /etc/domain-routing-route.conf
        case "$VPN_ROUTE_DEV" in
            awg0) TUNNEL="awg"; route_vpn ;;
            wg0) TUNNEL="wg"; route_vpn ;;
            tun0) TUNNEL="tun2socks"; route_vpn ;;
        esac
    else
        echo "Warning: no existing awg0/wg0/tun0 route config found. Lists/firewall will be updated, but tunnel route may need reinstall."
    fi

    dnsmasqfull
    dnsmasqconfdir
    # DNS redirect is intentionally OFF by default. It can break normal internet checks.
    add_mark
    add_set
    install_management_commands
    add_getdomains

    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
    /etc/init.d/vpnroute start >/dev/null 2>&1 || true

    echo "Update done / Обновление завершено"
    echo "Status command / Проверка: /usr/sbin/domain-routing-status.sh"
}

add_getdomains() {
    clear_screen
    echo "Domain/IP lists / Списки доменов и IP"
    echo "Project / Проект: ${DEFAULT_PROJECT_REPO:-dagmagnat/routing-openwrt}"
    echo "Lists repo / Репозиторий списков: ${DEFAULT_LISTS_REPO:-dagmagnat/routing-openwrt}"
    echo "This fork uses repository lists automatically. No manual URL input is required."
    echo "Этот форк автоматически использует списки из папки lists/ репозитория. Ручной ввод URL не нужен."

    if [ "${DEFAULT_USE_DOMAIN_LIST:-1}" = "1" ]; then
        echo "Domain list: enabled / включён"
        echo "  $DEFAULT_DOMAIN_LIST_URL"
        DOMAINS_URL="$DEFAULT_DOMAIN_LIST_URL"
    else
        echo "Domain list: disabled / выключен"
        DOMAINS_URL=""
    fi

    if [ "${DEFAULT_USE_IPV4_LIST:-1}" = "1" ]; then
        echo "IPv4 CIDR list: enabled / включён"
        echo "  $DEFAULT_IPV4_LIST_URL"
        IPV4_URL="$DEFAULT_IPV4_LIST_URL"
    else
        echo "IPv4 CIDR list: disabled / выключен"
        IPV4_URL=""
    fi

    IPV6_SUPPORT="${DEFAULT_IPV6_SUPPORT:-0}"
    if [ "$IPV6_SUPPORT" = "1" ]; then
        echo "IPv6 support: enabled / включено"
        echo "IPv6 CIDR list:"
        echo "  $DEFAULT_IPV6_LIST_URL"
        IPV6_URL="$DEFAULT_IPV6_LIST_URL"
    else
        echo "IPv6 support: disabled / выключено; AAAA DNS answers will be filtered"
        IPV6_URL=""
    fi

    remove_firewall_section_by_name() {
        type="$1"
        name="$2"
        while true; do
            idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@${type}\[\([0-9]*\)\]\.name='${name}'.*/\1/p" | head -n 1)
            [ -z "$idx" ] && break
            uci -q delete firewall.@${type}[$idx]
        done
    }

    configure_ipv4_cidr_firewall() {
        set_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='vpn_subnets'.*/\1/p" | head -n 1)
        if [ -z "$set_idx" ]; then
            uci add firewall ipset >/dev/null
            uci set firewall.@ipset[-1].name='vpn_subnets'
            uci set firewall.@ipset[-1].match='dst_net'
            uci set firewall.@ipset[-1].loadfile='/tmp/lst/ipv4.lst'
        else
            uci set firewall.@ipset[$set_idx].match='dst_net'
            uci set firewall.@ipset[$set_idx].loadfile='/tmp/lst/ipv4.lst'
        fi

        rule_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='mark_subnet'.*/\1/p" | head -n 1)
        if [ -z "$rule_idx" ]; then
            uci add firewall rule >/dev/null
            uci set firewall.@rule[-1].name='mark_subnet'
            uci set firewall.@rule[-1].src='lan'
            uci set firewall.@rule[-1].dest='*'
            uci set firewall.@rule[-1].proto='all'
            uci set firewall.@rule[-1].ipset='vpn_subnets'
            uci set firewall.@rule[-1].set_mark='0x1'
            uci set firewall.@rule[-1].target='MARK'
            uci set firewall.@rule[-1].family='ipv4'
        else
            uci set firewall.@rule[$rule_idx].src='lan'
            uci set firewall.@rule[$rule_idx].dest='*'
            uci set firewall.@rule[$rule_idx].proto='all'
            uci set firewall.@rule[$rule_idx].ipset='vpn_subnets'
            uci set firewall.@rule[$rule_idx].set_mark='0x1'
            uci set firewall.@rule[$rule_idx].target='MARK'
            uci set firewall.@rule[$rule_idx].family='ipv4'
        fi
        uci commit firewall
    }

    configure_ipv6_domain_firewall() {
        set_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='vpn_domains6'.*/\1/p" | head -n 1)
        if [ -z "$set_idx" ]; then
            uci add firewall ipset >/dev/null
            uci set firewall.@ipset[-1].name='vpn_domains6'
            uci set firewall.@ipset[-1].match='dst_net'
            uci set firewall.@ipset[-1].family='ipv6'
        else
            uci set firewall.@ipset[$set_idx].match='dst_net'
            uci set firewall.@ipset[$set_idx].family='ipv6'
        fi

        rule_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='mark_domains6'.*/\1/p" | head -n 1)
        if [ -z "$rule_idx" ]; then
            uci add firewall rule >/dev/null
            uci set firewall.@rule[-1].name='mark_domains6'
            uci set firewall.@rule[-1].src='lan'
            uci set firewall.@rule[-1].dest='*'
            uci set firewall.@rule[-1].proto='all'
            uci set firewall.@rule[-1].ipset='vpn_domains6'
            uci set firewall.@rule[-1].set_mark='0x1'
            uci set firewall.@rule[-1].target='MARK'
            uci set firewall.@rule[-1].family='ipv6'
        else
            uci set firewall.@rule[$rule_idx].src='lan'
            uci set firewall.@rule[$rule_idx].dest='*'
            uci set firewall.@rule[$rule_idx].proto='all'
            uci set firewall.@rule[$rule_idx].ipset='vpn_domains6'
            uci set firewall.@rule[$rule_idx].set_mark='0x1'
            uci set firewall.@rule[$rule_idx].target='MARK'
            uci set firewall.@rule[$rule_idx].family='ipv6'
        fi
        uci commit firewall
    }

    configure_ipv6_cidr_firewall() {
        set_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@ipset\[\([0-9]*\)\]\.name='vpn_subnets6'.*/\1/p" | head -n 1)
        if [ -z "$set_idx" ]; then
            uci add firewall ipset >/dev/null
            uci set firewall.@ipset[-1].name='vpn_subnets6'
            uci set firewall.@ipset[-1].match='dst_net'
            uci set firewall.@ipset[-1].family='ipv6'
            uci set firewall.@ipset[-1].loadfile='/tmp/lst/ipv6.lst'
        else
            uci set firewall.@ipset[$set_idx].match='dst_net'
            uci set firewall.@ipset[$set_idx].family='ipv6'
            uci set firewall.@ipset[$set_idx].loadfile='/tmp/lst/ipv6.lst'
        fi

        rule_idx=$(uci show firewall 2>/dev/null | sed -n "s/^firewall\.@rule\[\([0-9]*\)\]\.name='mark_subnet6'.*/\1/p" | head -n 1)
        if [ -z "$rule_idx" ]; then
            uci add firewall rule >/dev/null
            uci set firewall.@rule[-1].name='mark_subnet6'
            uci set firewall.@rule[-1].src='lan'
            uci set firewall.@rule[-1].dest='*'
            uci set firewall.@rule[-1].proto='all'
            uci set firewall.@rule[-1].ipset='vpn_subnets6'
            uci set firewall.@rule[-1].set_mark='0x1'
            uci set firewall.@rule[-1].target='MARK'
            uci set firewall.@rule[-1].family='ipv6'
        else
            uci set firewall.@rule[$rule_idx].src='lan'
            uci set firewall.@rule[$rule_idx].dest='*'
            uci set firewall.@rule[$rule_idx].proto='all'
            uci set firewall.@rule[$rule_idx].ipset='vpn_subnets6'
            uci set firewall.@rule[$rule_idx].set_mark='0x1'
            uci set firewall.@rule[$rule_idx].target='MARK'
            uci set firewall.@rule[$rule_idx].family='ipv6'
        fi
        uci commit firewall
    }

    [ -n "$DOMAINS_URL" ] || echo "Warning: domain list URL is empty / URL списка доменов пустой"

    if [ -n "$IPV4_URL" ]; then
        configure_ipv4_cidr_firewall
    else
        remove_firewall_section_by_name ipset vpn_subnets
        remove_firewall_section_by_name rule mark_subnet
        uci commit firewall
    fi

    if [ "$IPV6_SUPPORT" = "1" ]; then
        uci -q delete dhcp.@dnsmasq[0].filter_aaaa
        uci commit dhcp
        configure_ipv6_domain_firewall
        if [ -n "$IPV6_URL" ]; then
            configure_ipv6_cidr_firewall
        else
            remove_firewall_section_by_name ipset vpn_subnets6
            remove_firewall_section_by_name rule mark_subnet6
            uci commit firewall
        fi
    else
        echo "IPv6 disabled: dnsmasq will filter AAAA answers / IPv6 отключён: dnsmasq будет фильтровать AAAA"
        uci set dhcp.@dnsmasq[0].filter_aaaa='1'
        uci commit dhcp
        remove_firewall_section_by_name ipset vpn_domains6
        remove_firewall_section_by_name rule mark_domains6
        remove_firewall_section_by_name ipset vpn_subnets6
        remove_firewall_section_by_name rule mark_subnet6
        uci commit firewall
        IPV6_URL=""
    fi

    mkdir -p /etc/domain-routing
    cat << EOF > /etc/domain-routing-user.conf
DOMAINS_URL='$DOMAINS_URL'
IPV4_URL='$IPV4_URL'
IPV6_URL='$IPV6_URL'
IPV6_SUPPORT='$IPV6_SUPPORT'
EOF

    printf "\033[32;1mCreate script /etc/init.d/getdomains\033[0m\n"
cat << 'EOF' > /etc/init.d/getdomains
#!/bin/sh /etc/rc.common

START=99
CACHE_DIR="/etc/domain-routing/lists"
TMP_DNSMASQ_DIR="/tmp/dnsmasq.d"
TMP_LIST_DIR="/tmp/lst"

load_config() {
    [ -f /etc/domain-routing-user.conf ] && . /etc/domain-routing-user.conf
    DOMAINS_URL=${DOMAINS_URL:-}
    IPV4_URL=${IPV4_URL:-}
    IPV6_URL=${IPV6_URL:-}
    IPV6_SUPPORT=${IPV6_SUPPORT:-0}
}

restore_cache() {
    cache="$1"; out="$2"; label="$3"
    if [ -s "$cache" ]; then
        cp "$cache" "$out"
        echo "Restored cached $label list"
    fi
}

download_file() {
    url="$1"; tmp="$2"; label="$3"
    [ -z "$url" ] && return 1
    echo "Downloading $label from $url"
    curl -L -f --connect-timeout 10 --retry 3 "$url" --output "$tmp"
}

validate_domain_list() {
    file="$1"
    [ -s "$file" ] || return 1
    dnsmasq --conf-file="$file" --test 2>&1 | grep -q "syntax check OK"
}

normalize_domain_list() {
    raw="$1"; out="$2"
    clean="$raw.clean"
    tr -d '\r' < "$raw" > "$clean"

    # If the file already contains dnsmasq-style tokens, split them into one directive per line.
    # This fixes GitHub files where nftset=/... entries were pasted in a single space-separated line.
    if grep -Eq '(^|[[:space:]])(nftset|ipset|server)=/' "$clean"; then
        awk -v ipv6="$IPV6_SUPPORT" '
            {
                sub(/[[:space:]]#.*$/, "", $0)
                for (i=1; i<=NF; i++) {
                    token=$i
                    if (token ~ /^(nftset|ipset|server)=\//) {
                        print token
                        if (ipv6 == "1" && token ~ /^nftset=\/.+\/4#inet#fw4#vpn_domains$/) {
                            t=token
                            sub(/\/4#inet#fw4#vpn_domains$/, "/6#inet#fw4#vpn_domains6", t)
                            print t
                        }
                    }
                }
            }
        ' "$clean" | sort -u > "$out"
        rm -f "$clean"
        [ -s "$out" ]
        return $?
    fi

    # Otherwise treat it as a simple domain list. It may be line-separated, comma-separated or space-separated.
    awk -v ipv6="$IPV6_SUPPORT" '
        {
            line=$0
            sub(/[[:space:]]#.*$/, "", line)
            gsub(/,/, " ", line)
            n=split(line, a, /[[:space:]]+/)
            for (i=1; i<=n; i++) {
                d=tolower(a[i])
                gsub(/^https?:\/\//, "", d)
                gsub(/^\/\//, "", d)
                sub(/\/.*$/, "", d)
                sub(/:.*/, "", d)
                gsub(/^\*\./, "", d)
                gsub(/^\./, "", d)
                if (d ~ /^[a-z0-9]([a-z0-9-]*\.)+[a-z0-9-]+$/) {
                    print "nftset=/"d"/4#inet#fw4#vpn_domains"
                    if (ipv6 == "1") print "nftset=/"d"/6#inet#fw4#vpn_domains6"
                }
            }
        }
    ' "$clean" | sort -u > "$out"
    rm -f "$clean"
    [ -s "$out" ]
}

normalize_ipv4_cidr_list() {
    raw="$1"; out="$2"
    tr -d '\r' < "$raw" | awk '
        {
            sub(/[[:space:]]#.*$/, "", $0)
            gsub(/,/, " ", $0)
            for (i=1; i<=NF; i++) {
                t=$i
                if (t ~ /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/[0-9]{1,2})?$/) print t
            }
        }
    ' | sort -u > "$out"
    [ -s "$out" ]
}

normalize_ipv6_cidr_list() {
    raw="$1"; out="$2"
    tr -d '\r' < "$raw" | awk '
        {
            sub(/[[:space:]]#.*$/, "", $0)
            gsub(/,/, " ", $0)
            for (i=1; i<=NF; i++) {
                t=tolower($i)
                if (t ~ /^[0-9a-f:]+(\/[0-9]{1,3})?$/ && t ~ /:/) print t
            }
        }
    ' | sort -u > "$out"
    [ -s "$out" ]
}

start () {
    load_config
    mkdir -p "$TMP_DNSMASQ_DIR" "$TMP_LIST_DIR" "$CACHE_DIR"

    # /tmp is cleared on reboot. Restore the last known good lists first,
    # then try to update from GitHub. If GitHub/DNS is unavailable at boot,
    # routing still works with the cached lists.
    restore_cache "$CACHE_DIR/domains.lst" "$TMP_DNSMASQ_DIR/domains.lst" domains
    restore_cache "$CACHE_DIR/ipv4.lst" "$TMP_LIST_DIR/ipv4.lst" ipv4
    restore_cache "$CACHE_DIR/ipv6.lst" "$TMP_LIST_DIR/ipv6.lst" ipv6

    if [ -n "$DOMAINS_URL" ]; then
        if download_file "$DOMAINS_URL" "$TMP_DNSMASQ_DIR/domains.raw" domains; then
            if normalize_domain_list "$TMP_DNSMASQ_DIR/domains.raw" "$TMP_DNSMASQ_DIR/domains.lst.new" && validate_domain_list "$TMP_DNSMASQ_DIR/domains.lst.new"; then
                mv "$TMP_DNSMASQ_DIR/domains.lst.new" "$TMP_DNSMASQ_DIR/domains.lst"
                cp "$TMP_DNSMASQ_DIR/domains.lst" "$CACHE_DIR/domains.lst"
                echo "Domain list is ready: $(wc -l < "$TMP_DNSMASQ_DIR/domains.lst") entries"
            else
                echo "Warning: downloaded domain list is invalid or empty after conversion; keeping cached list"
                rm -f "$TMP_DNSMASQ_DIR/domains.lst.new"
            fi
            rm -f "$TMP_DNSMASQ_DIR/domains.raw"
        else
            echo "Warning: failed to download domain list; using cached list if available"
            rm -f "$TMP_DNSMASQ_DIR/domains.raw" "$TMP_DNSMASQ_DIR/domains.lst.new"
        fi
    fi

    if [ -s "$TMP_DNSMASQ_DIR/domains.lst" ]; then
        if validate_domain_list "$TMP_DNSMASQ_DIR/domains.lst"; then
            /etc/init.d/dnsmasq restart
        else
            echo "Warning: cached domain list is invalid; removing temporary copy and keeping dnsmasq running without it"
            rm -f "$TMP_DNSMASQ_DIR/domains.lst"
        fi
    fi

    if [ -n "$IPV4_URL" ]; then
        if download_file "$IPV4_URL" "$TMP_LIST_DIR/ipv4.raw" ipv4; then
            if normalize_ipv4_cidr_list "$TMP_LIST_DIR/ipv4.raw" "$TMP_LIST_DIR/ipv4.lst.new"; then
                mv "$TMP_LIST_DIR/ipv4.lst.new" "$TMP_LIST_DIR/ipv4.lst"
                cp "$TMP_LIST_DIR/ipv4.lst" "$CACHE_DIR/ipv4.lst"
                echo "IPv4 CIDR list is ready: $(wc -l < "$TMP_LIST_DIR/ipv4.lst") entries"
            else
                echo "Warning: IPv4 list is invalid or empty after conversion; using cached list if available"
                rm -f "$TMP_LIST_DIR/ipv4.lst.new"
            fi
            rm -f "$TMP_LIST_DIR/ipv4.raw"
        else
            echo "Warning: IPv4 list download failed; using cached list if available"
            rm -f "$TMP_LIST_DIR/ipv4.raw" "$TMP_LIST_DIR/ipv4.lst.new"
        fi
        [ -e "$TMP_LIST_DIR/ipv4.lst" ] || : > "$TMP_LIST_DIR/ipv4.lst"
    fi

    if [ "$IPV6_SUPPORT" = "1" ] && [ -n "$IPV6_URL" ]; then
        if download_file "$IPV6_URL" "$TMP_LIST_DIR/ipv6.raw" ipv6; then
            if normalize_ipv6_cidr_list "$TMP_LIST_DIR/ipv6.raw" "$TMP_LIST_DIR/ipv6.lst.new"; then
                mv "$TMP_LIST_DIR/ipv6.lst.new" "$TMP_LIST_DIR/ipv6.lst"
                cp "$TMP_LIST_DIR/ipv6.lst" "$CACHE_DIR/ipv6.lst"
                echo "IPv6 CIDR list is ready: $(wc -l < "$TMP_LIST_DIR/ipv6.lst") entries"
            else
                echo "Warning: IPv6 list is invalid or empty after conversion; using cached list if available"
                rm -f "$TMP_LIST_DIR/ipv6.lst.new"
            fi
            rm -f "$TMP_LIST_DIR/ipv6.raw"
        else
            echo "Warning: IPv6 list download failed; using cached list if available"
            rm -f "$TMP_LIST_DIR/ipv6.raw" "$TMP_LIST_DIR/ipv6.lst.new"
        fi
        [ -e "$TMP_LIST_DIR/ipv6.lst" ] || : > "$TMP_LIST_DIR/ipv6.lst"
    fi

    /etc/init.d/firewall restart >/dev/null 2>&1 || true
    /etc/init.d/vpnroute start >/dev/null 2>&1 || true
}
EOF

    chmod +x /etc/init.d/getdomains
    /etc/init.d/getdomains enable

    sed -i '/getdomains start/d' /etc/crontabs/root 2>/dev/null || true
    echo "0 2 * * * /etc/init.d/getdomains start" >> /etc/crontabs/root
    /etc/init.d/cron enable
    /etc/init.d/cron restart

    /etc/init.d/getdomains start
}

add_internal_wg() {
    PROTOCOL_NAME=$1
    printf "\033[32;1mConfigure ${PROTOCOL_NAME}\033[0m\n"
    if [ "$PROTOCOL_NAME" = 'Wireguard' ]; then
        INTERFACE_NAME="wg1"
        CONFIG_NAME="wireguard_wg1"
        PROTO="wireguard"
        ZONE_NAME="wg_internal"

        if pkg_is_installed wireguard-tools; then
            echo "Wireguard already installed"
        else
            echo "Installed wg..."
            pkg_install wireguard-tools
        fi
    fi

    if [ "$PROTOCOL_NAME" = 'AmneziaWG' ]; then
        INTERFACE_NAME="awg1"
        CONFIG_NAME="amneziawg_awg1"
        PROTO="amneziawg"
        ZONE_NAME="awg_internal"

        install_awg_packages
    fi

    read -r -p "Enter the private key (from [Interface]):"$'\n' WG_PRIVATE_KEY_INT

    while true; do
        read -r -p "Enter internal IP address with subnet, example 192.168.100.5/24 (from [Interface]):"$'\n' WG_IP
        if echo "$WG_IP" | egrep -oq '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]+$'; then
            break
        else
            echo "This IP is not valid. Please repeat"
        fi
    done

    read -r -p "Enter the public key (from [Peer]):"$'\n' WG_PUBLIC_KEY_INT
    read -r -p "If use PresharedKey, Enter this (from [Peer]). If your don't use leave blank:"$'\n' WG_PRESHARED_KEY_INT
    read -r -p "Enter Endpoint host without port (Domain or IP) (from [Peer]):"$'\n' WG_ENDPOINT_INT

    read -r -p "Enter Endpoint host port (from [Peer]) [51820]:"$'\n' WG_ENDPOINT_PORT_INT
    WG_ENDPOINT_PORT_INT=${WG_ENDPOINT_PORT_INT:-51820}
    if [ "$WG_ENDPOINT_PORT_INT" = '51820' ]; then
        echo $WG_ENDPOINT_PORT_INT
    fi

    if [ "$PROTOCOL_NAME" = 'AmneziaWG' ]; then
        read -r -p "Enter Jc value (from [Interface]):"$'\n' AWG_JC
        read -r -p "Enter Jmin value (from [Interface]):"$'\n' AWG_JMIN
        read -r -p "Enter Jmax value (from [Interface]):"$'\n' AWG_JMAX
        read -r -p "Enter S1 value (from [Interface]):"$'\n' AWG_S1
        read -r -p "Enter S2 value (from [Interface]):"$'\n' AWG_S2
        read -r -p "Enter H1 value (from [Interface]):"$'\n' AWG_H1
        read -r -p "Enter H2 value (from [Interface]):"$'\n' AWG_H2
        read -r -p "Enter H3 value (from [Interface]):"$'\n' AWG_H3
        read -r -p "Enter H4 value (from [Interface]):"$'\n' AWG_H4
    fi
    
    uci set network.${INTERFACE_NAME}=interface
    uci set network.${INTERFACE_NAME}.proto=$PROTO
    uci set network.${INTERFACE_NAME}.private_key=$WG_PRIVATE_KEY_INT
    uci set network.${INTERFACE_NAME}.listen_port='51821'
    uci set network.${INTERFACE_NAME}.addresses=$WG_IP

    if [ "$PROTOCOL_NAME" = 'AmneziaWG' ]; then
        uci set network.${INTERFACE_NAME}.awg_jc=$AWG_JC
        uci set network.${INTERFACE_NAME}.awg_jmin=$AWG_JMIN
        uci set network.${INTERFACE_NAME}.awg_jmax=$AWG_JMAX
        uci set network.${INTERFACE_NAME}.awg_s1=$AWG_S1
        uci set network.${INTERFACE_NAME}.awg_s2=$AWG_S2
        uci set network.${INTERFACE_NAME}.awg_h1=$AWG_H1
        uci set network.${INTERFACE_NAME}.awg_h2=$AWG_H2
        uci set network.${INTERFACE_NAME}.awg_h3=$AWG_H3
        uci set network.${INTERFACE_NAME}.awg_h4=$AWG_H4
    fi

    if ! uci show network | grep -q ${CONFIG_NAME}; then
        uci add network ${CONFIG_NAME}
    fi

    uci set network.@${CONFIG_NAME}[0]=$CONFIG_NAME
    uci set network.@${CONFIG_NAME}[0].name="${INTERFACE_NAME}_client"
    uci set network.@${CONFIG_NAME}[0].public_key=$WG_PUBLIC_KEY_INT
    uci set network.@${CONFIG_NAME}[0].preshared_key=$WG_PRESHARED_KEY_INT
    uci set network.@${CONFIG_NAME}[0].route_allowed_ips='0'
    uci set network.@${CONFIG_NAME}[0].persistent_keepalive='25'
    uci set network.@${CONFIG_NAME}[0].endpoint_host=$WG_ENDPOINT_INT
    uci set network.@${CONFIG_NAME}[0].allowed_ips='0.0.0.0/0'
    uci set network.@${CONFIG_NAME}[0].endpoint_port=$WG_ENDPOINT_PORT_INT
    uci commit network

    grep -q "110 vpninternal" /etc/iproute2/rt_tables || echo '110 vpninternal' >> /etc/iproute2/rt_tables

    if ! uci show network | grep -q mark0x2; then
        printf "\033[32;1mConfigure mark rule\033[0m\n"
        uci add network rule
        uci set network.@rule[-1].name='mark0x2'
        uci set network.@rule[-1].mark='0x2'
        uci set network.@rule[-1].priority='110'
        uci set network.@rule[-1].lookup='vpninternal'
        uci commit
    fi

    if ! uci show network | grep -q vpn_route_internal; then
        printf "\033[32;1mAdd route\033[0m\n"
        uci set network.vpn_route_internal=route
        uci set network.vpn_route_internal.name='vpninternal'
        uci set network.vpn_route_internal.interface=$INTERFACE_NAME
        uci set network.vpn_route_internal.table='vpninternal'
        uci set network.vpn_route_internal.target='0.0.0.0/0'
        uci commit network
    fi

    if ! uci show firewall | grep -q "@zone.*name='${ZONE_NAME}'"; then
        printf "\033[32;1mZone Create\033[0m\n"
        uci add firewall zone
        uci set firewall.@zone[-1].name=$ZONE_NAME
        uci set firewall.@zone[-1].network=$INTERFACE_NAME
        uci set firewall.@zone[-1].forward='REJECT'
        uci set firewall.@zone[-1].output='ACCEPT'
        uci set firewall.@zone[-1].input='REJECT'
        uci set firewall.@zone[-1].masq='1'
        uci set firewall.@zone[-1].mtu_fix='1'
        uci set firewall.@zone[-1].family='ipv4'
        uci commit firewall
    fi

    if ! uci show firewall | grep -q "@forwarding.*name='${ZONE_NAME}'"; then
        printf "\033[32;1mConfigured forwarding\033[0m\n"
        uci add firewall forwarding
        uci set firewall.@forwarding[-1]=forwarding
        uci set firewall.@forwarding[-1].name="${ZONE_NAME}-lan"
        uci set firewall.@forwarding[-1].dest=${ZONE_NAME}
        uci set firewall.@forwarding[-1].src='lan'
        uci set firewall.@forwarding[-1].family='ipv4'
        uci commit firewall
    fi

    if uci show firewall | grep -q "@ipset.*name='vpn_domains_internal'"; then
        printf "\033[32;1mSet already exist\033[0m\n"
    else
        printf "\033[32;1mCreate set\033[0m\n"
        uci add firewall ipset
        uci set firewall.@ipset[-1].name='vpn_domains_internal'
        uci set firewall.@ipset[-1].match='dst_net'
        uci commit firewall
    fi

    if uci show firewall | grep -q "@rule.*name='mark_domains_intenal'"; then
        printf "\033[32;1mRule for set already exist\033[0m\n"
    else
        printf "\033[32;1mCreate rule set\033[0m\n"
        uci add firewall rule
        uci set firewall.@rule[-1]=rule
        uci set firewall.@rule[-1].name='mark_domains_intenal'
        uci set firewall.@rule[-1].src='lan'
        uci set firewall.@rule[-1].dest='*'
        uci set firewall.@rule[-1].proto='all'
        uci set firewall.@rule[-1].ipset='vpn_domains_internal'
        uci set firewall.@rule[-1].set_mark='0x2'
        uci set firewall.@rule[-1].target='MARK'
        uci set firewall.@rule[-1].family='ipv4'
        uci commit firewall
    fi

    if uci show dhcp | grep -q "@ipset.*name='vpn_domains_internal'"; then
        printf "\033[32;1mDomain on vpn_domains_internal already exist\033[0m\n"
    else
        printf "\033[32;1mCreate domain for vpn_domains_internal\033[0m\n"
        uci add dhcp ipset
        uci add_list dhcp.@ipset[-1].name='vpn_domains_internal'
        uci add_list dhcp.@ipset[-1].domain='youtube.com'
        uci add_list dhcp.@ipset[-1].domain='googlevideo.com'
        uci add_list dhcp.@ipset[-1].domain='youtubekids.com'
        uci add_list dhcp.@ipset[-1].domain='googleapis.com'
        uci add_list dhcp.@ipset[-1].domain='ytimg.com'
        uci add_list dhcp.@ipset[-1].domain='ggpht.com'
        uci commit dhcp
    fi

    sed -i "/done/a sed -i '/youtube.com\\\|ytimg.com\\\|ggpht.com\\\|googlevideo.com\\\|googleapis.com\\\|youtubekids.com/d' /tmp/dnsmasq.d/domains.lst" "/etc/init.d/getdomains"

    service dnsmasq restart
    service network restart

    exit 0
}

install_awg_packages() {
    AWG_INSTALLER_URL="https://raw.githubusercontent.com/Slava-Shchipunov/awg-openwrt/refs/heads/master/amneziawg-install.sh"
    AWG_INSTALLER="/tmp/amneziawg-install.sh"

    awg_already_installed() {
        command -v awg >/dev/null 2>&1 && {
            [ -f /lib/netifd/proto/amneziawg.sh ] || [ -f /lib/netifd/proto/awg.sh ] || opkg list-installed 2>/dev/null | grep -qiE 'luci-proto-amneziawg|amneziawg';
        }
    }

    if awg_already_installed; then
        echo "AmneziaWG packages already installed, skipping package installer."
        AWG_VERSION="2.0"
        return 0
    fi

    echo "Installing AmneziaWG packages / Установка пакетов AmneziaWG..."
    if command -v wget >/dev/null 2>&1; then
        wget -4 -O "$AWG_INSTALLER" "$AWG_INSTALLER_URL" || wget -O "$AWG_INSTALLER" "$AWG_INSTALLER_URL"
    else
        curl -L -4 -o "$AWG_INSTALLER" "$AWG_INSTALLER_URL" || curl -L -o "$AWG_INSTALLER" "$AWG_INSTALLER_URL"
    fi

    if [ ! -s "$AWG_INSTALLER" ]; then
        echo "Error downloading AmneziaWG installer. Check internet/GitHub/date on router."
        exit 1
    fi

    sh "$AWG_INSTALLER" -n
    AWG_RC="$?"

    if [ "$AWG_RC" -ne 0 ]; then
        if awg_already_installed; then
            echo "Warning: AmneziaWG installer returned error $AWG_RC, but awg command/proto exists. Continuing."
        else
            echo ""
            echo "AmneziaWG package installation failed."
            echo "Most common reasons: OpenWrt package repository is temporarily unreachable, IPv6/DNS issue, or missing packages for this build."
            echo "Try: opkg update; opkg install ca-certificates ca-bundle libustream-mbedtls; then run installer again."
            exit 1
        fi
    fi

    VERSION=$(ubus call system board | jsonfilter -e '@.release.version')
    MAJOR_VERSION=$(echo "$VERSION" | cut -d '.' -f 1)
    MINOR_VERSION=$(echo "$VERSION" | cut -d '.' -f 2)
    PATCH_VERSION=$(echo "$VERSION" | cut -d '.' -f 3)
    AWG_VERSION="1.0"
    if [ "$MAJOR_VERSION" -gt 24 ] || \
       [ "$MAJOR_VERSION" -eq 24 -a "$MINOR_VERSION" -gt 10 ] || \
       [ "$MAJOR_VERSION" -eq 24 -a "$MINOR_VERSION" -eq 10 -a "$PATCH_VERSION" -ge 3 ] || \
       [ "$MAJOR_VERSION" -eq 23 -a "$MINOR_VERSION" -eq 5 -a "$PATCH_VERSION" -ge 6 ]; then
        AWG_VERSION="2.0"
    fi
    echo "Detected AmneziaWG protocol generation: $AWG_VERSION"
}

# System Details
MODEL=$(cat /tmp/sysinfo/model)
source /etc/os-release
printf "\033[34;1mModel: $MODEL\033[0m\n"
printf "\033[34;1mVersion: $OPENWRT_RELEASE\033[0m\n"

VERSION_ID=$(echo $VERSION | awk -F. '{print $1}')

if [ "$VERSION_ID" -ne 23 ] && [ "$VERSION_ID" -ne 24 ] && [ "$VERSION_ID" -ne 25 ]; then
    printf "\033[31;1mScript supports OpenWrt 23.05, 24.10 and experimental 25.x.\033[0m\n"
    echo "For older OpenWrt versions use manual configuration."
    exit 1
fi

printf "\033[31;1mAll actions performed here cannot be rolled back automatically.\033[0m\n"

if [ "$1" = "--update" ] || [ "${ROUTING_OPENWRT_UPDATE_ONLY:-0}" = "1" ]; then
    update_existing_installation
    exit 0
fi

check_repo

add_packages

add_tunnel

add_mark

add_zone

show_manual

add_set

dnsmasqfull

dnsmasqconfdir

# DNS redirect is intentionally OFF by default. It can be added later as an optional menu item.
# ensure_lan_dns_redirect

# DNSCrypt2/Stubby interactive selection was removed.
# The script keeps the router's existing upstream DNS settings and only configures dnsmasq/nftset routing.
# add_dns_resolver

install_management_commands

add_getdomains

printf "\033[32;1mRestart network\033[0m\n"
/etc/init.d/network restart

printf "\033[32;1mDone\033[0m\n"
