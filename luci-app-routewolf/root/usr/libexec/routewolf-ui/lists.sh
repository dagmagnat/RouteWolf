#!/bin/sh
set -eu
umask 077
state=/etc/routewolf-ui
config=routewolf_ui
nft_file=$state/local-routes.nft
dns_file=$state/local-domains.conf
dns_link=/tmp/dnsmasq.d/routewolf-ui.conf

die() { printf '%s\n' "$*" >&2; exit 1; }

link_dns() {
    mkdir -p /tmp/dnsmasq.d
    if [ -s "$dns_file" ]; then
        # procd exposes the conf-dir inside dnsmasq's jail, not the source
        # file in /etc/routewolf-ui. Replace the old symlink with a real file.
        local copy
        copy=$(mktemp /tmp/dnsmasq.d/.routewolf-ui.XXXXXX) || return 1
        if ! cat "$dns_file" > "$copy" || ! mv -f "$copy" "$dns_link"; then
            rm -f "$copy"
            return 1
        fi
    else
        rm -f "$dns_link"
    fi
}

restart_dnsmasq() {
    /etc/init.d/dnsmasq restart || return 1
    # The init script hands off to procd, so a successful return does not
    # prove the daemon could open its files inside the jail.
    for delay in 1 2 3; do
        sleep "$delay"
        /etc/init.d/dnsmasq running && return 0
    done
    return 1
}
domains() {
    LC_ALL=C awk '
        { sub(/#.*/, ""); gsub(/^[ \t\r]+|[ \t\r]+$/, ""); if ($0=="") next }
        {
            name=tolower($0); sub(/\.$/, "", name)
            n=split(name, a, ".")
            # All fields are ASCII DNS labels. International names use Punycode.
            ok=n>=2 && length(name)<=253
            for(i=1;i<=n;i++) if (length(a[i])>63 || a[i]!~/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/) ok=0
            if(!ok || a[n]!~/[a-z]/) { print "Invalid domain on line " NR > "/dev/stderr"; bad=1; next }
            print name
        }
        END { exit bad }' "$1"
}

addresses() {
    family=$1
    LC_ALL=C awk -v kind="$family" '
        { sub(/#.*/, ""); gsub(/^[ \t\r]+|[ \t\r]+$/, ""); if ($0=="") next }
        {
            count=split($0, fields, "/")
            if (kind==4) {
                n=split(fields[1], parts, ".")
                ok=(n==4)
                for (i=1;i<=4;i++) if(parts[i]!~/^[0-9]+$/ || parts[i]>255 || (length(parts[i])>1 && substr(parts[i],1,1)=="0")) ok=0
            } else {
                ok=(fields[1]~/^[A-Fa-f0-9:]+$/ && fields[1]~/:/)
            }
            if (count>2 || (count==2 && (fields[2]!~/^[0-9]+$/ || fields[2]<1 || fields[2]>(kind==4?32:128)))) ok=0
            if(!ok) { print "Invalid IPv" kind " address on line " NR > "/dev/stderr"; bad=1; next }
            print tolower($0)
        }
        END { exit bad }' "$2"
}

render_lists() {
    path=$1; lan=$2; use6=$3; library=$4
    case "$lan" in ''|*[!A-Za-z0-9._-]*) die 'Could not determine the LAN interface.' ;; esac
    for list in domains ipv4 ipv6; do
        [ -e "$path/exclude-$list" ] || : > "$path/exclude-$list"
    done
    domains "$path/input-domains" > "$path/domains"
    domains "$path/exclude-domains" > "$path/excluded-domains"
    awk 'FILENAME==ARGV[1] {included[$0]=1; next} !included[$0]' \
        "$path/domains" "$path/excluded-domains" > "$path/without-domains"
    addresses 4 "$path/input-ipv4" > "$path/ipv4"
    addresses 6 "$path/input-ipv6" > "$path/ipv6"
    addresses 4 "$path/exclude-ipv4" > "$path/without-ipv4"
    addresses 6 "$path/exclude-ipv6" > "$path/without-ipv6"
    if [ "$use6" != 1 ] && { [ -s "$path/ipv6" ] || [ -s "$path/without-ipv6" ]; }; then
        die 'Enable IPv6 routing in RouteWolf before applying IPv6 entries.'
    fi
    : > "$path/dnsmasq.conf"
    : > "$path/rules.nft"
    for item in domains:d without-domains:e; do
        file=${item%:*}
        id=${item#*:}
        target="4#inet#fw4#rwui_${id}4"
        [ "$use6" != 1 ] || target="$target,6#inet#fw4#rwui_${id}6"
        if [ -s "$path/$file" ]; then
            sort -u "$path/$file" | while IFS= read -r domain; do
                printf 'nftset=/%s/%s\n' "$domain" "$target"
            done >> "$path/dnsmasq.conf"
        fi
    done
    if [ "$library" != 1 ] || [ -s "$path/dnsmasq.conf" ] ||
        [ -s "$path/ipv4" ] || [ -s "$path/ipv6" ] ||
        [ -s "$path/without-ipv4" ] || [ -s "$path/without-ipv6" ]; then
        {
            for family in 4 6; do
                printf 'set rwui_d%s { type ipv%s_addr; }\n' "$family" "$family"
                printf 'set rwui_e%s { type ipv%s_addr; }\n' "$family" "$family"
                for item in "ipv$family:i" "without-ipv$family:x"; do
                    file=${item%:*}
                    id=${item#*:}
                    printf 'set rwui_%s%s { type ipv%s_addr; flags interval; auto-merge;' "$id" "$family" "$family"
                    if [ -s "$path/$file" ]; then
                        printf ' elements = { %s };' "$(sort -u "$path/$file" | awk 'NR>1 { printf "," } { printf "%s", $0 }')"
                    fi
                    printf ' }\n'
                done
            done
            printf '%s\n' 'chain rwui_mark { type filter hook prerouting priority -149; policy accept;'
            if [ "$library" != 1 ]; then
                printf ' iifname "%s" meta mark set meta mark & 0xfffffffe\n' "$lan"
            fi
            for family in 4 6; do
                [ "$family" != 4 ] && ip=ip6 || ip=ip
                for set in e x; do
                    printf ' iifname "%s" %s daddr @rwui_%s%s meta mark set meta mark & 0xfffffffe\n' "$lan" "$ip" "$set" "$family"
                done
                for set in d i; do
                    printf ' iifname "%s" %s daddr @rwui_%s%s meta mark set meta mark | 1\n' "$lan" "$ip" "$set" "$family"
                done
            done
            printf '}\n'
        } > "$path/rules.nft"
        { printf '%s\n' 'table inet rwui_validate {'; cat "$path/rules.nft"; printf '}\n'; } |
            nft -c -f -
    fi
}

apply_lists() (
    [ -x /etc/init.d/routewolf ] || die 'Install RouteWolf before applying lists.'
    [ -z "$(uci changes firewall)" ] || die 'Save or revert pending firewall edits before applying lists.'
    temp=$(mktemp -d /tmp/routewolf-lists-ui.XXXXXX)
    changed=no
    success=no
    cleanup() {
        if [ "$changed" = yes ] && [ "$success" != yes ]; then
            uci -q revert firewall || :
            cp "$temp/firewall" /etc/config/firewall
            cp "$temp/old-rules" "$nft_file"
            cp "$temp/old-dns" "$dns_file"
            link_dns
            fw4 reload >/dev/null 2>&1 || :
            restart_dnsmasq >/dev/null 2>&1 || :
        fi
        rm -rf "$temp"
    }
    trap cleanup EXIT
    trap 'exit 1' HUP INT TERM

    for list in domains ipv4 ipv6; do
        uci -q get "$config.ui.$list" > "$temp/input-$list" || :
        uci -q get "$config.ui.exclude_$list" > "$temp/exclude-$list" || :
        for file in "$temp/input-$list" "$temp/exclude-$list"; do
            [ "$(wc -c < "$file")" -le 24576 ] || die 'List exceeds 24 KiB.'
        done
    done
    lan=$(ubus call network.interface.lan status | jsonfilter -e '@.l3_device')
    use6=$(sed -n "s/^IPV6_SUPPORT='\([01]\)'$/\1/p" /etc/routewolf/user.conf | head -n 1)
    library=$(uci -q get "$config.ui.project_lists" || echo 1)
    render_lists "$temp" "$lan" "${use6:-0}" "$library"
    mkdir -p "$state"
    cp /etc/config/firewall "$temp/firewall"
    for pair in rules dns; do
        file=$nft_file
        [ "$pair" != dns ] || file=$dns_file
        if [ -e "$file" ]; then cp "$file" "$temp/old-$pair"; else : > "$temp/old-$pair"; fi
    done
    if cmp -s "$temp/old-rules" "$temp/rules.nft" && cmp -s "$temp/old-dns" "$temp/dnsmasq.conf"; then
        printf '%s\n' 'Local lists are unchanged.'
        exit 0
    fi

    changed=yes
    cp "$temp/rules.nft" "$nft_file.new" && mv "$nft_file.new" "$nft_file"
    cp "$temp/dnsmasq.conf" "$dns_file.new" && mv "$dns_file.new" "$dns_file"
    if [ -s "$nft_file" ]; then
        uci set firewall.routewolf_ui_lists=include
        uci set firewall.routewolf_ui_lists.type=nftables
        uci set firewall.routewolf_ui_lists.position=table-post
        uci set firewall.routewolf_ui_lists.path="$nft_file"
    else
        uci -q delete firewall.routewolf_ui_lists || :
    fi
    fw4 check
    link_dns
    dnsmasq --test --conf-file=/dev/null --conf-dir=/tmp/dnsmasq.d
    uci commit firewall
    fw4 reload
    restart_dnsmasq || die 'dnsmasq did not start. Restoring previous lists and firewall settings.'
    success=yes
    printf '%s\n' 'Local lists applied.'
)

case "${1:-}" in
    apply) apply_lists ;;
    boot) link_dns ;;
    validate) render_lists "$2" "$3" "$4" "${5:-1}" ;;
    check)
        case "$2" in
            domains) domains "$3" ;;
            ipv4) addresses 4 "$3" ;;
            ipv6) addresses 6 "$3" ;;
            *) exit 2 ;;
        esac
        ;;
    *) exit 2 ;;
esac
