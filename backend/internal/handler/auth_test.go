package handler

import (
	"testing"
	"time"
)

func TestLoginRateLimiter(t *testing.T) {
	key := "test|user@example.com"
	clearLoginFailures(key)
	t.Cleanup(func() { clearLoginFailures(key) })

	if tooManyLoginAttempts(key) {
		t.Fatal("seharusnya belum dibatasi")
	}

	for i := 0; i < maxLoginFailures; i++ {
		recordLoginFailure(key)
	}
	if !tooManyLoginAttempts(key) {
		t.Fatal("seharusnya dibatasi setelah mencapai batas")
	}

	clearLoginFailures(key)
	if tooManyLoginAttempts(key) {
		t.Fatal("seharusnya reset setelah login berhasil")
	}
}

func TestLoginRateLimiterWindowExpires(t *testing.T) {
	key := "test|expire@example.com"
	clearLoginFailures(key)
	t.Cleanup(func() { clearLoginFailures(key) })

	loginMu.Lock()
	loginAttempts[key] = &loginAttempt{
		failures: maxLoginFailures,
		first:    time.Now().Add(-loginWindow - time.Minute),
	}
	loginMu.Unlock()

	if tooManyLoginAttempts(key) {
		t.Fatal("window kedaluwarsa seharusnya mereset hitungan")
	}
}
