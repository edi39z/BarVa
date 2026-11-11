package main

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
	"nas-backend/internal/handler"
)

// routerConfig merangkum handler yang sudah siap dipakai. Field auth, files,
// shares, dan family bernilai nil saat mode storage-only, sehingga route yang
// membutuhkan PostgreSQL tidak didaftarkan sama sekali.
type routerConfig struct {
	dbAvailable bool
	queries     *db.Queries
	gdrive      *handler.GDriveHandler
	invites     *handler.InviteHandler
	auth        *handler.AuthHandler
	files       *handler.FilesHandler
	shares      *handler.SharesHandler
	family      *handler.FamilyHandler
	usage       *handler.UsageHandler
}

// originAllowed membatasi CORS ke jaringan lokal, Tailscale, dan daftar
// domain eksplisit dari env ALLOWED_ORIGINS (dipisah koma). Tanpa ini,
// origin mana pun bisa mengirim request ber-credential ke backend.
func originAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" {
		return false
	}
	host := u.Hostname()

	for _, allowed := range strings.Split(getEnv("ALLOWED_ORIGINS", ""), ",") {
		if strings.TrimSpace(allowed) == origin {
			return true
		}
	}

	if strings.EqualFold(host, "localhost") {
		return true
	}
	// Definisi "lokal" sama dengan yang dipakai AdminKeyMiddleware: loopback,
	// privat, link-local, dan CGNAT Tailscale.
	return auth.IsLocalIP(host)
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := origin == "" || originAllowed(origin)

		if origin != "" && allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Admin-Key")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")
		}

		if c.Request.Method == "OPTIONS" {
			if !allowed {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// newRouter menyusun seluruh tabel route. Semua endpoint berada di bawah satu
// grup /api/v1; sub-grup hanya membedakan lapisan otentikasi:
//   - publik       — tanpa middleware
//   - admin        — AdminKeyMiddleware (Google Drive & undangan)
//   - protected    — AuthMiddleware (data pengguna)
func newRouter(cfg routerConfig) *gin.Engine {
	r := gin.Default()
	// Hanya percayai X-Forwarded-For dari reverse proxy lokal agar ClientIP
	// tidak bisa dipalsukan klien.
	_ = r.SetTrustedProxies([]string{"127.0.0.1", "::1"})
	// Batasi memori multipart; sisanya dialirkan ke disk oleh Gin.
	r.MaxMultipartMemory = 8 << 20 // 8 MiB
	r.Use(corsMiddleware())

	// Health check — sengaja tidak membocorkan path storage/internal detail.
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":   "online",
			"database": cfg.dbAvailable,
			"version":  appVersion,
			"time":     time.Now().Format(time.RFC3339),
		})
	})

	v1 := r.Group("/api/v1")

	// Google Drive OAuth callback harus publik: dipanggil lewat redirect browser
	// dari Google dan tidak bisa membawa header kustom.
	v1.GET("/gdrive/callback", cfg.gdrive.Callback)

	// Endpoint sensitif: wajib admin key, atau akses dari jaringan lokal
	// bila NAS_ADMIN_KEY belum diset.
	admin := v1.Group("")
	admin.Use(auth.AdminKeyMiddleware())
	{
		admin.GET("/gdrive/status", cfg.gdrive.Status)
		admin.POST("/gdrive/client", cfg.gdrive.SaveClient)
		admin.GET("/gdrive/auth-url", cfg.gdrive.AuthURL)
		admin.GET("/gdrive/quota", cfg.gdrive.Quota)
		admin.GET("/gdrive/files", cfg.gdrive.Files)
		admin.GET("/gdrive/file/:id/download", cfg.gdrive.Download)
		admin.POST("/gdrive/upload", cfg.gdrive.Upload)
		admin.POST("/gdrive/disconnect", cfg.gdrive.Disconnect)

		admin.GET("/invites", cfg.invites.List)
		admin.POST("/invites", cfg.invites.Create)
		admin.DELETE("/invites/:id", cfg.invites.Revoke)
	}

	// Undangan publik tetap terbuka untuk anggota yang diundang.
	v1.GET("/public/invites/:token", cfg.invites.Peek)
	v1.POST("/public/invites/:token/accept", cfg.invites.Accept)

	// Route di bawah ini butuh PostgreSQL; dilewati seluruhnya di mode
	// storage-only.
	if cfg.dbAvailable && cfg.queries != nil {
		v1.POST("/auth/register", cfg.auth.Register)
		v1.POST("/auth/login", cfg.auth.Login)
		v1.POST("/auth/logout", cfg.auth.Logout)

		// Share link publik (tanpa sesi).
		v1.GET("/public/share/:token", cfg.shares.PublicGet)
		v1.POST("/public/share/:token/verify", cfg.shares.PublicVerifyPassword)
		v1.GET("/public/share/:token/download", cfg.shares.PublicDownload)
		v1.GET("/public/share/:token/archive", cfg.shares.PublicDownloadArchive)

		protected := v1.Group("")
		protected.Use(auth.AuthMiddleware(cfg.queries))
		{
			protected.GET("/auth/me", cfg.auth.Me)
			protected.GET("/auth/me/usage", cfg.usage.Summary)

			// File manager & media streaming.
			protected.GET("/files", cfg.files.List)
			protected.GET("/media", cfg.files.ListMedia)
			protected.POST("/files/folder", cfg.files.CreateFolder)
			protected.POST("/files/upload", cfg.files.Upload)
			protected.DELETE("/files/:id", cfg.files.SoftDelete)
			protected.PATCH("/files/:id", cfg.files.Rename)
			protected.POST("/files/:id/move", cfg.files.Move)
			protected.GET("/files/:id/download", cfg.files.Download)
			protected.GET("/files/:id/stream", cfg.files.Stream)
			protected.GET("/files/:id/thumbnail", cfg.files.Thumbnail)

			// Trash (soft-delete recovery).
			protected.GET("/trash", cfg.files.ListTrash)
			protected.POST("/trash/:id/restore", cfg.files.Restore)
			protected.DELETE("/trash/:id", cfg.files.Purge)

			// Family management.
			protected.GET("/family/members", cfg.family.ListMembers)
			protected.POST("/family/invite", cfg.family.InviteMember)
			protected.PATCH("/family/members/:id/quota", cfg.family.UpdateMemberQuota)

			// Secure shares management.
			protected.POST("/shares", cfg.shares.Create)
			protected.GET("/shares", cfg.shares.List)
			protected.DELETE("/shares/:id", cfg.shares.Delete)
		}
	}

	return r
}
