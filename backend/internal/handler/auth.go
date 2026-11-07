package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

type AuthHandler struct {
	queries *db.Queries
}

func NewAuthHandler(queries *db.Queries) *AuthHandler {
	return &AuthHandler{queries: queries}
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required,min=8"`
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

type loginAttempt struct {
	failures int
	first    time.Time
}

var (
	loginMu       sync.Mutex
	loginAttempts = map[string]*loginAttempt{}
)

func loginKey(c *gin.Context, email string) string {
	return c.ClientIP() + "|" + strings.ToLower(strings.TrimSpace(email))
}

func tooManyLoginAttempts(key string) bool {
	loginMu.Lock()
	defer loginMu.Unlock()
	a, ok := loginAttempts[key]
	if !ok {
		return false
	}
	if time.Since(a.first) > loginWindow {
		delete(loginAttempts, key)
		return false
	}
	return a.failures >= maxLoginFailures
}

func recordLoginFailure(key string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	a, ok := loginAttempts[key]
	if !ok || time.Since(a.first) > loginWindow {
		loginAttempts[key] = &loginAttempt{failures: 1, first: time.Now()}
		return
	}
	a.failures++
}

func clearLoginFailures(key string) {
	loginMu.Lock()
	delete(loginAttempts, key)
	loginMu.Unlock()
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

	// Pengguna pertama yang mendaftar menjadi owner; sisanya member.
	role := "member"
	if users, err := h.queries.ListUsers(c.Request.Context()); err == nil && len(users) == 0 {
		role = "owner"
	}

	user, err := h.queries.CreateUser(c.Request.Context(), db.CreateUserParams{
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hashedPassword,
		Role:         role,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": gin.H{"code": "USER_EXISTS", "message": "Email atau username sudah terdaftar."},
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"id":         user.ID,
			"email":      user.Email,
			"username":   user.Username,
			"role":       user.Role,
			"created_at": user.CreatedAt,
		},
	})
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
	if tooManyLoginAttempts(key) {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error": gin.H{"code": "RATE_LIMITED", "message": "Terlalu banyak percobaan login. Coba lagi dalam 15 menit."},
		})
		return
	}

	user, err := h.queries.GetUserByEmail(c.Request.Context(), req.Email)
	if err != nil {
		recordLoginFailure(key)
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "INVALID_CREDENTIALS", "message": "Email atau kata sandi salah."},
		})
		return
	}

	valid, err := auth.ComparePassword(req.Password, user.PasswordHash)
	if err != nil || !valid {
		recordLoginFailure(key)
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": gin.H{"code": "INVALID_CREDENTIALS", "message": "Email atau kata sandi salah."},
		})
		return
	}

	clearLoginFailures(key)

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
				"id":       user.ID,
				"email":    user.Email,
				"username": user.Username,
				"role":     user.Role,
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
			"id":         user.ID,
			"email":      user.Email,
			"username":   user.Username,
			"role":       user.Role,
			"created_at": user.CreatedAt,
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
