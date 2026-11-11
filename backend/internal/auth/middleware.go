package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
)

const (
	ContextUserID   = "auth_user_id"
	ContextUserRole = "auth_user_role"
	ContextEmail    = "auth_user_email"
	CookieName      = "nas_session"
)

func AuthMiddleware(queries *db.Queries) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rawToken string

		// 1. Check Authorization Header (Bearer token)
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			rawToken = strings.TrimPrefix(authHeader, "Bearer ")
		}

		// 2. Check Cookie fallback
		if rawToken == "" {
			if cookie, err := c.Cookie(CookieName); err == nil {
				rawToken = cookie
			}
		}

		// 3. Check Query parameter fallback (useful for video/media streaming tags <video src="...">)
		if rawToken == "" {
			rawToken = c.Query("token")
		}

		if rawToken == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "UNAUTHORIZED",
					"message": "Autentikasi diperlukan. Silakan login terlebih dahulu.",
				},
			})
			return
		}

		tokenHash := HashToken(rawToken)
		session, err := queries.GetSessionByTokenHash(c.Request.Context(), tokenHash)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code":    "INVALID_SESSION",
					"message": "Sesi tidak valid atau telah kedaluwarsa.",
				},
			})
			return
		}

		// Store user details in context
		c.Set(ContextUserID, session.UserID)
		c.Set(ContextUserRole, session.Role)
		c.Set(ContextEmail, session.Email)

		c.Next()
	}
}

func GetUserID(c *gin.Context) (pgtype.UUID, bool) {
	val, exists := c.Get(ContextUserID)
	if !exists {
		return pgtype.UUID{}, false
	}
	id, ok := val.(pgtype.UUID)
	return id, ok
}

// GetUserRole mengembalikan role pengguna dari sesi ("owner", "admin",
// "member"), atau string kosong bila middleware belum dijalankan.
func GetUserRole(c *gin.Context) string {
	val, exists := c.Get(ContextUserRole)
	if !exists {
		return ""
	}
	role, _ := val.(string)
	return role
}
