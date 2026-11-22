package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/netip"
	"os"
	"sync/atomic"
	"time"
)

const maxWireGuard = 1800
const envelopeOverhead = 38
const maxPeers = 253

type config struct {
	Mode      string
	Listen    string
	WireGuard string
	Remote    string
	Key       string
	Keys      []string
}

type sequenceWindow struct {
	highest uint32
	used    uint64
}

func (w *sequenceWindow) accept(seq uint32) bool {
	if seq > w.highest {
		w.used = w.used<<(seq-w.highest) | 1
		w.highest = seq
		return true
	}
	offset := w.highest - seq
	if offset >= 64 || w.used&(uint64(1)<<offset) != 0 {
		return false
	}
	w.used |= 1 << offset
	return true
}

type codec struct {
	seal, open cipher.AEAD
	id         [8]byte
	prefix     [8]byte
	sequence   uint32
	windows    map[uint64]*sequenceWindow
	order      []uint64
}

func direction(key []byte, label string) (cipher.AEAD, error) {
	digest := hmac.New(sha256.New, key)
	digest.Write([]byte("routewolf/wg-envelope/v2/" + label))
	block, err := aes.NewCipher(digest.Sum(nil))
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func newCodec(key []byte, server bool) (*codec, error) {
	out, in := "client", "server"
	if server {
		out, in = in, out
	}
	s, err := direction(key, out)
	if err != nil {
		return nil, err
	}
	o, err := direction(key, in)
	if err != nil {
		return nil, err
	}
	c := &codec{seal: s, open: o, windows: make(map[uint64]*sequenceWindow)}
	identity := hmac.New(sha256.New, key)
	identity.Write([]byte("routewolf/wg-envelope/v2/peer"))
	copy(c.id[:], identity.Sum(nil))
	_, err = rand.Read(c.prefix[:])
	return c, err
}

func handshakeSize(packet []byte) int {
	if len(packet) < 4 {
		return 0
	}
	switch binary.LittleEndian.Uint32(packet) {
	case 1:
		if len(packet) == 148 {
			return 200
		}
	case 2:
		if len(packet) == 92 {
			return 160
		}
	case 3:
		if len(packet) == 64 {
			return 128
		}
	}
	return 0
}

func (c *codec) wrap(packet []byte) ([]byte, error) {
	if len(packet) < 4 || len(packet) > maxWireGuard {
		return nil, errors.New("invalid WireGuard packet length")
	}
	if c.sequence == ^uint32(0) {
		if _, err := rand.Read(c.prefix[:]); err != nil {
			return nil, err
		}
		c.sequence = 0
	}
	c.sequence++
	var nonce [12]byte
	copy(nonce[:], c.prefix[:])
	binary.BigEndian.PutUint32(nonce[8:], c.sequence)
	wireSize := envelopeOverhead + len(packet)
	if fixed := handshakeSize(packet); fixed > 0 {
		wireSize = fixed
	}
	plain := make([]byte, wireSize-envelopeOverhead+2)
	binary.BigEndian.PutUint16(plain, uint16(len(packet)))
	copy(plain[2:], packet)
	frame := make([]byte, 20, wireSize)
	copy(frame[:8], c.id[:])
	copy(frame[8:], nonce[:])
	return c.seal.Seal(frame, nonce[:], plain, c.id[:]), nil
}

func (c *codec) unwrap(frame []byte) []byte {
	if len(frame) < envelopeOverhead+4 || len(frame) > maxWireGuard+envelopeOverhead || !bytes.Equal(frame[:8], c.id[:]) {
		return nil
	}
	nonce := frame[8:20]
	plain, err := c.open.Open(nil, nonce, frame[20:], c.id[:])
	if err != nil || len(plain) < 2 {
		return nil
	}
	size := int(binary.BigEndian.Uint16(plain))
	if size < 4 || size > maxWireGuard || size > len(plain)-2 {
		return nil
	}
	prefix := binary.BigEndian.Uint64(nonce)
	seq := binary.BigEndian.Uint32(nonce[8:])
	window := c.windows[prefix]
	if window == nil {
		if len(c.order) == 32 {
			delete(c.windows, c.order[0])
			c.order = c.order[1:]
		}
		window = new(sequenceWindow)
		c.windows[prefix] = window
		c.order = append(c.order, prefix)
	}
	if seq == 0 || !window.accept(seq) {
		return nil
	}
	return plain[2 : size+2]
}

func resolve(raw string) (netip.AddrPort, error) {
	addr, err := net.ResolveUDPAddr("udp4", raw)
	if err != nil {
		return netip.AddrPort{}, err
	}
	result := addr.AddrPort()
	return netip.AddrPortFrom(result.Addr().Unmap(), result.Port()), nil
}

func loopback(raw string) (netip.AddrPort, error) {
	addr, err := resolve(raw)
	if err != nil || !addr.Addr().IsLoopback() || addr.Port() == 0 {
		return netip.AddrPort{}, errors.New("WireGuard peer must be an IPv4 loopback address and port")
	}
	return addr, nil
}

func keyCodec(value string, server bool) (*codec, error) {
	key, err := hex.DecodeString(value)
	if err != nil || len(key) != 32 {
		return nil, errors.New("invalid transport key")
	}
	return newCodec(key, server)
}

func readConfig(path string) (config, []byte, error) {
	var cfg config
	file, err := os.Open(path)
	if err != nil {
		return cfg, nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 32769))
	if err != nil || len(data) > 32768 || json.Unmarshal(data, &cfg) != nil {
		return cfg, nil, errors.New("invalid transport configuration")
	}
	return cfg, data, nil
}

func serveClient(cfg config) error {
	c, err := keyCodec(cfg.Key, false)
	if err != nil {
		return err
	}
	wg, err := loopback(cfg.WireGuard)
	if err != nil {
		return err
	}
	local, err := loopback(cfg.Listen)
	if err != nil {
		return err
	}
	target, err := resolve(cfg.Remote)
	if err != nil || !target.Addr().Is4() || target.Port() == 0 {
		return errors.New("could not resolve the transport server")
	}
	raw, err := net.ListenUDP("udp4", net.UDPAddrFromAddrPort(local))
	if err != nil {
		return err
	}
	defer raw.Close()
	wrapped, err := net.ListenUDP("udp4", nil)
	if err != nil {
		return err
	}
	defer wrapped.Close()
	var remote atomic.Pointer[netip.AddrPort]
	remote.Store(&target)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if addr, err := resolve(cfg.Remote); err == nil && addr.Addr().Is4() && addr.Port() != 0 {
				remote.Store(&addr)
			}
		}
	}()
	go func() {
		buf := make([]byte, maxWireGuard+envelopeOverhead+1)
		for {
			size, from, err := wrapped.ReadFromUDPAddrPort(buf)
			if err != nil {
				raw.Close()
				return
			}
			if from != *remote.Load() {
				continue
			}
			packet := c.unwrap(buf[:size])
			if packet != nil {
				raw.WriteToUDPAddrPort(packet, wg)
			}
		}
	}()
	log.Printf("client listening on %s", local)
	buf := make([]byte, maxWireGuard+1)
	for {
		n, from, err := raw.ReadFromUDPAddrPort(buf)
		if err != nil {
			return err
		}
		if from != wg {
			continue
		}
		if frame, err := c.wrap(buf[:n]); err == nil {
			wrapped.WriteToUDPAddrPort(frame, *remote.Load())
		}
	}
}

type peer struct {
	codec   *codec
	remote  atomic.Pointer[netip.AddrPort]
	backend *net.UDPConn
}

func (p *peer) forwardReplies(wrapped *net.UDPConn, wg netip.AddrPort) {
	buf := make([]byte, maxWireGuard+1)
	for {
		n, from, err := p.backend.ReadFromUDPAddrPort(buf)
		if err != nil {
			return
		}
		to := p.remote.Load()
		if from != wg || to == nil {
			continue
		}
		if frame, err := p.codec.wrap(buf[:n]); err == nil {
			wrapped.WriteToUDPAddrPort(frame, *to)
		}
	}
}

func configuredPeers(keys []string, previous map[[8]byte]*peer) (map[[8]byte]*peer, error) {
	if len(keys) > maxPeers {
		return nil, errors.New("too many transport peers")
	}
	replacement := make(map[[8]byte]*peer, len(keys))
	for _, key := range keys {
		c, err := keyCodec(key, true)
		if err != nil {
			return nil, err
		}
		if _, duplicate := replacement[c.id]; duplicate {
			return nil, errors.New("duplicate transport peer")
		}
		if existing := previous[c.id]; existing != nil {
			replacement[c.id] = existing
		} else {
			replacement[c.id] = &peer{codec: c}
		}
	}
	for id, old := range previous {
		if replacement[id] == nil && old.backend != nil {
			old.backend.Close()
		}
	}
	return replacement, nil
}

func serveServer(path string, cfg config, snapshot []byte) error {
	wg, err := loopback(cfg.WireGuard)
	if err != nil {
		return err
	}
	listen, err := resolve(cfg.Listen)
	if err != nil || !listen.Addr().Is4() || listen.Port() == 0 {
		return errors.New("invalid listener")
	}
	peers, err := configuredPeers(cfg.Keys, nil)
	if err != nil {
		return err
	}
	wrapped, err := net.ListenUDP("udp4", net.UDPAddrFromAddrPort(listen))
	if err != nil {
		return err
	}
	defer wrapped.Close()
	log.Printf("server listening on %s", listen)
	buf := make([]byte, maxWireGuard+envelopeOverhead+1)
	var reload time.Time
	for {
		now := time.Now()
		if !now.Before(reload) {
			next, data, err := readConfig(path)
			if err == nil && !bytes.Equal(data, snapshot) && next.Mode == cfg.Mode && next.Listen == cfg.Listen && next.WireGuard == cfg.WireGuard {
				if updated, err := configuredPeers(next.Keys, peers); err == nil {
					peers, snapshot = updated, data
				}
			}
			reload = now.Add(time.Second)
			wrapped.SetReadDeadline(reload)
		}
		size, from, err := wrapped.ReadFromUDPAddrPort(buf)
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue
			}
			return err
		}
		if size < envelopeOverhead+4 {
			continue
		}
		id := [8]byte(buf[:8])
		session := peers[id]
		if session == nil {
			continue
		}
		packet := session.codec.unwrap(buf[:size])
		if packet == nil {
			continue
		}
		if session.backend == nil {
			backend, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
			if err != nil {
				continue
			}
			session.backend = backend
			go session.forwardReplies(wrapped, wg)
		}
		session.remote.Store(&from)
		session.backend.WriteToUDPAddrPort(packet, wg)
	}
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: routewolf-wg-transport CONFIG.json")
		os.Exit(2)
	}
	path := os.Args[1]
	cfg, snapshot, err := readConfig(path)
	if err != nil {
		log.Fatal(err)
	}
	switch cfg.Mode {
	case "client":
		err = serveClient(cfg)
	case "server":
		err = serveServer(path, cfg, snapshot)
	default:
		err = errors.New("mode must be client or server")
	}
	if err != nil {
		log.Fatal(err)
	}
}
