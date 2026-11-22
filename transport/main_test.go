package main

import (
	"bytes"
	"encoding/binary"
	"net"
	"net/netip"
	"testing"
	"time"
)

func TestHandshakeSizesAndReplay(t *testing.T) {
	key := bytes.Repeat([]byte{1}, 32)
	client, err := newCodec(key, false)
	if err != nil {
		t.Fatal(err)
	}
	server, err := newCodec(key, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		tag          uint32
		native, wire int
	}{{1, 148, 200}, {2, 92, 160}, {3, 64, 128}, {4, 1200, 1238}} {
		raw := make([]byte, test.native)
		binary.LittleEndian.PutUint32(raw, test.tag)
		frame, err := client.wrap(raw)
		if err != nil || len(frame) != test.wire {
			t.Fatalf("type %d: length %d, %v", test.tag, len(frame), err)
		}
		forged := bytes.Clone(frame)
		forged[len(forged)-1] ^= 1
		if server.unwrap(forged) != nil {
			t.Fatal("forged ciphertext accepted")
		}
		if decoded := server.unwrap(frame); !bytes.Equal(decoded, raw) {
			t.Fatal("payload changed")
		}
		if server.unwrap(frame) != nil {
			t.Fatal("replay accepted")
		}
		if client.unwrap(frame) != nil {
			t.Fatal("reflected request accepted")
		}
	}
}

func TestPeerUpdatesPreserveSessions(t *testing.T) {
	a := "0101010101010101010101010101010101010101010101010101010101010101"
	b := "0202020202020202020202020202020202020202020202020202020202020202"
	peers, err := configuredPeers([]string{a, b}, nil)
	if err != nil || len(peers) != 2 {
		t.Fatal(err)
	}
	first, _ := keyCodec(a, false)
	second, _ := keyCodec(b, false)
	old := peers[second.id]
	if peers[first.id] == old {
		t.Fatal("peers share a session")
	}
	peers, err = configuredPeers([]string{b}, peers)
	if err != nil || len(peers) != 1 || old != peers[second.id] {
		t.Fatal("key update reset an unrelated session")
	}
}

func TestIPv4SocketPeerIsComparable(t *testing.T) {
	listener, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	client, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	remote := listener.LocalAddr().(*net.UDPAddr).AddrPort()
	client.WriteToUDPAddrPort([]byte{1}, netip.AddrPortFrom(remote.Addr().Unmap(), remote.Port()))
	listener.SetReadDeadline(time.Now().Add(time.Second))
	_, got, err := listener.ReadFromUDPAddrPort(make([]byte, 1))
	want, _ := resolve(client.LocalAddr().String())
	if err != nil || got != want {
		t.Fatalf("source %v, expected %v, %v", got, want, err)
	}
}
