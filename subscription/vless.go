package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

const xrayProbePort = 18683

func xhttpExtraSafe(value any) bool {
	switch nested := value.(type) {
	case map[string]any:
		for key, field := range nested {
			switch strings.ToLower(key) {
			case "sockopt", "sockoptions", "dialerproxy", "certificatefile", "keyfile",
				"masterkeylog", "keylog", "interface", "pathfile":
				return false
			case "address":
				if !publicServer(str(field)) {
					return false
				}
			}
			if !xhttpExtraSafe(field) {
				return false
			}
		}
	case []any:
		for _, field := range nested {
			if !xhttpExtraSafe(field) {
				return false
			}
		}
	}
	return true
}

func xrayTransport(query url.Values) object {
	network, security := query.Get("type"), query.Get("security")
	if security == "" {
		security = "none"
	}
	stream := object{"security": security}
	path, host := query.Get("path"), query.Get("host")
	switch network {
	case "", "tcp", "raw":
		if header := query.Get("headerType"); header != "" && header != "none" {
			return nil
		}
		stream["network"] = "raw"
	case "xhttp", "splithttp":
		settings := object{"host": host, "path": path}
		switch mode := query.Get("mode"); mode {
		case "", "auto", "packet-up", "stream-up", "stream-one":
			if mode != "" {
				settings["mode"] = mode
			}
		default:
			return nil
		}
		if extra := query.Get("extra"); extra != "" {
			var values object
			if len(extra) > 4096 || json.Unmarshal([]byte(extra), &values) != nil || values == nil || !xhttpExtraSafe(values) {
				return nil
			}
			settings["extra"] = values
		}
		stream["network"], stream["xhttpSettings"] = "xhttp", settings
	case "ws", "websocket":
		stream["network"], stream["wsSettings"] = "ws", object{"host": host, "path": path}
	case "grpc":
		stream["network"], stream["grpcSettings"] = "grpc", object{
			"serviceName": query.Get("serviceName"), "authority": query.Get("authority"), "multiMode": query.Get("mode") == "multi",
		}
	case "httpupgrade":
		stream["network"], stream["httpupgradeSettings"] = "httpupgrade", object{"host": host, "path": path}
	default:
		return nil
	}
	name, fingerprint := query.Get("sni"), query.Get("fp")
	switch security {
	case "none":
	case "tls":
		settings := object{"serverName": name, "fingerprint": fingerprint}
		if protocols := query.Get("alpn"); protocols != "" {
			settings["alpn"] = strings.Split(protocols, ",")
		}
		stream["tlsSettings"] = settings
	case "reality":
		key, shortID := query.Get("pbk"), query.Get("sid")
		decoded, err := base64Bytes(key)
		if name == "" || err != nil || len(decoded) != 32 || !shortIDPattern.MatchString(shortID) {
			return nil
		}
		if fingerprint == "" {
			fingerprint = "chrome"
		}
		stream["realitySettings"] = object{
			"serverName": name, "fingerprint": fingerprint, "publicKey": key,
			"shortId": shortID, "spiderX": query.Get("spx"),
		}
	default:
		return nil
	}
	return stream
}

func xrayNode(link string) object {
	if len(link) > 8192 {
		return nil
	}
	u, err := url.Parse(link)
	if err != nil || u.Scheme != "vless" || u.User == nil || !uuidPattern.MatchString(u.User.Username()) || !publicServer(u.Hostname()) {
		return nil
	}
	if _, present := u.User.Password(); present {
		return nil
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return nil
	}
	query, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return nil
	}
	stream := xrayTransport(query)
	if stream == nil {
		return nil
	}
	encryption := query.Get("encryption")
	if encryption == "" {
		encryption = "none"
	}
	return object{
		"protocol": "vless", "streamSettings": stream, nodeName: displayName(u.Fragment),
		"settings": object{"vnext": []object{{
			"address": u.Hostname(), "port": port,
			"users": []object{{"id": u.User.Username(), "encryption": encryption, "flow": query.Get("flow")}},
		}}},
	}
}

// Keep only client transport fields that we can safely validate. A subscription
// may also contain listeners, routing, DNS, filesystem paths and API settings.
func xrayJSONStream(stream object) object {
	if !allowedKeys(stream, "network", "method", "security", "xhttpSettings", "splithttpSettings", "wsSettings",
		"grpcSettings", "httpupgradeSettings", "realitySettings", "tlsSettings") {
		return nil
	}
	query := url.Values{}
	network := str(stream["network"])
	if network == "" {
		network = str(stream["method"])
	}
	security := str(stream["security"])
	query.Set("type", network)
	query.Set("security", security)
	settings := obj(stream[network+"Settings"])
	if network == "websocket" {
		settings = obj(stream["wsSettings"])
	}
	switch network {
	case "xhttp", "splithttp":
		if settings == nil {
			settings = obj(stream["xhttpSettings"])
		}
		if !allowedKeys(settings, "path", "host", "mode", "extra", "headers", "xPaddingBytes",
			"noGRPCHeader", "noSSEHeader", "scMaxEachPostBytes", "scMaxBufferedPosts",
			"scMinPostsIntervalMs", "scStreamUpServerSecs", "xmux", "downloadSettings") {
			return nil
		}
		query.Set("mode", str(settings["mode"]))
		extras := object{}
		for key, value := range settings {
			switch key {
			case "path", "host", "mode", "extra":
			default:
				extras[key] = value
			}
		}
		if extra, present := settings["extra"]; present {
			if obj(extra) == nil {
				return nil
			}
			for key, value := range obj(extra) {
				extras[key] = value
			}
		}
		if len(extras) > 0 {
			encoded, err := json.Marshal(extras)
			if err != nil {
				return nil
			}
			query.Set("extra", string(encoded))
		}
	case "grpc":
		if !allowedKeys(settings, "serviceName", "authority", "multiMode") {
			return nil
		}
		query.Set("serviceName", str(settings["serviceName"]))
		query.Set("authority", str(settings["authority"]))
		if flag(settings["multiMode"]) {
			query.Set("mode", "multi")
		}
	case "ws", "websocket", "httpupgrade":
		if !allowedKeys(settings, "path", "host", "headers") {
			return nil
		}
		headers := obj(settings["headers"])
		if !allowedKeys(headers, "Host", "host") {
			return nil
		}
		if str(settings["host"]) == "" {
			query.Set("host", str(headers["Host"]))
			if query.Get("host") == "" {
				query.Set("host", str(headers["host"]))
			}
		}
	}
	query.Set("path", str(settings["path"]))
	if host := str(settings["host"]); host != "" {
		query.Set("host", host)
	}
	switch security {
	case "tls":
		tls := obj(stream["tlsSettings"])
		if !allowedKeys(tls, "serverName", "fingerprint", "alpn", "allowInsecure") {
			return nil
		}
		query.Set("sni", str(tls["serverName"]))
		query.Set("fp", str(tls["fingerprint"]))
		if raw := tls["alpn"]; raw != nil {
			alpn, ok := stringsOf(raw)
			if !ok {
				return nil
			}
			query.Set("alpn", strings.Join(alpn, ","))
		}
	case "reality":
		reality := obj(stream["realitySettings"])
		if !allowedKeys(reality, "serverName", "fingerprint", "publicKey", "password", "shortId", "spiderX", "show") {
			return nil
		}
		key := str(reality["publicKey"])
		if key == "" {
			key = str(reality["password"])
		}
		query.Set("sni", str(reality["serverName"]))
		query.Set("fp", str(reality["fingerprint"]))
		query.Set("pbk", key)
		query.Set("sid", str(reality["shortId"]))
		query.Set("spx", str(reality["spiderX"]))
	}
	return xrayTransport(query)
}

func xrayJSONNodes(data []byte) []object {
	var root any
	if json.Unmarshal(data, &root) != nil {
		return nil
	}
	profiles := array(root)
	if obj(root) != nil {
		profiles = []any{root}
	}
	var nodes []object
	for _, profile := range profiles {
		outbounds := array(obj(profile)["outbounds"])
		if outbounds == nil {
			outbounds = []any{profile} // One standalone outbound.
		}
		for _, raw := range outbounds {
			out := obj(raw)
			if str(out["protocol"]) != "vless" {
				continue
			}
			stream := xrayJSONStream(obj(out["streamSettings"]))
			if stream == nil {
				continue
			}
			settings := obj(out["settings"])
			servers := array(settings["vnext"])
			if servers == nil {
				servers = []any{settings}
			}
			for _, endpoint := range servers {
				server := obj(endpoint)
				address, port := str(server["address"]), integer(server["port"])
				if !publicServer(address) || port < 1 || port > 65535 {
					continue
				}
				users := array(server["users"])
				if users == nil {
					users = []any{server}
				}
				for _, rawUser := range users {
					user := obj(rawUser)
					id, encryption := str(user["id"]), str(user["encryption"])
					if !uuidPattern.MatchString(id) {
						continue
					}
					if encryption == "" {
						encryption = "none"
					}
					nodes = append(nodes, object{
						"protocol": "vless", "streamSettings": stream, nodeName: jsonNodeName(out, obj(profile), len(outbounds) == 1),
						"settings": object{"vnext": []object{{
							"address": address, "port": port,
							"users": []object{{"id": id, "encryption": encryption, "flow": str(user["flow"])}},
						}}},
					})
					if len(nodes) == maxNodes {
						return nodes
					}
				}
			}
		}
	}
	return nodes
}

func compileXray(data []byte, mode, token string) (object, error) {
	return compileXrayWithNames(data, mode, token, nil)
}

func compileXrayWithNames(data []byte, mode, token string, names map[string]string) (object, error) {
	if (mode != "routewolf" && mode != "full") || !tokenPattern.MatchString(token) || len(data) > maxSubscription {
		return nil, errors.New("invalid VLESS mode, state or subscription size")
	}
	text := strings.TrimPrefix(strings.TrimSpace(string(data)), "\ufeff")
	if !strings.Contains(text, "vless://") {
		if decoded, err := base64Bytes(text); err == nil {
			text = string(decoded)
		}
	}
	text = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(text), "\ufeff"))
	nodes := xrayJSONNodes([]byte(text))
	if len(nodes) == 0 {
		for line := range strings.SplitSeq(text, "\n") {
			if node := xrayNode(strings.TrimSpace(line)); node != nil {
				nodes = append(nodes, node)
				if len(nodes) == maxNodes {
					break
				}
			}
		}
	}
	if len(nodes) == 0 {
		return nil, errors.New("no compatible VLESS outbounds or share links")
	}
	for i, node := range nodes {
		tag := fmt.Sprintf("rw-vless-%d", i+1)
		if name := str(node[nodeName]); names != nil && name != "" {
			names[tag] = name
		}
		delete(node, nodeName)
		node["tag"] = tag
	}
	config := object{
		"log": object{"loglevel": "none"},
		"inbounds": []object{
			{"protocol": "tun", "tag": "rw-tun", "settings": object{
				"name": "rwsub0", "mtu": 1280, "gateway": []string{"198.18.79.1/30", "fdfe:dcba:9876:79::1/126"},
			}},
			{"protocol": "socks", "tag": "rw-check", "listen": "127.0.0.1", "port": xrayProbePort, "settings": object{
				"auth": "password", "accounts": []object{{"user": "routewolf", "pass": token}},
			}},
		},
		"outbounds": nodes,
	}
	if len(nodes) > 1 {
		selector := []string{"rw-vless-"}
		config["observatory"] = object{"subjectSelector": selector, "probeURL": checkURL, "probeInterval": "15s"}
		config["routing"] = object{
			"rules": []object{{"type": "field", "inboundTag": []string{"rw-tun", "rw-check"}, "balancerTag": "rw-vless"}},
			"balancers": []object{{"tag": "rw-vless", "selector": selector,
				"strategy": object{"type": "leastPing"}, "fallbackTag": "rw-vless-1"}},
		}
	}
	return config, nil
}
