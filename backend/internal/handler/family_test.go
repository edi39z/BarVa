package handler

import "testing"

func TestQuotaBytesFromGB(t *testing.T) {
	cases := []struct {
		gb   float64
		want int64
	}{
		{0, 0},
		{1, 1 << 30},
		{1.5, 3 << 29},
		{0.5, 1 << 29},
		{25, 25 * (1 << 30)},
	}
	for _, tc := range cases {
		if got := quotaBytesFromGB(tc.gb); got != tc.want {
			t.Errorf("quotaBytesFromGB(%v) = %d, want %d", tc.gb, got, tc.want)
		}
	}
}

func TestValidQuotaGB(t *testing.T) {
	cases := []struct {
		gb   float64
		want bool
	}{
		{0, true},
		{0.25, true},
		{maxQuotaGB, true},
		{-1, false},
		{maxQuotaGB + 1, false},
	}
	for _, tc := range cases {
		if got := validQuotaGB(tc.gb); got != tc.want {
			t.Errorf("validQuotaGB(%v) = %v, want %v", tc.gb, got, tc.want)
		}
	}
}

func TestCanManageQuota(t *testing.T) {
	cases := []struct {
		caller, target string
		want           bool
	}{
		{"owner", "owner", true},
		{"owner", "admin", true},
		{"owner", "member", true},
		{"admin", "owner", false},
		{"admin", "admin", true},
		{"admin", "member", true},
		{"member", "member", false},
		{"member", "owner", false},
	}
	for _, tc := range cases {
		if got := canManageQuota(tc.caller, tc.target); got != tc.want {
			t.Errorf("canManageQuota(%q, %q) = %v, want %v", tc.caller, tc.target, got, tc.want)
		}
	}
}
