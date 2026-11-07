package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/store"
)

// InviteHandler menyimpan undangan anggota keluarga di file JSON sehingga
// undangan benar-benar hidup di server: pemilik bisa melihat status
// (menunggu / diterima / dicabut) dan tautan tetap berlaku setelah restart.
// Tanpa ini, undangan hanya menulis ke localStorage browser pengundang —
// itulah sebabnya anggota yang diundang tidak melihat apa pun.
type InviteHandler struct {
	store  *store.FileStore
	appURL string
}

type inviteRecord struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	QuotaGB   int    `json:"quota_gb"`
	TokenHash string `json:"token_hash"`
	TokenHint string `json:"token_hint"`
	Status    string `json:"status"` // pending | accepted | revoked | expired
	CreatedAt string `json:"created_at"`
	ExpiresAt string `json:"expires_at"`
	AcceptedAt string `json:"accepted_at,omitempty"`
}

type memberRecord struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	QuotaGB  int    `json:"quota_gb"`
	JoinedAt string `json:"joined_at"`
	InviteID string `json:"invite_id"`
}

type inviteDB struct {
	Invites []inviteRecord `json:"invites"`
	Members []memberRecord `json:"members"`
}

func NewInviteHandler(dbPath, appURL string) (*InviteHandler, error) {
	st, err := store.New(dbPath)
	if err != nil {
		return nil, err
	}
	return &InviteHandler{store: st, appURL: strings.TrimRight(appURL, "/")}, nil
}

func newID(prefix string) string {
	b := make([]byte, 9)
	rand.Read(b)
	return prefix + base64.RawURLEncoding.EncodeToString(b)
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// ---- middleware-ish guard: hanya pemilik ----

// Create -> POST /api/v1/invites
func (h *InviteHandler) Create(c *gin.Context) {
	var in struct {
		Name           string `json:"name"`
		Email          string `json:"email"`
		Role           string `json:"role"`
		QuotaGB        int    `json:"quota_gb"`
		ExpiresInHours int    `json:"expires_in_hours"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payload tidak valid"})
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.Name == "" || in.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nama dan email wajib diisi"})
		return
	}
	if in.Role == "" {
		in.Role = "member"
	}
	if in.QuotaGB <= 0 {
		in.QuotaGB = 100
	}
	if in.ExpiresInHours <= 0 {
		in.ExpiresInHours = 24 * 7
	}

	raw := base64.RawURLEncoding.EncodeToString(mustRand(32))
	now := time.Now()

	rec := inviteRecord{
		ID:        newID("inv_"),
		Name:      in.Name,
		Email:     in.Email,
		Role:      in.Role,
		QuotaGB:   in.QuotaGB,
		TokenHash: hashToken(raw),
		TokenHint: raw[:8],
		Status:    "pending",
		CreatedAt: now.Format(time.RFC3339),
		ExpiresAt: now.Add(time.Duration(in.ExpiresInHours) * time.Hour).Format(time.RFC3339),
	}

	var db inviteDB
	if err := h.store.Update(&db, func() error {
		db.Invites = append(db.Invites, rec)
		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"invite": gin.H{
			"id": rec.ID, "name": rec.Name, "email": rec.Email, "role": rec.Role,
			"quota_gb": rec.QuotaGB, "status": rec.Status,
			"created_at": rec.CreatedAt, "expires_at": rec.ExpiresAt,
		},
		"token": raw,
		"url":   h.appURL + "/invite/" + raw,
		"web_url": h.appURL + "/invite?token=" + raw,
	})
}

// List -> GET /api/v1/invites
func (h *InviteHandler) List(c *gin.Context) {
	var db inviteDB
	if err := h.store.Load(&db); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	now := time.Now()
	// tandai yang kedaluwarsa saat dibaca, tanpa menulis ulang file
	for i := range db.Invites {
		if db.Invites[i].Status == "pending" {
			if exp, err := time.Parse(time.RFC3339, db.Invites[i].ExpiresAt); err == nil && now.After(exp) {
				db.Invites[i].Status = "expired"
			}
		}
	}
	sort.Slice(db.Invites, func(i, j int) bool { return db.Invites[i].CreatedAt > db.Invites[j].CreatedAt })

	// Jangan pernah kirim hash token ke klien.
	type publicInvite struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Email      string `json:"email"`
		Role       string `json:"role"`
		QuotaGB    int    `json:"quota_gb"`
		TokenHint  string `json:"token_hint"`
		Status     string `json:"status"`
		CreatedAt  string `json:"created_at"`
		ExpiresAt  string `json:"expires_at"`
		AcceptedAt string `json:"accepted_at,omitempty"`
	}
	out := make([]publicInvite, 0, len(db.Invites))
	for _, v := range db.Invites {
		out = append(out, publicInvite{
			ID: v.ID, Name: v.Name, Email: v.Email, Role: v.Role, QuotaGB: v.QuotaGB,
			TokenHint: v.TokenHint, Status: v.Status, CreatedAt: v.CreatedAt,
			ExpiresAt: v.ExpiresAt, AcceptedAt: v.AcceptedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"invites": out,
		"members": db.Members,
		"counts": gin.H{
			"pending":  countStatus(db.Invites, "pending"),
			"accepted": countStatus(db.Invites, "accepted"),
			"expired":  countStatus(db.Invites, "expired"),
			"revoked":  countStatus(db.Invites, "revoked"),
		},
	})
}

func countStatus(in []inviteRecord, s string) int {
	n := 0
	for _, v := range in {
		if v.Status == s {
			n++
		}
	}
	return n
}

// Revoke -> DELETE /api/v1/invites/:id
func (h *InviteHandler) Revoke(c *gin.Context) {
	id := c.Param("id")
	var db inviteDB
	found := false
	if err := h.store.Update(&db, func() error {
		for i := range db.Invites {
			if db.Invites[i].ID == id {
				db.Invites[i].Status = "revoked"
				found = true
			}
		}
		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "undangan tidak ditemukan"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// Peek -> GET /api/v1/public/invites/:token
// Dipakai halaman /invite untuk menampilkan nama & kuota sebelum diterima.
func (h *InviteHandler) Peek(c *gin.Context) {
	token := c.Param("token")
	var db inviteDB
	if err := h.store.Load(&db); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	hash := hashToken(token)
	for _, inv := range db.Invites {
		if inv.TokenHash == hash {
			if inv.Status == "revoked" {
				c.JSON(http.StatusGone, gin.H{"error": "undangan telah dicabut"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"valid":      inv.Status == "pending",
				"status":     inv.Status,
				"name":       inv.Name,
				"email":      inv.Email,
				"role":       inv.Role,
				"quota_gb":   inv.QuotaGB,
				"expires_at": inv.ExpiresAt,
			})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "undangan tidak ditemukan"})
}

// Accept -> POST /api/v1/public/invites/:token/accept
func (h *InviteHandler) Accept(c *gin.Context) {
	token := c.Param("token")
	hash := hashToken(token)
	var db inviteDB
	var result *memberRecord

	err := h.store.Update(&db, func() error {
		now := time.Now()
		for i := range db.Invites {
			inv := &db.Invites[i]
			if inv.TokenHash != hash {
				continue
			}
			if inv.Status == "accepted" {
				// sudah pernah diterima: kembalikan data anggota yang ada
				for j := range db.Members {
					if db.Members[j].InviteID == inv.ID {
						m := db.Members[j]
						result = &m
						return nil
					}
				}
			}
			if inv.Status == "revoked" {
				return errRevoked
			}
			if exp, perr := time.Parse(time.RFC3339, inv.ExpiresAt); perr == nil && now.After(exp) {
				return errExpired
			}

			inv.Status = "accepted"
			inv.AcceptedAt = now.Format(time.RFC3339)
			m := memberRecord{
				ID:       newID("usr_"),
				Name:     inv.Name,
				Email:    inv.Email,
				Role:     inv.Role,
				QuotaGB:  inv.QuotaGB,
				JoinedAt: now.Format(time.RFC3339),
				InviteID: inv.ID,
			}
			db.Members = append(db.Members, m)
			result = &m
			return nil
		}
		return errNotFound
	})

	switch err {
	case nil:
		c.JSON(http.StatusOK, gin.H{"success": true, "member": result})
	case errRevoked:
		c.JSON(http.StatusGone, gin.H{"error": "undangan telah dicabut oleh pemilik"})
	case errExpired:
		c.JSON(http.StatusGone, gin.H{"error": "undangan sudah kedaluwarsa"})
	case errNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "undangan tidak ditemukan"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func mustRand(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}

var (
	errRevoked  = &inviteErr{"undangan dicabut"}
	errExpired  = &inviteErr{"undangan kedaluwarsa"}
	errNotFound = &inviteErr{"undangan tidak ditemukan"}
)

type inviteErr struct{ msg string }

func (e *inviteErr) Error() string { return e.msg }
