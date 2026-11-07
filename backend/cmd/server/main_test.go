package main

import "testing"

func TestOriginAllowed(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://nas.example.com")

	cases := []struct {
		origin string
		want   bool
	}{
		{"", false},
		{"http://localhost:3000", true},
		{"http://127.0.0.1:3001", true},
		{"http://192.168.18.10:3000", true},
		{"http://10.0.0.5:8080", true},
		{"http://100.84.21.10:3000", true}, // Tailscale CGNAT
		{"https://nas.example.com", true},
		{"https://evil.example.org", false},
		{"http://8.8.8.8", false},
		{"not-a-url", false},
	}

	for _, tc := range cases {
		if got := originAllowed(tc.origin); got != tc.want {
			t.Errorf("originAllowed(%q) = %v, want %v", tc.origin, got, tc.want)
		}
	}
}
