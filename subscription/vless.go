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
			case "sockopt", "sockoptions", "dialerproxy":
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
		"protocol": "vless", "streamSettings": stream,
		"settings": object{"vnext": []object{{
			"address": u.Hostname(), "port": port,
			"users": []object{{"id": u.User.Username(), "encryption": encryption, "flow": query.Get("flow")}},
		}}},
	}
}

func compileXray(data []byte, mode, token string) (object, error) {
	if (mode != "routewolf" && mode != "full") || !tokenPattern.MatchString(token) || len(data) > maxSubscription {
		return nil, errors.New("invalid VLESS mode, state or subscription size")
	}
	text := strings.TrimPrefix(strings.TrimSpace(string(data)), "\ufeff")
	if !strings.Contains(text, "vless://") {
		if decoded, err := base64Bytes(text); err == nil {
			text = string(decoded)
		}
	}
	nodes := make([]object, 0, maxNodes)
	for line := range strings.SplitSeq(strings.TrimPrefix(text, "\ufeff"), "\n") {
		if node := xrayNode(strings.TrimSpace(line)); node != nil {
			node["tag"] = fmt.Sprintf("rw-vless-%d", len(nodes)+1)
			nodes = append(nodes, node)
			if len(nodes) == maxNodes {
				break
			}
		}
	}
	if len(nodes) == 0 {
		return nil, errors.New("no compatible VLESS links")
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
