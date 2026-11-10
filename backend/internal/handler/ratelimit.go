package handler

import (
	"sync"
	"time"
)

// failureLimiter membatasi jumlah percobaan gagal per kunci dalam satu
// jendela waktu. Disimpan di memori proses: cukup untuk satu server keluarga
// dan sengaja tidak menambah ketergantungan Redis.
//
// Kunci dipilih pemanggil (mis. "IP|email" untuk login, "IP|token" untuk
// password share) sehingga satu penyerang tidak bisa mengunci pengguna lain.
type failureLimiter struct {
	max    int
	window time.Duration
	now    func() time.Time

	mu       sync.Mutex
	attempts map[string]*failureEntry
}

type failureEntry struct {
	failures int
	first    time.Time
}

func newFailureLimiter(max int, window time.Duration) *failureLimiter {
	return &failureLimiter{
		max:      max,
		window:   window,
		now:      time.Now,
		attempts: map[string]*failureEntry{},
	}
}

// blocked melaporkan apakah kunci sudah melewati batas. Catatan yang lebih tua
// dari jendela dibuang supaya map tidak tumbuh selamanya.
func (l *failureLimiter) blocked(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.attempts[key]
	if !ok {
		return false
	}
	if l.now().Sub(entry.first) > l.window {
		delete(l.attempts, key)
		return false
	}
	return entry.failures >= l.max
}

// fail menambah satu kegagalan. Kegagalan pertama pada jendela baru memulai
// ulang hitungan.
func (l *failureLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.attempts[key]
	if !ok || l.now().Sub(entry.first) > l.window {
		l.attempts[key] = &failureEntry{failures: 1, first: l.now()}
		return
	}
	entry.failures++
}

// reset menghapus catatan, dipanggil setelah percobaan berhasil.
func (l *failureLimiter) reset(key string) {
	l.mu.Lock()
	delete(l.attempts, key)
	l.mu.Unlock()
}
