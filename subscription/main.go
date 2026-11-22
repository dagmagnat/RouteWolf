package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	noProxy    = 10
	engineDown = 11
	checkURL   = "https://cp.cloudflare.com/generate_204"
)

func readLimited(r io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil || len(data) == 0 || int64(len(data)) > limit {
		return nil, errors.New("response or file is empty, too large, or unreadable")
	}
	return data, nil
}

func readFile(name string, limit int64) ([]byte, error) {
	f, err := os.Open(name)
	if err != nil {
		return nil, errors.New("cannot open subscription state")
	}
	defer f.Close()
	return readLimited(f, limit)
}

func subscriptionURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return nil, errors.New("an HTTPS subscription URL is required")
	}
	return u, nil
}

func fetch(path string) error {
	raw, err := readFile(path, 8192)
	if err != nil {
		return err
	}
	u, err := subscriptionURL(string(raw))
	if err != nil {
		return err
	}
	client := &http.Client{
		Timeout: 20 * time.Second,
		CheckRedirect: func(req *http.Request, previous []*http.Request) error {
			if len(previous) >= 4 {
				return errors.New("too many redirects")
			}
			_, err := subscriptionURL(req.URL.String())
			return err
		},
	}
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return errors.New("invalid subscription request")
	}
	req.Header.Set("User-Agent", "RouteWolf/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("could not download subscription")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("subscription returned HTTP %d", resp.StatusCode)
	}
	data, err := readLimited(resp.Body, maxSubscription)
	if err != nil {
		return err
	}
	_, err = os.Stdout.Write(data)
	return err
}

type clashClient struct {
	base   string
	secret string
	http   *http.Client
}

func (c clashClient) request(ctx context.Context, method, path string, body []byte, response any) bool {
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+c.secret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return false
	}
	return response == nil || json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(response) == nil
}

type proxyState struct {
	Now string `json:"now"`
}

func (c clashClient) available(ctx context.Context, tag string, target string) bool {
	var status struct {
		Delay int `json:"delay"`
	}
	path := "/proxies/" + url.PathEscape(tag) + "/delay?timeout=1800&url=" + url.QueryEscape(target)
	return c.request(ctx, http.MethodGet, path, nil, &status) && status.Delay >= 0
}

func (c clashClient) ready(ctx context.Context) bool {
	return c.request(ctx, http.MethodGet, "/version", nil, nil)
}

func (c clashClient) selectHealthy(ctx context.Context, groups []group) int {
	if !c.ready(ctx) {
		return engineDown
	}
	// Check the highest-priority node of each group first. Healthy groups
	// avoid sending a probe to every backup on every pass.
	probe := func(tags []string, healthy map[string]bool) {
		for start := 0; start < len(tags); start += 16 {
			end := min(start+16, len(tags))
			available := make([]bool, end-start)
			var workers sync.WaitGroup
			for i, tag := range tags[start:end] {
				workers.Add(1)
				go func(i int, tag string) {
					defer workers.Done()
					available[i] = c.available(ctx, tag, checkURL)
				}(i, tag)
			}
			workers.Wait()
			for i, ok := range available {
				healthy[tags[start+i]] = ok
			}
		}
	}
	healthy := make(map[string]bool, maxNodes)
	var primary, backups []string
	for _, group := range groups {
		primary = append(primary, group.Nodes[0])
	}
	probe(primary, healthy)
	for _, group := range groups {
		if !healthy[group.Nodes[0]] {
			backups = append(backups, group.Nodes[1:]...)
		}
	}
	probe(backups, healthy)
	active := false
	for _, group := range groups {
		chosen := "rw-direct"
		for _, tag := range group.Nodes {
			if healthy[tag] {
				chosen = tag
				break
			}
		}
		active = active || chosen != "rw-direct"
		var state proxyState
		path := "/proxies/" + url.PathEscape(group.Tag)
		if !c.request(ctx, http.MethodGet, path, nil, &state) {
			return engineDown
		}
		if state.Now != chosen {
			body, _ := json.Marshal(map[string]string{"name": chosen})
			if !c.request(ctx, http.MethodPut, path, body, nil) {
				return engineDown
			}
		}
	}
	if !active {
		if !c.available(ctx, "rw-direct", checkURL) && internetAvailable(ctx) {
			return engineDown
		}
		return noProxy
	}
	return 0
}

// A failing WAN check is insufficient evidence that the engine is wedged.
func internetAvailable(ctx context.Context) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checkURL, nil)
	if err != nil {
		return false
	}
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(req)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusNoContent
}

type localConfig struct {
	Outbounds []struct {
		Type  string   `json:"type"`
		Tag   string   `json:"tag"`
		Nodes []string `json:"outbounds"`
	} `json:"outbounds"`
}

func health(args []string) (int, error) {
	meta, err := readFile(args[0], maxSubscription*2)
	if err != nil {
		return engineDown, err
	}
	token, err := readFile(args[1], 128)
	if err != nil {
		return engineDown, err
	}
	secret := strings.TrimSpace(string(token))
	var config localConfig
	if !tokenPattern.MatchString(secret) || json.Unmarshal(meta, &config) != nil {
		return engineDown, errors.New("invalid local health configuration")
	}
	var groups []group
	for _, outbound := range config.Outbounds {
		if outbound.Type == "selector" && len(outbound.Nodes) > 1 && outbound.Nodes[len(outbound.Nodes)-1] == "rw-direct" {
			groups = append(groups, group{outbound.Tag, outbound.Nodes[:len(outbound.Nodes)-1]})
		}
	}
	if len(groups) == 0 {
		return engineDown, errors.New("no local proxy groups")
	}
	c := clashClient{
		base:   "http://127.0.0.1:19095",
		secret: secret,
		http:   &http.Client{Timeout: 2400 * time.Millisecond},
	}
	if args[2] == "ready" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if c.ready(ctx) {
			return 0, nil
		}
		return engineDown, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 11*time.Second)
	defer cancel()
	return c.selectHealthy(ctx, groups), nil
}

func run(args []string) (int, error) {
	switch {
	case len(args) == 2 && args[0] == "fetch":
		return 1, fetch(args[1])
	case len(args) == 2 && args[0] == "format":
		data, err := readFile(args[1], maxSubscription)
		if err != nil {
			return 1, err
		}
		profiles, err := parseInput(data)
		if err != nil {
			return 1, err
		}
		format := "links"
		for _, profile := range profiles {
			if profile.routing != nil {
				format = "json"
				break
			}
		}
		_, err = fmt.Fprintln(os.Stdout, format)
		return 1, err
	case len(args) == 5 && args[0] == "render":
		data, err := readFile(args[1], maxSubscription)
		if err != nil {
			return 1, err
		}
		key, err := readFile(args[2], 128)
		if err != nil {
			return 1, err
		}
		result, err := compile(data, args[3], strings.TrimSpace(string(key)))
		if err != nil {
			return 1, err
		}
		config, err := json.MarshalIndent(result.Config, "", "  ")
		if err != nil {
			return 1, err
		}
		return 1, os.WriteFile(args[4], config, 0600)
	case len(args) == 4 && args[0] == "health" && (args[3] == "ready" || args[3] == "select"):
		return health(args[1:])
	default:
		return 1, errors.New("invalid subscription helper command")
	}
}

func main() {
	code, err := run(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(code)
	}
	if len(os.Args) > 1 && os.Args[1] == "health" {
		os.Exit(code)
	}
}
