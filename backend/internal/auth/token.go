package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

// SessionTokenBytes adalah panjang entropi token sesi dan share link (256 bit).
const SessionTokenBytes = 32

// NewToken membuat token acak berbentuk hex. Hex dipakai untuk token yang
// dikirim lewat header atau dibandingkan sebagai string: tanpa padding, aman
// di URL, dan panjangnya selalu 2× nBytes.
func NewToken(nBytes int) (string, error) {
	b, err := randomBytes(nBytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// NewURLToken membuat token acak base64url tanpa padding — lebih pendek untuk
// jumlah entropi yang sama. Dipakai di tautan undangan, ID record, dan state
// OAuth yang muncul di URL.
func NewURLToken(nBytes int) (string, error) {
	b, err := randomBytes(nBytes)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashToken mengembalikan SHA-256 hex dari token mentah. Database hanya
// menyimpan bentuk hash ini; token mentah tidak pernah ditulis ke disk.
func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}

func randomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	return b, nil
}
