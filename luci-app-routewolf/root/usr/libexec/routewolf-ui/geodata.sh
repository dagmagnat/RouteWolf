#!/bin/sh
# Read only flattened domain/suffix and CIDR rules from a bounded JSON rule-set.
set -e
set -f
umask 077
. /usr/share/libubox/jshn.sh
lib=/usr/libexec/routewolf-ui

kind=$1 category=$2
case "$kind" in geosite|geoip) ;; *) exit 2 ;; esac
case "$category" in ''|*[!a-z0-9_@.-]*|.*|-*) exit 2 ;; esac
[ "${#category}" -le 64 ] || exit 2

work=$(mktemp -d /tmp/routewolf-geodata.XXXXXX)
trap 'rm -rf "$work"' EXIT
url="https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/$kind/$category.json"
if command -v curl >/dev/null 2>&1; then
    (ulimit -f 256; exec curl -fsS --proto '=https' --connect-timeout 3 --max-time 9 --max-filesize 131072 "$url" -o "$work/source")
else
    (ulimit -f 256; exec /bin/uclient-fetch -T 9 -O "$work/source" "$url") >/dev/null 2>&1
fi
[ "$(wc -c < "$work/source")" -le 131072 ] || exit 1

json_load "$(cat "$work/source")"
json_get_var version version
case "$version" in 1|2|3|4) ;; *) exit 1 ;; esac
json_select rules
json_get_keys rule_ids || exit 1
: > "$work/raw"
skipped=0
for rule in $rule_ids; do
    json_select "$rule"
    json_get_keys properties || exit 1
    supported=1
    for field in $properties; do
        case "$kind:$field" in
            geosite:domain|geosite:domain_suffix|geoip:ip_cidr) ;;
            geosite:domain_keyword|geosite:domain_regex) skipped=$((skipped+1)) ;;
            *:type)
                json_get_var rule_type type
                [ "$rule_type" = default ] || supported=0
                ;;
            *) supported=0 ;;
        esac
    done
    if [ "$supported" = 1 ]; then
        for field in domain domain_suffix ip_cidr; do
            case "$kind:$field" in geosite:domain|geosite:domain_suffix|geoip:ip_cidr) ;; *) continue ;; esac
            field_type=
            json_get_type field_type "$field" || :
            case "$field_type" in
                array) json_get_values values "$field" ;;
                string) json_get_var values "$field" ;;
                *) continue ;;
            esac
            for entry in $values; do printf '%s\n' "$entry"; done >> "$work/raw"
        done
    else
        skipped=$((skipped+1))
    fi
    json_select ..
done

for field in domains ipv4 ipv6; do : > "$work/$field"; done
if [ "$kind" = geosite ]; then
    # Single labels (for example a whole TLD) are omitted from the common lists.
    sed 's/^\.//; /\./!d' "$work/raw" > "$work/input"
    "$lib/lists.sh" check domains "$work/input" | sort -u > "$work/domains"
else
    awk '!/:/' "$work/raw" > "$work/input4"
    awk '/:/' "$work/raw" > "$work/input6"
    "$lib/lists.sh" check ipv4 "$work/input4" | sort -u > "$work/ipv4"
    "$lib/lists.sh" check ipv6 "$work/input6" | sort -u > "$work/ipv6"
fi
large=0
for field in domains ipv4 ipv6; do
    if [ "$(wc -c < "$work/$field")" -gt 24576 ]; then
        large=1
        break
    fi
done
json_init
json_add_int skipped "$skipped"
json_add_boolean too_large "$large"
json_add_array entries
if [ "$large" = 0 ]; then
    for field in domains ipv4 ipv6; do
        while IFS= read -r entry; do
            json_add_object ''
            json_add_string kind "$field"
            json_add_string value "$entry"
            json_close_object
        done < "$work/$field"
    done
fi
json_close_array
json_dump
