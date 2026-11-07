package auth

import (
	"crypto/subtle"
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

const AdminKeyHeader = "X-Admin-Key"

func isLocalOrPrivateIP(raw string) bool {
	ip := net.ParseIP(raw)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
		return true
	}
	// Tailscale memakai CGNAT 100.64.0.0/10 yang tidak dianggap private oleh Go.
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return true
	}
	return false
}

// AdminKeyMiddleware melindungi endpoint sensitif (Google Drive & undangan).
//
// Jika NAS_ADMIN_KEY diset, request wajib membawa key yang sama lewat header
// X-Admin-Key (atau query ?admin_key= untuk tautan unduhan langsung).
// Jika belum diset, hanya klien dari jaringan lokal/private/Tailscale yang
// diizinkan — sehingga endpoint tidak otomatis terbuka ke internet.
func AdminKeyMiddleware() gin.HandlerFunc {
	key := strings.TrimSpace(os.Getenv("NAS_ADMIN_KEY"))

	return func(c *gin.Context) {
		if key == "" {
			if isLocalOrPrivateIP(c.ClientIP()) {
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
