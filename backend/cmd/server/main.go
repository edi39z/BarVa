package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"nas-backend/internal/db"
	"nas-backend/internal/handler"
	"nas-backend/internal/migrate"
	"nas-backend/internal/storage"
)

// appVersion dilaporkan oleh /health. Samakan dengan "version" di
// frontend/package.json setiap kali versi dinaikkan.
const appVersion = "0.1.0"

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// minAdminKeyLength adalah panjang minimum NAS_ADMIN_KEY. `openssl rand -hex 32`
// menghasilkan 64 karakter, jadi 32 sudah cukup longgar untuk kunci acak.
const minAdminKeyLength = 32

// placeholderAdminKeyPrefixes menolak nilai contoh yang ikut tersalin dari
// .env.example. Kunci yang diketahui publik sama berbahayanya dengan kunci kosong.
var placeholderAdminKeyPrefixes = []string{
	"ganti_dengan",
	"ganti-",
	"changeme",
	"change_me",
	"example",
	"contoh",
}

// validateAdminKey menolak start di mode release tanpa kunci yang layak.
//
// Di Docker, backend berada di belakang reverse proxy sehingga ClientIP
// adalah IP container (privat). Tanpa kunci, AdminKeyMiddleware akan
// mengizinkan semua request yang lewat proxy — persis bypass yang ingin
// ditutup. Mode debug dibiarkan longgar agar `go run` tetap praktis.
func validateAdminKey(ginMode, adminKey string) error {
	if ginMode != gin.ReleaseMode {
		return nil
	}

	key := strings.TrimSpace(adminKey)
	if key == "" {
		return errors.New("NAS_ADMIN_KEY wajib diisi saat GIN_MODE=release (buat dengan: openssl rand -hex 32)")
	}

	lower := strings.ToLower(key)
	for _, prefix := range placeholderAdminKeyPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return errors.New("NAS_ADMIN_KEY masih memakai nilai contoh; buat kunci acak dengan: openssl rand -hex 32")
		}
	}

	if len(key) < minAdminKeyLength {
		return fmt.Errorf("NAS_ADMIN_KEY terlalu pendek (%d karakter, minimal %d); buat dengan: openssl rand -hex 32", len(key), minAdminKeyLength)
	}
	return nil
}

func main() {
	port := getEnv("PORT", "8080")
	dbUrl := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable")
	storageDir := getEnv("STORAGE_DIR", "./data/storage")
	tempDir := getEnv("TEMP_DIR", "./data/tmp")
	thumbDir := getEnv("THUMBNAIL_DIR", "./data/thumbnails")

	log.Printf("[Barva] Starting daemon on port %s...", port)
	log.Printf("[Barva] Storage directory: %s", storageDir)

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
		log.Printf("[Barva] Peringatan: Tidak dapat terhubung ke PostgreSQL (%v). Menjalankan mode storage-only.", err)
	} else if pingErr := pool.Ping(ctx); pingErr != nil {
		log.Printf("[Barva] Peringatan: Ping ke PostgreSQL gagal (%v). Menjalankan mode storage-only.", pingErr)
	} else {
		log.Println("[Barva] Koneksi PostgreSQL berhasil terhubung.")

		// Terapkan migrasi sebelum handler melayani request.
		migrateCtx, migrateCancel := context.WithTimeout(context.Background(), 60*time.Second)
		migrationsDir := migrate.ResolveDir()
		switch {
		case migrationsDir == "":
			log.Println("[Barva] Peringatan: folder migrasi tidak ditemukan; migrasi dilewati.")
		default:
			if mErr := migrate.Run(migrateCtx, pool, migrationsDir); mErr != nil {
				migrateCancel()
				log.Fatalf("Fatal: migrasi database gagal: %v", mErr)
			}
			log.Printf("[Barva] Migrasi database siap (dir: %s)", migrationsDir)
		}
		migrateCancel()

		queries = db.New(pool)
		dbAvailable = true
	}

	// 3. Fitur yang TIDAK bergantung pada PostgreSQL: Google Drive OAuth dan
	// undangan keluarga disimpan sebagai file JSON, sehingga tetap berfungsi
	// walau database belum menyala.
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
	log.Printf("[Barva] Google Drive & undangan aktif (data: %s)", dataDir)

	// 4. Rakit handler + tabel route.
	cfg := routerConfig{
		dbAvailable: dbAvailable,
		queries:     queries,
		gdrive:      gdriveHandler,
		invites:     inviteHandler,
	}
	if dbAvailable && queries != nil {
		cfg.auth = handler.NewAuthHandler(queries, inviteHandler)
		cfg.files = handler.NewFilesHandler(queries, store, tempDir, thumbDir)
		cfg.shares = handler.NewSharesHandler(queries)
		cfg.family = handler.NewFamilyHandler(queries)

		// Undangan yang diterima harus menunjuk ke UUID user sebenarnya, bukan
		// ID acak — supaya daftar anggota tidak punya dua identitas.
		inviteHandler.SetUserResolver(func(ctx context.Context, email string) (string, bool) {
			user, err := queries.GetUserByEmail(ctx, email)
			if err != nil {
				return "", false
			}
			return user.ID.String(), true
		})
	} else {
		log.Println("[Barva] Mode storage-only: endpoint yang butuh PostgreSQL dinonaktifkan.")
	}

	// 5. Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: newRouter(cfg),
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server Listen error: %s\n", err)
		}
	}()

	log.Printf("[Barva] Server berjalan di http://localhost:%s", port)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Barva] Mematikan server secara graceful...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server shutdown terpaksa: %v", err)
	}

	if pool != nil {
		pool.Close()
	}

	log.Println("[Barva] Server telah berhenti bersih.")
}
