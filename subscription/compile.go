package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

type object = map[string]any

const nodeName = "_routewolf_name"

func displayName(values ...any) string {
	for _, value := range values {
		runes := make([]rune, 0, 128)
		for _, r := range str(value) {
			if !unicode.IsControl(r) && !(r >= '\u202a' && r <= '\u202e') && !(r >= '\u2066' && r <= '\u2069') {
				runes = append(runes, r)
			}
			if len(runes) == 128 {
				break
			}
		}
		if name := strings.TrimSpace(string(runes)); name != "" {
			return name
		}
	}
	return ""
}

func jsonNodeName(out, profile object, single bool) string {
	tag := str(out["tag"])
	if single || tag == "proxy" || tag == "" {
		return displayName(out["remarks"], out["name"], profile["remarks"], profile["name"], out["tag"])
	}
	return displayName(out["remarks"], out["name"], out["tag"], profile["remarks"], profile["name"])
}

type group struct {
	Tag   string   `json:"tag"`
	Nodes []string `json:"nodes"`
}
type profile struct {
	nodes   map[string][]object
	order   []string
	bypass  map[string]string
	routing object
	xray    bool
	first   string
}

const maxSubscription = 1 << 20
const maxNodes = 32

var uuidPattern = regexp.MustCompile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
var hostPattern = regexp.MustCompile("^[a-zA-Z0-9.-]{1,253}$")
var tokenPattern = regexp.MustCompile("^[0-9a-f]{48}$")
var shortIDPattern = regexp.MustCompile("^([0-9a-fA-F]{2}){0,8}$")

func obj(v any) object  { x, _ := v.(map[string]any); return x }
func array(v any) []any { x, _ := v.([]any); return x }
func str(v any) string  { x, _ := v.(string); return x }
func flag(v any) bool   { x, _ := v.(bool); return x }
func integer(v any) int {
	switch x := v.(type) {
	case float64:
		if x == float64(int(x)) {
			return int(x)
		}
	case string:
		n, _ := strconv.Atoi(x)
		return n
	}
	return 0
}

func stringsOf(value any) ([]string, bool) {
	if s, ok := value.(string); ok {
		if s == "" {
			return nil, false
		}
		return []string{s}, true
	}
	items, ok := value.([]any)
	if !ok || len(items) == 0 || len(items) > 2048 {
		return nil, false
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		s, ok := item.(string)
		if !ok || s == "" || len(s) > 1024 {
			return nil, false
		}
		out = append(out, s)
	}
	return out, true
}

func allowedKeys(v object, keys ...string) bool {
	for k := range v {
		found := false
		for _, key := range keys {
			if key == k {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func publicServer(host string) bool {
	if addr, err := netip.ParseAddr(host); err == nil {
		addr = addr.Unmap()
		return addr.IsGlobalUnicast() && !addr.IsPrivate() &&
			!netip.MustParsePrefix("100.64.0.0/10").Contains(addr)
	}
	h := strings.ToLower(strings.TrimSuffix(host, "."))
	return hostPattern.MatchString(host) && strings.Contains(h, ".") && !strings.HasSuffix(h, ".localhost")
}

func base64Bytes(src string) ([]byte, error) {
	src = strings.Join(strings.Fields(src), "")
	for _, e := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if data, err := e.DecodeString(src); err == nil {
			return data, nil
		}
	}
	return nil, errors.New("invalid base64")
}

func simpleTLS(enabled bool, server, fingerprint string, skipVerify bool, reality object) object {
	if !enabled {
		return nil
	}
	result := object{"enabled": true}
	if server != "" {
		result["server_name"] = server
	}
	if fingerprint != "" {
		result["utls"] = object{"enabled": true, "fingerprint": fingerprint}
	}
	if skipVerify {
		result["insecure"] = true
	}
	if reality != nil {
		result["reality"] = reality
		if fingerprint == "" {
			result["utls"] = object{"enabled": true, "fingerprint": "chrome"}
		}
	}
	return result
}

func realityTLS(publicKey, shortID string) object {
	decoded, err := base64Bytes(publicKey)
	if err != nil || len(decoded) != 32 || !shortIDPattern.MatchString(shortID) {
		return nil
	}
	return object{"enabled": true, "public_key": publicKey, "short_id": shortID}
}

func basicTransport(kind, path, host, service string) (object, bool) {
	switch kind {
	case "", "tcp", "raw":
		return nil, true
	case "ws", "websocket":
		out := object{"type": "ws"}
		if path != "" {
			out["path"] = path
		}
		if host != "" {
			out["headers"] = object{"Host": host}
		}
		return out, true
	case "grpc":
		return object{"type": "grpc", "service_name": service}, true
	case "http", "h2":
		out := object{"type": "http"}
		if path != "" {
			out["path"] = path
		}
		if host != "" {
			out["host"] = strings.Split(host, ",")
		}
		return out, true
	case "httpupgrade":
		out := object{"type": "httpupgrade"}
		if path != "" {
			out["path"] = path
		}
		if host != "" {
			out["host"] = host
		}
		return out, true
	}
	return nil, false
}

func shareNode(line string) object {
	u, err := url.Parse(line)
	if err != nil || u.User == nil {
		return nil
	}
	host, port := u.Hostname(), integer(u.Port())
	if !publicServer(host) || port < 1 || port > 65535 {
		return nil
	}
	query := u.Query()
	result := object{"server": host, "server_port": port, nodeName: displayName(u.Fragment)}
	switch u.Scheme {
	case "vless":
		if !uuidPattern.MatchString(u.User.Username()) || (query.Get("encryption") != "" && query.Get("encryption") != "none") {
			return nil
		}
		result["type"], result["uuid"] = "vless", u.User.Username()
		if flow := query.Get("flow"); flow != "" {
			result["flow"] = flow
		}
	case "trojan", "hysteria2", "hy2":
		if u.User.Username() == "" {
			return nil
		}
		kind := u.Scheme
		if kind == "hy2" {
			kind = "hysteria2"
		}
		result["type"], result["password"] = kind, u.User.Username()
	default:
		return nil
	}
	security := query.Get("security")
	if security != "" && security != "none" && security != "tls" && security != "reality" {
		return nil
	}
	var reality object
	if security == "reality" {
		reality = realityTLS(query.Get("pbk"), query.Get("sid"))
		if reality == nil {
			return nil
		}
	}
	if network, ok := basicTransport(query.Get("type"), query.Get("path"), query.Get("host"), query.Get("serviceName")); !ok {
		return nil
	} else if network != nil {
		result["transport"] = network
	}
	if query.Get("headerType") != "" && query.Get("headerType") != "none" {
		return nil
	}
	if tls := simpleTLS(security == "tls" || reality != nil || result["type"] == "trojan" || result["type"] == "hysteria2", query.Get("sni"), query.Get("fp"), query.Get("allowInsecure") == "1", reality); tls != nil {
		if alpn := query.Get("alpn"); alpn != "" {
			tls["alpn"] = strings.Split(alpn, ",")
		}
		result["tls"] = tls
	}
	return result
}

func xrayNodes(source object) []object {
	kind := str(source["protocol"])
	settings, stream := obj(source["settings"]), obj(source["streamSettings"])
	if source["proxySettings"] != nil || source["sockopt"] != nil || str(obj(stream["sockopt"])["dialerProxy"]) != "" {
		return nil
	}
	security := str(stream["security"])
	var tls object
	switch security {
	case "", "none":
	case "tls":
		s := obj(stream["tlsSettings"])
		if s["certificates"] != nil || s["pinnedPeerCertificateChainSha256"] != nil {
			return nil
		}
		tls = simpleTLS(true, str(s["serverName"]), str(s["fingerprint"]), flag(s["allowInsecure"]), nil)
		if alpn, ok := stringsOf(s["alpn"]); ok {
			tls["alpn"] = alpn
		}
	case "reality":
		s := obj(stream["realitySettings"])
		reality := realityTLS(str(s["publicKey"]), str(s["shortId"]))
		if reality == nil {
			return nil
		}
		tls = simpleTLS(true, str(s["serverName"]), str(s["fingerprint"]), false, reality)
	default:
		return nil
	}
	kindOfTransport := str(stream["network"])
	if h := str(obj(obj(stream["tcpSettings"])["header"])["type"]); h != "" && h != "none" {
		return nil
	}
	if h := str(obj(obj(stream["rawSettings"])["header"])["type"]); h != "" && h != "none" {
		return nil
	}
	transportSettings := obj(stream[kindOfTransport+"Settings"])
	host := str(transportSettings["host"])
	if host == "" {
		host = str(obj(transportSettings["headers"])["Host"])
	}
	transport, ok := basicTransport(kindOfTransport, str(transportSettings["path"]), host, str(transportSettings["serviceName"]))
	if !ok {
		return nil
	}
	var nodes []object
	servers := array(settings["vnext"])
	if kind == "trojan" || kind == "shadowsocks" {
		servers = array(settings["servers"])
	}
	for _, raw := range servers {
		s := obj(raw)
		port := integer(s["port"])
		addr := str(s["address"])
		if !publicServer(addr) || port < 1 || port > 65535 {
			continue
		}
		entry := object{"type": kind, "server": addr, "server_port": port}
		if tls != nil {
			entry["tls"] = tls
		}
		if transport != nil {
			entry["transport"] = transport
		}
		switch kind {
		case "vless", "vmess":
			for _, value := range array(s["users"]) {
				user := obj(value)
				uuid := str(user["id"])
				if !uuidPattern.MatchString(uuid) {
					continue
				}
				if kind == "vless" && str(user["encryption"]) != "" && str(user["encryption"]) != "none" {
					continue
				}
				n := clone(entry)
				n["uuid"] = uuid
				if flow := str(user["flow"]); flow != "" {
					n["flow"] = flow
				}
				if kind == "vmess" {
					security := str(user["security"])
					if security == "" {
						security = "auto"
					}
					n["security"], n["alter_id"] = security, integer(user["alterId"])
				}
				nodes = append(nodes, n)
			}
		case "trojan", "shadowsocks":
			if pass := str(s["password"]); pass != "" {
				entry["password"] = pass
			} else {
				continue
			}
			if kind == "shadowsocks" {
				method := str(s["method"])
				if method == "" {
					continue
				}
				entry["method"] = method
			}
			nodes = append(nodes, entry)
		}
	}
	return nodes
}

func clone(v object) object {
	n := object{}
	for k, value := range v {
		n[k] = value
	}
	return n
}

func nativeNode(source object) object {
	kind := str(source["type"])
	addr := str(source["server"])
	port := integer(source["server_port"])
	if !publicServer(addr) || port < 1 || port > 65535 {
		return nil
	}
	switch kind {
	case "vless", "trojan", "shadowsocks", "vmess", "hysteria2", "tuic", "socks", "http":
	default:
		return nil
	}
	if !allowedKeys(source, "tag", "type", "server", "server_port", "uuid", "password", "username", "flow",
		"packet_encoding", "tls", "transport", "method", "security", "alter_id", "global_padding", "authenticated_length",
		"up_mbps", "down_mbps", "obfs", "congestion_control", "udp_relay_mode", "zero_rtt_handshake", "network", "version") {
		return nil
	}
	tls := obj(source["tls"])
	if !allowedKeys(tls, "enabled", "server_name", "insecure", "alpn", "min_version", "max_version", "utls", "reality", "disable_sni") {
		return nil
	}
	if !allowedKeys(obj(tls["utls"]), "enabled", "fingerprint") || !allowedKeys(obj(tls["reality"]), "enabled", "public_key", "short_id") {
		return nil
	}
	if !allowedKeys(obj(source["transport"]), "type", "path", "host", "headers", "service_name", "max_early_data", "early_data_header_name", "method", "idle_timeout", "ping_timeout") {
		return nil
	}
	if !allowedKeys(obj(source["obfs"]), "type", "password") {
		return nil
	}
	result := clone(source)
	delete(result, "tag")
	return result
}

func parseJSONProfile(raw object) profile {
	p := profile{nodes: map[string][]object{}, bypass: map[string]string{}}
	p.routing = obj(raw["route"])
	if x := obj(raw["routing"]); x != nil {
		p.xray, p.routing = true, x
	}
	outbounds := array(raw["outbounds"])
	for _, value := range outbounds {
		out := obj(value)
		tag := str(out["tag"])
		if tag == "" {
			tag = "proxy"
		}
		if p.first == "" {
			p.first = tag
		}
		kind := str(out["type"])
		if protocol := str(out["protocol"]); protocol != "" {
			p.xray = true
			kind = protocol
		}
		switch kind {
		case "direct", "freedom":
			if p.xray {
				settings := obj(out["settings"])
				if !allowedKeys(settings, "domainStrategy") || (str(settings["domainStrategy"]) != "" && str(settings["domainStrategy"]) != "AsIs") {
					continue
				}
			} else if !allowedKeys(out, "type", "tag") {
				continue
			}
			p.bypass[tag] = "rw-direct"
		case "block", "blackhole":
			p.bypass[tag] = "reject"
		default:
			name := jsonNodeName(out, raw, len(outbounds) == 1)
			if p.xray {
				nodes := xrayNodes(out)
				for _, node := range nodes {
					node[nodeName] = name
				}
				p.nodes[tag] = append(p.nodes[tag], nodes...)
			} else if node := nativeNode(out); node != nil {
				node[nodeName] = name
				p.nodes[tag] = append(p.nodes[tag], node)
			}
			p.order = append(p.order, tag)
		}
	}
	return p
}

func parseInput(data []byte) ([]profile, error) {
	if len(data) == 0 || len(data) > maxSubscription {
		return nil, errors.New("subscription must be between 1 byte and 1 MiB")
	}
	data = bytes.TrimSpace(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf}))
	parseJSON := func(data []byte) []profile {
		var root any
		if json.Unmarshal(data, &root) != nil {
			return nil
		}
		if m := obj(root); m != nil {
			root = []any{m}
		}
		var profiles []profile
		for _, item := range array(root) {
			if m := obj(item); m != nil && array(m["outbounds"]) != nil {
				profiles = append(profiles, parseJSONProfile(m))
			}
		}
		return profiles
	}
	if profiles := parseJSON(data); len(profiles) != 0 {
		return profiles, nil
	}
	if decoded, err := base64Bytes(string(data)); err == nil && len(decoded) > 0 {
		data = decoded
		if profiles := parseJSON(data); len(profiles) != 0 {
			return profiles, nil
		}
	}
	p := profile{nodes: map[string][]object{}, order: []string{"proxy"}}
	for _, line := range strings.Split(string(data), "\n") {
		if node := shareNode(strings.TrimSpace(line)); node != nil {
			p.nodes["proxy"] = append(p.nodes["proxy"], node)
		}
	}
	if len(p.nodes["proxy"]) == 0 {
		return nil, errors.New("no supported servers in subscription")
	}
	return []profile{p}, nil
}

type compiled struct {
	Config object
	Groups []group
	Nodes  int
	Names  map[string]string
}

func compile(data []byte, mode, secret string) (compiled, error) {
	if mode != "full" && mode != "routewolf" && mode != "json" {
		return compiled{}, errors.New("unknown routing mode")
	}
	if !tokenPattern.MatchString(secret) {
		return compiled{}, errors.New("invalid local API secret")
	}
	profiles, err := parseInput(data)
	if err != nil {
		return compiled{}, err
	}
	result := compiled{Names: map[string]string{}}
	outbounds := []object{{"type": "direct", "tag": "rw-direct"}}
	byTag := map[string][]string{}
	var order []string
	for _, p := range profiles {
		for _, name := range p.order {
			tag := name
			if mode != "json" {
				tag = "proxy"
			}
			for _, node := range p.nodes[name] {
				if result.Nodes >= maxNodes {
					return compiled{}, errors.New("subscription has more than 32 usable servers")
				}
				if _, found := byTag[tag]; !found {
					order = append(order, tag)
				}
				result.Nodes++
				n := clone(node)
				id := fmt.Sprintf("rw-node-%d", result.Nodes)
				if name := str(n[nodeName]); name != "" {
					result.Names[id] = name
				}
				delete(n, nodeName)
				n["tag"] = id
				outbounds = append(outbounds, n)
				byTag[tag] = append(byTag[tag], id)
			}
			// Multiple entries with the same source tag are represented once.
			delete(p.nodes, name)
		}
	}
	if result.Nodes == 0 {
		return compiled{}, errors.New("no public, compatible proxy servers in subscription (loopback placeholders are ignored)")
	}
	targets := map[string]string{}
	for _, name := range order {
		tag := fmt.Sprintf("rw-group-%d", len(result.Groups)+1)
		nodes := byTag[name]
		targets[name] = tag
		result.Groups = append(result.Groups, group{tag, nodes})
		outbounds = append(outbounds, object{"type": "selector", "tag": tag, "outbounds": append(append([]string{}, nodes...), "rw-direct"), "default": "rw-direct", "interrupt_exist_connections": true})
	}
	route := object{"auto_detect_interface": true, "default_domain_resolver": "rw-dns"}
	if mode == "json" {
		rules, final, err := compileRules(profiles, targets)
		if err != nil {
			return compiled{}, err
		}
		route["rules"], route["final"] = rules, final
	} else {
		route["final"] = targets["proxy"]
	}
	result.Config = object{
		"log":       object{"level": "warn"},
		"dns":       object{"servers": []object{{"type": "local", "tag": "rw-dns"}}, "final": "rw-dns"},
		"inbounds":  []object{{"type": "tun", "tag": "rw-tun", "interface_name": "rwsub0", "address": []string{"198.18.79.1/30", "fdfe:dcba:9876:79::1/126"}, "mtu": 1280, "auto_route": false, "strict_route": false, "stack": "system"}},
		"outbounds": outbounds, "route": route,
		"experimental": object{"clash_api": object{"external_controller": "127.0.0.1:19095", "secret": secret}},
	}
	return result, nil
}

func stringsSorted(v []string) []string { sort.Strings(v); return v }
func portFields(raw any) ([]int, []string, error) {
	if raw == nil {
		return nil, nil, nil
	}
	var values []string
	if n := integer(raw); n > 0 {
		values = []string{strconv.Itoa(n)}
	} else if s := str(raw); s != "" {
		values = strings.Split(s, ",")
	} else {
		return nil, nil, errors.New("unsupported Xray port list")
	}
	var ports []int
	var ranges []string
	for _, item := range values {
		item = strings.TrimSpace(item)
		parts := strings.Split(item, "-")
		a := integer(parts[0])
		if a < 1 || a > 65535 {
			return nil, nil, errors.New("invalid Xray port")
		}
		if len(parts) == 1 {
			ports = append(ports, a)
			continue
		}
		if len(parts) != 2 || integer(parts[1]) < a || integer(parts[1]) > 65535 {
			return nil, nil, errors.New("invalid Xray port range")
		}
		ranges = append(ranges, fmt.Sprintf("%d:%d", a, integer(parts[1])))
	}
	return ports, ranges, nil
}

func xrayRule(source object) (object, string, error) {
	if !allowedKeys(source, "type", "domain", "ip", "port", "network", "protocol", "outboundTag") || str(source["type"]) != "field" {
		return nil, "", errors.New("JSON routing contains an unsupported Xray rule")
	}
	rule := object{}
	if value := source["domain"]; value != nil {
		domains, ok := stringsOf(value)
		if !ok {
			return nil, "", errors.New("invalid Xray domain rule")
		}
		buckets := map[string][]string{}
		for _, d := range domains {
			prefix, payload, has := strings.Cut(d, ":")
			if !has {
				prefix, payload = "plain", d
			}
			keys := map[string]string{"full": "domain", "domain": "domain_suffix", "regexp": "domain_regex", "plain": "domain_keyword"}
			key := keys[prefix]
			if key == "" || payload == "" {
				return nil, "", errors.New("JSON routing requires unsupported external Xray domain lists")
			}
			buckets[key] = append(buckets[key], payload)
		}
		for key, data := range buckets {
			rule[key] = stringsSorted(data)
		}
	}
	if value := source["ip"]; value != nil {
		ips, ok := stringsOf(value)
		if !ok {
			return nil, "", errors.New("invalid Xray IP rule")
		}
		for i, ip := range ips {
			if a, err := netip.ParseAddr(ip); err == nil {
				ips[i] = netip.PrefixFrom(a, a.BitLen()).String()
			} else if _, _, err := net.ParseCIDR(ip); err != nil {
				return nil, "", errors.New("JSON routing requires unsupported external Xray IP lists")
			}
		}
		rule["ip_cidr"] = stringsSorted(ips)
	}
	if ports, ranges, err := portFields(source["port"]); err != nil {
		return nil, "", err
	} else {
		if len(ports) > 0 {
			rule["port"] = ports
		}
		if len(ranges) > 0 {
			rule["port_range"] = ranges
		}
	}
	if n := str(source["network"]); n != "" {
		items := strings.Split(n, ",")
		for _, item := range items {
			if item != "tcp" && item != "udp" {
				return nil, "", errors.New("unsupported Xray network rule")
			}
		}
		rule["network"] = items
	}
	if value := source["protocol"]; value != nil {
		types, ok := stringsOf(value)
		if !ok {
			return nil, "", errors.New("invalid Xray protocol match")
		}
		rule["protocol"] = types
	}
	if source["domain"] != nil && source["ip"] != nil {
		ip := object{"ip_cidr": rule["ip_cidr"]}
		delete(rule, "ip_cidr")
		rule = object{"type": "logical", "mode": "and", "rules": []object{rule, ip}}
	}
	return rule, str(source["outboundTag"]), nil
}

func nativeRule(source object, nested bool) (object, string, error) {
	if !allowedKeys(source, "type", "mode", "rules", "domain", "domain_suffix", "domain_keyword", "domain_regex", "ip_cidr", "ip_is_private",
		"source_ip_cidr", "source_ip_is_private", "port", "port_range", "source_port", "source_port_range", "network", "protocol", "ip_version",
		"invert", "outbound", "action") {
		return nil, "", errors.New("JSON routing contains an unsupported sing-box rule")
	}
	result := clone(source)
	delete(result, "outbound")
	delete(result, "action")
	action := str(source["action"])
	target := str(source["outbound"])
	if nested {
		if action != "" || target != "" {
			return nil, "", errors.New("invalid nested JSON rule")
		}
	} else if action == "reject" {
		target = "reject"
	} else if action != "" && action != "route" {
		return nil, "", errors.New("unsupported sing-box routing action")
	}
	if str(source["type"]) == "logical" {
		var items []object
		for _, child := range array(source["rules"]) {
			r, _, err := nativeRule(obj(child), true)
			if err != nil || len(r) == 0 {
				return nil, "", errors.New("invalid logical JSON rule")
			}
			items = append(items, r)
		}
		if len(items) == 0 {
			return nil, "", errors.New("empty logical JSON rule")
		}
		result["rules"] = items
	}
	return result, target, nil
}

func compileRules(profiles []profile, groups map[string]string) ([]object, string, error) {
	var first []byte
	var rules []object
	var final string
	for _, p := range profiles {
		if p.routing == nil {
			return nil, "", errors.New("JSON routing mode requires a JSON profile with routing rules")
		}
		if !allowedKeys(p.routing, "rules", "final", "domainStrategy", "auto_detect_interface", "default_domain_resolver") ||
			(str(p.routing["domainStrategy"]) != "" && str(p.routing["domainStrategy"]) != "AsIs") {
			return nil, "", errors.New("JSON routing includes a rule set, balancer or DNS strategy that cannot be preserved")
		}
		target := func(name string) string {
			if b := p.bypass[name]; b != "" {
				return b
			}
			return groups[name]
		}
		f := target(str(p.routing["final"]))
		if str(p.routing["final"]) == "" {
			f = target(p.first)
		}
		if f == "" || f == "reject" {
			return nil, "", errors.New("JSON default route does not refer to a supported outbound")
		}
		current := []object{{"action": "sniff", "timeout": "250ms"}}
		for _, value := range array(p.routing["rules"]) {
			source := obj(value)
			if source == nil {
				return nil, "", errors.New("invalid JSON route rule")
			}
			var r object
			var tag string
			var err error
			if p.xray {
				r, tag, err = xrayRule(source)
			} else {
				r, tag, err = nativeRule(source, false)
			}
			if err != nil {
				return nil, "", err
			}
			if len(r) == 0 {
				return nil, "", errors.New("empty JSON routing rule")
			}
			dest := target(tag)
			if !p.xray && tag == "reject" && str(source["action"]) == "reject" {
				dest = "reject"
			}
			if dest == "" {
				return nil, "", errors.New("JSON rule refers to an unsupported outbound")
			}
			if dest == "reject" {
				r["action"] = "reject"
			} else {
				r["action"], r["outbound"] = "route", dest
			}
			current = append(current, r)
		}
		signature, _ := json.Marshal([]any{current, f})
		if first == nil {
			first, rules, final = signature, current, f
		} else if !bytes.Equal(signature, first) {
			return nil, "", errors.New("JSON profiles contain different routing policies; choose RouteWolf or Full instead")
		}
	}
	return rules, final, nil
}
