package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
	"nas-backend/internal/handler"
	"nas-backend/internal/migrate"
	"nas-backend/internal/storage"
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
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

	for _, allowed := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if strings.TrimSpace(allowed) == origin {
			return true
		}
	}

	if strings.EqualFold(host, "localhost") {
		return true
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() {
		return true
	}
	// Tailscale memakai rentang CGNAT 100.64.0.0/10 yang bukan "private" di Go.
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return true
	}
	return false
}

// validateAdminKey menolak start di mode release tanpa NAS_ADMIN_KEY.
//
// Di Docker, backend berada di belakang reverse proxy sehingga ClientIP
// adalah IP container (privat). Tanpa kunci, AdminKeyMiddleware akan
// mengizinkan semua request yang lewat proxy — persis bypass yang ingin
// ditutup. Mode debug dibiarkan longgar agar `go run` tetap praktis.
func validateAdminKey(ginMode, adminKey string) error {
	if ginMode == gin.ReleaseMode && strings.TrimSpace(adminKey) == "" {
		return errors.New("NAS_ADMIN_KEY wajib diisi saat GIN_MODE=release (buat dengan: openssl rand -hex 32)")
	}
	return nil
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := origin == "" || originAllowed(origin)

		if origin != "" && allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
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

func main() {
	port := getEnv("PORT", "8080")
	dbUrl := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable")
	storageDir := getEnv("STORAGE_DIR", "./data/storage")
	tempDir := getEnv("TEMP_DIR", "./data/tmp")
	thumbDir := getEnv("THUMBNAIL_DIR", "./data/thumbnails")

	log.Printf("[NAS Backend] Starting daemon on port %s...", port)
	log.Printf("[NAS Backend] Storage directory: %s", storageDir)

	if err := validateAdminKey(gin.Mode(), os.Getenv("NAS_ADMIN_KEY")); err != nil {
		log.Fatalf("Fatal: %v", err)
	}

	// 1. Initialize Storage Engine (Local CAS)
	store, err := storage.NewLocalStorage(storageDir)
	if err != nil {
		log.Fatalf("Fatal: Gagal menginisialisasi local storage: %v", err)
	}

	// 2. Connect to PostgreSQL Pool
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbUrl)
	var queries *db.Queries
	dbAvailable := false

	if err != nil {
		log.Printf("[NAS Backend] Peringatan: Tidak dapat terhubung ke PostgreSQL (%v). Menjalankan mode storage-only.", err)
	} else if pingErr := pool.Ping(ctx); pingErr != nil {
		log.Printf("[NAS Backend] Peringatan: Ping ke PostgreSQL gagal (%v). Menjalankan mode storage-only.", pingErr)
	} else {
		log.Println("[NAS Backend] Koneksi PostgreSQL berhasil terhubung.")

		// Terapkan migrasi sebelum handler melayani request.
		migrateCtx, migrateCancel := context.WithTimeout(context.Background(), 60*time.Second)
		migrationsDir := migrate.ResolveDir()
		switch {
		case migrationsDir == "":
			log.Println("[NAS Backend] Peringatan: folder migrasi tidak ditemukan; migrasi dilewati.")
		default:
			if mErr := migrate.Run(migrateCtx, pool, migrationsDir); mErr != nil {
				migrateCancel()
				log.Fatalf("Fatal: migrasi database gagal: %v", mErr)
			}
			log.Printf("[NAS Backend] Migrasi database siap (dir: %s)", migrationsDir)
		}
		migrateCancel()

		queries = db.New(pool)
		dbAvailable = true
	}

	// 3. Setup Router
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
			"database": dbAvailable,
			"version":  "1.0-mvp",
			"time":     time.Now().Format(time.RFC3339),
		})
	})

	// 3b. Fitur yang TIDAK bergantung pada PostgreSQL.
	// Google Drive OAuth & undangan keluarga disimpan sebagai file JSON,
	// sehingga tetap berfungsi walau database belum menyala.
	appURL := getEnv("APP_URL", "http://localhost:3000")
	dataDir := getEnv("DATA_DIR", "./data")

	gdriveHandler, err := handler.NewGDriveHandler(filepath.Join(dataDir, "gdrive.json"), appURL)
	if err != nil {
		log.Fatalf("Fatal: gagal menyiapkan penyimpanan Google Drive: %v", err)
	}
	inviteHandler, err := handler.NewInviteHandler(filepath.Join(dataDir, "invites.json"), appURL)
	if err != nil {
		log.Fatalf("Fatal: gagal menyiapkan penyimpanan undangan: %v", err)
	}

	// Google Drive OAuth callback harus publik: dipanggil lewat redirect browser
	// dari Google dan tidak bisa membawa header kustom.
	r.GET("/api/v1/gdrive/callback", gdriveHandler.Callback)

	// Endpoint sensitif: wajib admin key, atau akses dari jaringan lokal
	// bila NAS_ADMIN_KEY belum diset.
	admin := r.Group("/api/v1")
	admin.Use(auth.AdminKeyMiddleware())
	{
		// Google Drive
		admin.GET("/gdrive/status", gdriveHandler.Status)
		admin.POST("/gdrive/client", gdriveHandler.SaveClient)
		admin.GET("/gdrive/auth-url", gdriveHandler.AuthURL)
		admin.GET("/gdrive/quota", gdriveHandler.Quota)
		admin.GET("/gdrive/files", gdriveHandler.Files)
		admin.GET("/gdrive/file/:id/download", gdriveHandler.Download)
		admin.POST("/gdrive/upload", gdriveHandler.Upload)
		admin.POST("/gdrive/disconnect", gdriveHandler.Disconnect)

		// Undangan keluarga (persisten)
		admin.GET("/invites", inviteHandler.List)
		admin.POST("/invites", inviteHandler.Create)
		admin.DELETE("/invites/:id", inviteHandler.Revoke)
	}

	// Endpoint undangan publik tetap terbuka untuk anggota yang diundang.
	r.GET("/api/v1/public/invites/:token", inviteHandler.Peek)
	r.POST("/api/v1/public/invites/:token/accept", inviteHandler.Accept)

	log.Printf("[NAS Backend] Google Drive & undangan aktif (data: %s)", dataDir)

	if dbAvailable && queries != nil {
		authHandler := handler.NewAuthHandler(queries, inviteHandler)
		filesHandler := handler.NewFilesHandler(queries, store, tempDir, thumbDir)
		sharesHandler := handler.NewSharesHandler(queries)
		familyHandler := handler.NewFamilyHandler(queries)

		// Undangan yang diterima harus menunjuk ke UUID user sebenarnya, bukan
		// ID acak — supaya daftar anggota tidak punya dua identitas.
		inviteHandler.SetUserResolver(func(ctx context.Context, email string) (string, bool) {
			user, err := queries.GetUserByEmail(ctx, email)
			if err != nil {
				return "", false
			}
			return user.ID.String(), true
		})

		// Public Routes
		v1 := r.Group("/api/v1")
		{
			v1.POST("/auth/register", authHandler.Register)
			v1.POST("/auth/login", authHandler.Login)
			v1.POST("/auth/logout", authHandler.Logout)

			// Public External Share Endpoints
			v1.GET("/public/share/:token", sharesHandler.PublicGet)
			v1.POST("/public/share/:token/verify", sharesHandler.PublicVerifyPassword)
			v1.GET("/public/share/:token/download", sharesHandler.PublicDownload)
			v1.GET("/public/share/:token/archive", sharesHandler.PublicDownloadArchive)

			// Protected Routes
			protected := v1.Group("")
			protected.Use(auth.AuthMiddleware(queries))
			{
				protected.GET("/auth/me", authHandler.Me)

				// File Manager & Media Streaming
				protected.GET("/files", filesHandler.List)
				protected.GET("/media", filesHandler.ListMedia)
				protected.POST("/files/folder", filesHandler.CreateFolder)
				protected.POST("/files/upload", filesHandler.Upload)
				protected.DELETE("/files/:id", filesHandler.SoftDelete)
				protected.PATCH("/files/:id", filesHandler.Rename)
				protected.POST("/files/:id/move", filesHandler.Move)
				protected.GET("/files/:id/download", filesHandler.Download)
				protected.GET("/files/:id/stream", filesHandler.Stream)
				protected.GET("/files/:id/thumbnail", filesHandler.Thumbnail)

				// Trash (soft-delete recovery)
				protected.GET("/trash", filesHandler.ListTrash)
				protected.POST("/trash/:id/restore", filesHandler.Restore)
				protected.DELETE("/trash/:id", filesHandler.Purge)

				// Family Management
				protected.GET("/family/members", familyHandler.ListMembers)
				protected.POST("/family/invite", familyHandler.InviteMember)
				protected.PATCH("/family/members/:id/quota", familyHandler.UpdateMemberQuota)

				// Secure Shares Management
				protected.POST("/shares", sharesHandler.Create)
				protected.GET("/shares", sharesHandler.List)
				protected.DELETE("/shares/:id", sharesHandler.Delete)
			}
		}
	} else {
		log.Println("[NAS Backend] Mode storage-only: endpoint yang butuh PostgreSQL dinonaktifkan.")
	}

	// 4. Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server Listen error: %s\n", err)
		}
	}()

	log.Printf("[NAS Backend] Server berjalan di http://localhost:%s", port)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[NAS Backend] Mematikan server secara graceful...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server shutdown terpaksa: %v", err)
	}

	if pool != nil {
		pool.Close()
	}

	log.Println("[NAS Backend] Server telah berhenti bersih.")
}
