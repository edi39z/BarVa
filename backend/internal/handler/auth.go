package handler

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

type AuthHandler struct {
	queries *db.Queries
	invites *InviteHandler
}

func NewAuthHandler(queries *db.Queries, invites *InviteHandler) *AuthHandler {
	return &AuthHandler{queries: queries, invites: invites}
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required,min=8"`
	// InviteToken opsional: bila diisi, role dan kuota diambil dari undangan
	// alih-alih memakai default "member" tanpa kuota.
	InviteToken string `json:"invite_token"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Rate limiter login in-memory: cukup untuk satu keluarga di satu server.
// Tidak perlu Redis sebelum throughput membuktikan sebaliknya.
const (
	maxLoginFailures = 5
	loginWindow      = 15 * time.Minute
)

var loginLimiter = newFailureLimiter(maxLoginFailures, loginWindow)

func loginKey(c *gin.Context, email string) string {
	return c.ClientIP() + "|" + strings.ToLower(strings.TrimSpace(email))
}

func isSecureRequest(c *gin.Context) bool {
	return c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()},
		})
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{"code": "SERVER_ERROR", "message": "Gagal mengenkripsi kata sandi."},
		})
		return
	}

	role := "member"
	var quotaBytes int64
	inviteToken := strings.TrimSpace(req.InviteToken)

	if inviteToken != "" {
		if h.invites == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": gin.H{"code": "INVITE_UNAVAILABLE", "message": "Penyimpanan undangan belum siap di server ini."},
			})
			return
		}
		grant, gErr := h.invites.Grant(inviteToken)
		if gErr != nil {
			status, code, message := inviteErrorResponse(gErr)
			c.JSON(status, gin.H{"error": gin.H{"code": code, "message": message}})
			return
		}
		if !strings.EqualFold(grant.Email, strings.TrimSpace(req.Email)) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": gin.H{"code": "INVITE_EMAIL_MISMATCH", "message": "Email harus sama dengan email yang diundang."},
			})
			return
		}
		role = grant.Role
		if grant.QuotaGB > 0 {
			quotaBytes = int64(grant.QuotaGB) * 1024 * 1024 * 1024
		}
	}

	// Pengguna pertama yang mendaftar menjadi owner; sisanya mengikuti undangan.
	if users, err := h.queries.ListUsers(c.Request.Context()); err == nil && len(users) == 0 {
		role = "owner"
		quotaBytes = 0
	}

	user, err := h.queries.CreateUser(c.Request.Context(), db.CreateUserParams{
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hashedPassword,
		Role:         role,
		QuotaBytes:   quotaBytes,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": gin.H{"code": "USER_EXISTS", "message": "Email atau username sudah terdaftar."},
		})
		return
	}

	// Tautkan undangan ke akun yang baru dibuat. Kegagalan di sini tidak
	// membatalkan pendaftaran: akun sudah sah, dan anggota bisa menerima
	// undangan lagi lewat halaman /invite.
	if inviteToken != "" {
		if mErr := h.invites.MarkAccepted(inviteToken, user.ID.String()); mErr != nil {
			log.Printf("[auth] gagal menandai undangan diterima: %v", mErr)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"id":          user.ID,
			"email":       user.Email,
			"username":    user.Username,
			"role":        user.Role,
			"quota_bytes": user.QuotaBytes,
			"created_at":  user.CreatedAt,
		},
	})
}

// inviteErrorResponse memetakan error undangan ke status HTTP + kode klien.
func inviteErrorResponse(err error) (int, string, string) {
	switch err {
	case errRevoked:
		return http.StatusGone, "INVITE_REVOKED", "Undangan telah dicabut oleh pemilik."
	case errExpired:
		return http.StatusGone, "INVITE_EXPIRED", "Undangan sudah kedaluwarsa."
	case errUsed:
		return http.StatusConflict, "INVITE_USED", "Undangan ini sudah dipakai akun lain."
	default:
		return http.StatusNotFound, "INVITE_NOT_FOUND", "Undangan tidak ditemukan."
	}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()},
		})
		return
	}

	key := loginKey(c, req.Email)
	if loginLimiter.blocked(key) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": gin.H{"code": "RATE_LIMITED", "message": "Terlalu banyak percobaan login. Coba lagi dalam 15 menit."},
		})
		return
	}

	user, err := h.queries.GetUserByEmail(c.Request.Context(), req.Email)
	if err != nil {
		loginLimiter.fail(key)
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "INVALID_CREDENTIALS", "message": "Email atau kata sandi salah."},
		})
		return
	}

	valid, err := auth.ComparePassword(req.Password, user.PasswordHash)
	if err != nil || !valid {
		loginLimiter.fail(key)
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "INVALID_CREDENTIALS", "message": "Email atau kata sandi salah."},
		})
		return
	}

	loginLimiter.reset(key)

	// Generate 32 bytes random session token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{"code": "TOKEN_ERROR", "message": "Gagal menghasilkan token sesi."},
		})
		return
	}
	rawToken := hex.EncodeToString(tokenBytes)
	tokenHash := auth.HashSessionToken(rawToken)

	expiresAt := time.Now().Add(30 * 24 * time.Hour) // 30 days
	var expiresAtPg pgtype.Timestamptz
	_ = expiresAtPg.Scan(expiresAt)

	var userAgent pgtype.Text
	_ = userAgent.Scan(c.Request.UserAgent())

	var clientIp pgtype.Text
	_ = clientIp.Scan(c.ClientIP())

	_, err = h.queries.CreateSession(c.Request.Context(), db.CreateSessionParams{
		UserID:    user.ID,
		TokenHash: tokenHash,
		UserAgent: userAgent,
		ClientIp:  clientIp,
		ExpiresAt: expiresAtPg,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": gin.H{"code": "SESSION_ERROR", "message": "Gagal menyimpan sesi di database."},
		})
		return
	}

	// Set HTTP-Only Cookie
	c.SetCookie(
		auth.CookieName,
		rawToken,
		int(30*24*3600),
		"/",
		"",
		isSecureRequest(c), // secure otomatis saat HTTPS
		true,               // httpOnly
	)

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"token":      rawToken,
			"expires_at": expiresAt,
			"user": gin.H{
				"id":          user.ID,
				"email":       user.Email,
				"username":    user.Username,
				"role":        user.Role,
				"quota_bytes": user.QuotaBytes,
			},
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."},
		})
		return
	}

	user, err := h.queries.GetUserByID(c.Request.Context(), userId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": gin.H{"code": "USER_NOT_FOUND", "message": "Pengguna tidak ditemukan."},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"id":          user.ID,
			"email":       user.Email,
			"username":    user.Username,
			"role":        user.Role,
			"quota_bytes": user.QuotaBytes,
			"created_at":  user.CreatedAt,
		},
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var rawToken string
	authHeader := c.GetHeader("Authorization")
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		rawToken = authHeader[7:]
	} else if cookie, err := c.Cookie(auth.CookieName); err == nil {
		rawToken = cookie
	}

	if rawToken != "" {
		tokenHash := auth.HashSessionToken(rawToken)
		_ = h.queries.DeleteSessionByTokenHash(c.Request.Context(), tokenHash)
	}

	c.SetCookie(auth.CookieName, "", -1, "/", "", isSecureRequest(c), true)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "Berhasil logout."}})
}
