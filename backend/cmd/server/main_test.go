package main

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestValidateAdminKey(t *testing.T) {
	cases := []struct {
		name    string
		mode    string
		key     string
		wantErr bool
	}{
		{"release tanpa kunci", gin.ReleaseMode, "", true},
		{"release kunci spasi", gin.ReleaseMode, "   ", true},
		{"release dengan kunci", gin.ReleaseMode, "rahasia", false},
		{"debug tanpa kunci", gin.DebugMode, "", false},
		{"test tanpa kunci", gin.TestMode, "", false},
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
