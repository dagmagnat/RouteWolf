package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

const testSecret = "0123456789abcdef0123456789abcdef0123456789abcdef"
const testUUID = "accb3169-399a-4250-8737-2ad6e7bcdfd1"

func TestOrderedLinks(t *testing.T) {
	links := "vless://" + testUUID + "@first.example:443?security=tls\n" +
		"vless://" + testUUID + "@second.example:443?security=tls"
	encoded := base64.RawStdEncoding.EncodeToString([]byte(links))
	for _, input := range []string{links, encoded} {
		for _, mode := range []string{"full", "routewolf"} {
			result, err := compile([]byte(input), mode, testSecret)
			if err != nil {
				t.Fatal(err)
			}
			out := result.Config["outbounds"].([]object)
			if result.Nodes != 2 || out[1]["server"] != "first.example" || out[2]["server"] != "second.example" {
				t.Fatalf("%s: server priority not retained", mode)
			}
			if !reflect.DeepEqual(out[3]["outbounds"], []string{"rw-node-1", "rw-node-2", "rw-direct"}) {
				t.Fatal("selector is missing its direct fallback")
			}
		}
	}
	if _, err := compile([]byte(links), "json", testSecret); err == nil {
		t.Fatal("ordinary links must not invent routing rules")
	}
	if _, err := compile([]byte(strings.ReplaceAll(strings.Split(links, "\n")[0], "first.example", "127.0.0.1")), "full", testSecret); err == nil {
		t.Fatal("loopback placeholders must not activate any LAN routes")
	}
}

func TestJSONRouting(t *testing.T) {
	jsonProfile := `[{
		"outbounds":[
			{"tag":"proxy","protocol":"vless","settings":{"vnext":[{"address":"first.example","port":443,"users":[{"id":"` + testUUID + `"}]}]}},
			{"tag":"direct","protocol":"freedom"}
		],
		"routing":{"domainStrategy":"AsIs","rules":[{"type":"field","domain":["full:lan.example"],"ip":["192.0.2.2"],"outboundTag":"direct"}]}
	}]`
	result, err := compile([]byte(jsonProfile), "json", testSecret)
	if err != nil {
		t.Fatal(err)
	}
	route := obj(result.Config["route"])
	rules := route["rules"].([]object)
	if route["final"] != "rw-group-1" || rules[0]["action"] != "sniff" || rules[1]["outbound"] != "rw-direct" || rules[1]["type"] != "logical" || rules[1]["mode"] != "and" {
		t.Fatal("lost default route or the domain and IP match")
	}
	external := strings.ReplaceAll(jsonProfile, "full:lan.example", "geosite:private")
	if _, err := compile([]byte(external), "json", testSecret); err == nil {
		t.Fatal("unsupported rule must fail explicitly")
	}
	if _, err := compile([]byte(external), "routewolf", testSecret); err != nil {
		t.Fatalf("RouteWolf mode does not import rules: %v", err)
	}
}

func TestFailoverAndReturnToPrimary(t *testing.T) {
	healthy := map[string]bool{"rw-node-1": true, "rw-node-2": true, "rw-direct": true}
	selected := "rw-direct"
	var lock sync.Mutex
	auth := "Bearer " + testSecret
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != auth {
			w.WriteHeader(401)
			return
		}
		lock.Lock()
		defer lock.Unlock()
		name := strings.TrimPrefix(r.URL.Path, "/proxies/")
		switch {
		case r.URL.Path == "/version":
			w.WriteHeader(200)
		case strings.HasSuffix(name, "/delay"):
			if !healthy[strings.TrimSuffix(name, "/delay")] {
				http.Error(w, "down", 504)
				return
			}
			_, _ = w.Write([]byte(`{"delay":10}`))
		case name == "rw-group-1" && r.Method == http.MethodGet:
			_ = json.NewEncoder(w).Encode(proxyState{selected})
		case name == "rw-group-1" && r.Method == http.MethodPut:
			var request struct{ Name string }
			if json.NewDecoder(r.Body).Decode(&request) != nil {
				w.WriteHeader(400)
				return
			}
			selected = request.Name
			w.WriteHeader(204)
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	c := clashClient{base: server.URL, secret: testSecret, http: server.Client()}
	groups := []group{{"rw-group-1", []string{"rw-node-1", "rw-node-2"}}}
	check := func(code int, want string) {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		got := c.selectHealthy(ctx, groups)
		lock.Lock()
		defer lock.Unlock()
		if got != code || selected != want {
			t.Fatalf("health code %d, selection %q, want %d and %q", got, selected, code, want)
		}
	}
	setHealth := func(tag string, available bool) {
		lock.Lock()
		defer lock.Unlock()
		healthy[tag] = available
	}
	check(0, "rw-node-1")
	setHealth("rw-node-1", false)
	check(0, "rw-node-2")
	setHealth("rw-node-2", false)
	check(noProxy, "rw-direct")
	setHealth("rw-node-1", true)
	check(0, "rw-node-1")
	server.Close()
	check(engineDown, "rw-node-1")
}
