package auth

import (
	"encoding/hex"
	"testing"
)

func TestNewToken(t *testing.T) {
	seen := make(map[string]struct{}, 100)
	for i := 0; i < 100; i++ {
		token, err := NewToken(SessionTokenBytes)
		if err != nil {
			t.Fatalf("NewToken gagal: %v", err)
		}
		if len(token) != SessionTokenBytes*2 {
			t.Fatalf("panjang token = %d, ingin %d", len(token), SessionTokenBytes*2)
		}
		if _, err := hex.DecodeString(token); err != nil {
			t.Fatalf("token bukan hex: %v", err)
		}
		if _, dup := seen[token]; dup {
			t.Fatalf("token berulang: %s", token)
		}
		seen[token] = struct{}{}
	}
}

func TestNewURLToken(t *testing.T) {
	seen := make(map[string]struct{}, 100)
	for i := 0; i < 100; i++ {
		token, err := NewURLToken(SessionTokenBytes)
		if err != nil {
			t.Fatalf("NewURLToken gagal: %v", err)
		}
		// base64url tanpa padding: 32 byte → 43 karakter.
		if len(token) != 43 {
			t.Fatalf("panjang token = %d, ingin 43", len(token))
		}
		if _, dup := seen[token]; dup {
			t.Fatalf("token berulang: %s", token)
		}
		seen[token] = struct{}{}
	}
}

func TestHashToken(t *testing.T) {
	const raw = "barva"

	got := HashToken(raw)
	if len(got) != 64 {
		t.Fatalf("panjang hash = %d, ingin 64", len(got))
	}
	if got != HashToken(raw) {
		t.Fatal("HashToken tidak deterministik")
	}
	if got == HashToken(raw+"x") {
		t.Fatal("HashToken memberi hasil sama untuk input berbeda")
	}
	if _, err := hex.DecodeString(got); err != nil {
		t.Fatalf("hash bukan hex: %v", err)
	}
}
