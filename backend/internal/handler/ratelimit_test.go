package handler

import (
	"testing"
	"time"
)

func TestFailureLimiterBlocksAfterMax(t *testing.T) {
	limiter := newFailureLimiter(3, time.Minute)
	key := "ip|target"

	if limiter.blocked(key) {
		t.Fatal("kunci baru seharusnya belum dibatasi")
	}

	limiter.fail(key)
	limiter.fail(key)
	if limiter.blocked(key) {
		t.Fatal("dua kegagalan belum mencapai batas tiga")
	}

	limiter.fail(key)
	if !limiter.blocked(key) {
		t.Fatal("tiga kegagalan seharusnya membuat kunci dibatasi")
	}

	// Kunci lain tidak boleh terpengaruh.
	if limiter.blocked("ip|lain") {
		t.Fatal("kunci berbeda seharusnya tidak ikut dibatasi")
	}
}

func TestFailureLimiterResetsAfterSuccess(t *testing.T) {
	limiter := newFailureLimiter(2, time.Minute)
	key := "ip|target"

	limiter.fail(key)
	limiter.fail(key)
	if !limiter.blocked(key) {
		t.Fatal("seharusnya dibatasi")
	}

	limiter.reset(key)
	if limiter.blocked(key) {
		t.Fatal("reset seharusnya menghapus batas")
	}
}

func TestFailureLimiterWindowExpiry(t *testing.T) {
	limiter := newFailureLimiter(2, time.Minute)
	key := "ip|target"
	now := time.Now()

	limiter.now = func() time.Time { return now }
	limiter.fail(key)
	limiter.fail(key)
	if !limiter.blocked(key) {
		t.Fatal("seharusnya dibatasi dalam jendela")
	}

	now = now.Add(2 * time.Minute)
	if limiter.blocked(key) {
		t.Fatal("jendela kedaluwarsa seharusnya mereset hitungan")
	}

	// Kegagalan berikutnya memulai jendela baru, bukan melanjutkan yang lama.
	limiter.fail(key)
	if limiter.blocked(key) {
		t.Fatal("kegagalan pertama jendela baru seharusnya belum dibatasi")
	}
}
