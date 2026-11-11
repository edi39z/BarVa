package main

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestValidateAdminKey(t *testing.T) {
	const kunciAcak = "9f2c1d7a4b8e3f6051c9ad7e2b4f8c1d3a6e9b0c5d2f7a4e8b1c3d6f9a0e2b5c"

	cases := []struct {
		name    string
		mode    string
		key     string
		wantErr bool
	}{
		{"release tanpa kunci", gin.ReleaseMode, "", true},
		{"release kunci spasi", gin.ReleaseMode, "   ", true},
		{"release kunci pendek", gin.ReleaseMode, "rahasia", true},
		{"release kunci contoh", gin.ReleaseMode, "ganti_dengan_kunci_acak", true},
		{"release kunci contoh kapital", gin.ReleaseMode, "GANTI_DENGAN_KUNCI_ACAK", true},
		{"release kunci changeme", gin.ReleaseMode, "changeme-changeme-changeme-changeme", true},
		{"release kunci acak", gin.ReleaseMode, kunciAcak, false},
		{"debug tanpa kunci", gin.DebugMode, "", false},
		{"test tanpa kunci", gin.TestMode, "", false},
		{"debug kunci pendek", gin.DebugMode, "rahasia", false},
	}

	for _, tc := range cases {
		err := validateAdminKey(tc.mode, tc.key)
		if (err != nil) != tc.wantErr {
			t.Errorf("%s: validateAdminKey(%q, %q) err = %v, wantErr %v", tc.name, tc.mode, tc.key, err, tc.wantErr)
		}
	}
}

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
