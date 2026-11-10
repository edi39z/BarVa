package handler

import "testing"

func TestQuotaExceeded(t *testing.T) {
	const gib = int64(1024 * 1024 * 1024)

	cases := []struct {
		name     string
		quota    int64
		used     int64
		incoming int64
		want     bool
	}{
		{"kuota 0 berarti tanpa batas", 0, 500 * gib, 10 * gib, false},
		{"masih muat", 10 * gib, 5 * gib, 4 * gib, false},
		{"pas di batas", 10 * gib, 8 * gib, 2 * gib, false},
		{"lewat satu byte", 10 * gib, 8 * gib, 2*gib + 1, true},
		{"sudah penuh", 10 * gib, 10 * gib, 1, true},
		{"berkas lebih besar dari kuota", 1 * gib, 0, 2 * gib, true},
	}

	for _, tc := range cases {
		if got := quotaExceeded(tc.quota, tc.used, tc.incoming); got != tc.want {
			t.Errorf("%s: quotaExceeded(%d, %d, %d) = %v, want %v",
				tc.name, tc.quota, tc.used, tc.incoming, got, tc.want)
		}
	}
}

func TestHumanBytes(t *testing.T) {
	cases := map[int64]string{
		0:                       "0 B",
		512:                     "512 B",
		1024:                    "1.0 KB",
		1536:                    "1.5 KB",
		1024 * 1024:             "1.0 MB",
		25 * 1024 * 1024 * 1024: "25.0 GB",
	}

	for in, want := range cases {
		if got := humanBytes(in); got != want {
			t.Errorf("humanBytes(%d) = %q, want %q", in, got, want)
		}
	}
}
