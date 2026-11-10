package handler

import (
	"path/filepath"
	"testing"
	"time"
)

func newTestInviteHandler(t *testing.T) *InviteHandler {
	t.Helper()

	h, err := NewInviteHandler(filepath.Join(t.TempDir(), "invites.json"), "http://localhost:3000")
	if err != nil {
		t.Fatalf("NewInviteHandler: %v", err)
	}
	return h
}

func seedInvite(t *testing.T, h *InviteHandler, rec inviteRecord) {
	t.Helper()

	var db inviteDB
	if err := h.store.Update(&db, func() error {
		db.Invites = append(db.Invites, rec)
		return nil
	}); err != nil {
		t.Fatalf("seed invite: %v", err)
	}
}

func TestNormalizeInviteRole(t *testing.T) {
	cases := map[string]string{
		"admin":  "admin",
		"ADMIN":  "admin",
		" admin": "admin",
		"member": "member",
		"owner":  "member", // owner hanya untuk pengguna pertama
		"":       "member",
	}

	for in, want := range cases {
		if got := normalizeInviteRole(in); got != want {
			t.Errorf("normalizeInviteRole(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestInviteGrantReturnsRoleAndQuota(t *testing.T) {
	h := newTestInviteHandler(t)
	const raw = "token-uji"

	seedInvite(t, h, inviteRecord{
		ID:        "inv_1",
		Name:      "Budi",
		Email:     "budi@example.com",
		Role:      "admin",
		QuotaGB:   50,
		TokenHash: hashToken(raw),
		Status:    "pending",
		ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339),
	})

	grant, err := h.Grant(raw)
	if err != nil {
		t.Fatalf("Grant: %v", err)
	}
	if grant.Role != "admin" {
		t.Errorf("role = %q, want admin", grant.Role)
	}
	if grant.QuotaGB != 50 {
		t.Errorf("quota = %d, want 50", grant.QuotaGB)
	}
	if grant.Email != "budi@example.com" {
		t.Errorf("email = %q", grant.Email)
	}

	if _, err := h.Grant("token-salah"); err != errNotFound {
		t.Errorf("token salah err = %v, want errNotFound", err)
	}
}

func TestInviteGrantRejectsUnusableInvite(t *testing.T) {
	h := newTestInviteHandler(t)

	seedInvite(t, h, inviteRecord{
		ID: "inv_rev", TokenHash: hashToken("rev"), Status: "revoked",
		ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339),
	})
	if _, err := h.Grant("rev"); err != errRevoked {
		t.Errorf("revoked err = %v, want errRevoked", err)
	}

	seedInvite(t, h, inviteRecord{
		ID: "inv_exp", TokenHash: hashToken("exp"), Status: "pending",
		ExpiresAt: time.Now().Add(-time.Hour).Format(time.RFC3339),
	})
	if _, err := h.Grant("exp"); err != errExpired {
		t.Errorf("expired err = %v, want errExpired", err)
	}

	seedInvite(t, h, inviteRecord{
		ID: "inv_used", TokenHash: hashToken("used"), Status: "accepted",
		ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339),
	})
	if _, err := h.Grant("used"); err != errUsed {
		t.Errorf("accepted err = %v, want errUsed", err)
	}
}

func TestMarkAcceptedLinksMemberToUserID(t *testing.T) {
	h := newTestInviteHandler(t)
	const raw = "token-taut"

	seedInvite(t, h, inviteRecord{
		ID:        "inv_taut",
		Name:      "Sari",
		Email:     "sari@example.com",
		Role:      "member",
		QuotaGB:   100,
		TokenHash: hashToken(raw),
		Status:    "pending",
		ExpiresAt: time.Now().Add(time.Hour).Format(time.RFC3339),
	})

	const userID = "11111111-2222-3333-4444-555555555555"
	if err := h.MarkAccepted(raw, userID); err != nil {
		t.Fatalf("MarkAccepted: %v", err)
	}
	// Dipanggil dua kali tidak boleh menambah anggota duplikat.
	if err := h.MarkAccepted(raw, userID); err != nil {
		t.Fatalf("MarkAccepted kedua: %v", err)
	}

	var db inviteDB
	if err := h.store.Load(&db); err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(db.Members) != 1 {
		t.Fatalf("jumlah anggota = %d, want 1", len(db.Members))
	}
	if db.Members[0].ID != userID {
		t.Errorf("member id = %q, want %q", db.Members[0].ID, userID)
	}
	if db.Invites[0].Status != "accepted" {
		t.Errorf("status undangan = %q, want accepted", db.Invites[0].Status)
	}
	if _, err := h.Grant(raw); err != errUsed {
		t.Errorf("setelah diterima, Grant err = %v, want errUsed", err)
	}
}

func TestMarkAcceptedUnknownToken(t *testing.T) {
	h := newTestInviteHandler(t)
	if err := h.MarkAccepted("tidak-ada", "uuid"); err != errNotFound {
		t.Errorf("err = %v, want errNotFound", err)
	}
}
