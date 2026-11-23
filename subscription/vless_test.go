package main

import (
	"encoding/base64"
	"net/url"
	"strings"
	"testing"
)

const xrayExample = "vless://a3e1e0f1-2c9b-4fef-abe6-ed637842d853@vpn.example.net:443"

func TestXrayXHTTPLinkKeepsTransportAndReality(t *testing.T) {
	fields := url.Values{
		"type": {"xhttp"}, "security": {"reality"}, "host": {"front.example.net"},
		"sni": {"tls.example.net"}, "pbk": {base64.RawURLEncoding.EncodeToString(make([]byte, 32))},
		"sid": {"a101"}, "path": {"/transfer?q=1"}, "mode": {"stream-up"},
		"extra": {`{"scMaxEachPostBytes":900000}`},
	}
	config, err := compileXray([]byte(xrayExample+"?"+fields.Encode()), "routewolf", strings.Repeat("b", 48))
	if err != nil {
		t.Fatal(err)
	}
	inbounds := config["inbounds"].([]object)
	if obj(inbounds[0]["settings"])["name"] != "rwsub0" || inbounds[1]["listen"] != "127.0.0.1" {
		t.Fatal("expected local TUN and loopback health probe")
	}
	stream := obj(config["outbounds"].([]object)[0]["streamSettings"])
	transport, reality := obj(stream["xhttpSettings"]), obj(stream["realitySettings"])
	if stream["network"] != "xhttp" || transport["mode"] != "stream-up" || transport["path"] != "/transfer?q=1" ||
		transport["host"] != "front.example.net" || integer(obj(transport["extra"])["scMaxEachPostBytes"]) != 900000 ||
		reality["shortId"] != "a101" || reality["serverName"] != "tls.example.net" {
		t.Fatal("XHTTP or REALITY parameters were lost")
	}
}

func TestXrayBase64SubscriptionKeepsMultipleVlessNodes(t *testing.T) {
	data := "# nodes\n" + xrayExample + "?type=grpc&serviceName=demo\n" +
		"trojan://example.net\n" + xrayExample + "?type=xhttp&mode=packet-up\n"
	config, err := compileXray([]byte(base64.RawStdEncoding.EncodeToString([]byte(data))), "full", strings.Repeat("a", 48))
	if err != nil || len(config["outbounds"].([]object)) != 2 || config["observatory"] == nil || config["routing"] == nil {
		t.Fatalf("expected two VLESS nodes and health-based selection: %v", err)
	}
}

func TestXrayRejectsUnusableOrUnsafeLinks(t *testing.T) {
	for _, invalid := range []string{
		xrayExample + "?type=quic",
		xrayExample + "?type=xhttp&mode=invalid",
		xrayExample + "?type=xhttp&extra=" + url.QueryEscape(`{"downloadSettings":{"address":"127.0.0.1"}}`),
		strings.Replace(xrayExample, "vpn.example.net", "127.0.0.1", 1),
	} {
		if _, err := compileXray([]byte(invalid), "full", strings.Repeat("a", 48)); err == nil {
			t.Fatal("unusable profile was accepted")
		}
	}
}
