package handler

import (
	"testing"
	"time"
)

func TestLoginRateLimiter(t *testing.T) {
	key := "test|user@example.com"
	loginLimiter.reset(key)
	t.Cleanup(func() { loginLimiter.reset(key) })

	if loginLimiter.blocked(key) {
		t.Fatal("seharusnya belum dibatasi")
	}

	for i := 0; i < maxLoginFailures; i++ {
		loginLimiter.fail(key)
	}
	if !loginLimiter.blocked(key) {
		t.Fatal("seharusnya dibatasi setelah mencapai batas")
	}

	loginLimiter.reset(key)
	if loginLimiter.blocked(key) {
		t.Fatal("seharusnya reset setelah login berhasil")
	}
}

func TestLoginRateLimiterWindowExpires(t *testing.T) {
	key := "test|expire@example.com"
	loginLimiter.reset(key)
	t.Cleanup(func() { loginLimiter.reset(key) })

	loginLimiter.mu.Lock()
	loginLimiter.attempts[key] = &failureEntry{
		failures: maxLoginFailures,
		first:    time.Now().Add(-loginWindow - time.Minute),
	}
	loginLimiter.mu.Unlock()

	if loginLimiter.blocked(key) {
		t.Fatal("window kedaluwarsa seharusnya mereset hitungan")
	}
}
