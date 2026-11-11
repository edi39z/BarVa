package auth

import (
	"crypto/subtle"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/db"
)

const AdminKeyHeader = "X-Admin-Key"

// IsLocalIP melaporkan apakah raw adalah alamat loopback, privat, link-local,
// atau CGNAT Tailscale (100.64.0.0/10, yang tidak dianggap privat oleh Go).
// Dipakai untuk membatasi endpoint admin dan origin CORS: keduanya harus
// memakai definisi "lokal" yang sama.
func IsLocalIP(raw string) bool {
	ip := net.ParseIP(raw)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
		return true
	}
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return true
	}
	return false
}

// AdminKeyMiddleware melindungi endpoint sensitif (Google Drive & undangan).
//
// Request diizinkan bila memenuhi SALAH SATU dari:
//  1. Sesi login yang valid milik pengguna dengan role "owner" atau "admin"
//     (bila database tersedia), sehingga pemilik NAS yang sudah login di web
//     tidak perlu menyalin NAS_ADMIN_KEY secara manual.
//  2. Header X-Admin-Key (atau query ?admin_key=) cocok dengan NAS_ADMIN_KEY.
//  3. NAS_ADMIN_KEY belum diset dan request datang dari jaringan lokal/Tailscale.
func AdminKeyMiddleware(queries ...*db.Queries) gin.HandlerFunc {
	key := strings.TrimSpace(os.Getenv("NAS_ADMIN_KEY"))
	var q *db.Queries
	if len(queries) > 0 {
		q = queries[0]
	}

	return func(c *gin.Context) {
		if q != nil && hasAdminSession(c, q) {
			c.Next()
			return
		}

		if key == "" {
			if IsLocalIP(c.ClientIP()) {
				c.Next()
				return
			}
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "FORBIDDEN", "message": "Endpoint ini hanya dapat diakses dari jaringan lokal."},
			})
			return
		}

		provided := c.GetHeader(AdminKeyHeader)
		if provided == "" {
			provided = c.Query("admin_key")
		}
		if subtle.ConstantTimeCompare([]byte(provided), []byte(key)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{"code": "ADMIN_KEY_REQUIRED", "message": "Admin key tidak valid."},
			})
			return
		}

		c.Next()
	}
}

func hasAdminSession(c *gin.Context, queries *db.Queries) bool {
	var rawToken string
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		rawToken = strings.TrimPrefix(authHeader, "Bearer ")
	}
	if rawToken == "" {
		if cookie, err := c.Cookie(CookieName); err == nil {
			rawToken = cookie
		}
	}
	if rawToken == "" {
		rawToken = c.Query("token")
	}
	if rawToken == "" {
		return false
	}

	session, err := queries.GetSessionByTokenHash(c.Request.Context(), HashToken(rawToken))
	if err != nil {
		return false
	}
	if session.Role != "owner" && session.Role != "admin" {
		return false
	}
	c.Set(ContextUserID, session.UserID)
	c.Set(ContextUserRole, session.Role)
	return true
}
