package handler

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

// sharePasswordLimiter mencegah brute force password share. Kuncinya
// IP+token: satu penyerang tidak bisa mengunci pemegang tautan lain, dan
// menebak password satu tautan tidak membuka tautan lain.
const (
	maxSharePasswordFailures = 5
	sharePasswordWindow      = 15 * time.Minute
)

var sharePasswordLimiter = newFailureLimiter(maxSharePasswordFailures, sharePasswordWindow)

func sharePasswordKey(c *gin.Context) string {
	return c.ClientIP() + "|" + c.Param("token")
}

// shareRateLimited mengirim 429 bila kunci sudah melewati batas. Mengembalikan
// true berarti respons sudah ditulis dan handler harus berhenti.
func shareRateLimited(c *gin.Context) bool {
	if !sharePasswordLimiter.blocked(sharePasswordKey(c)) {
		return false
	}
	c.JSON(http.StatusTooManyRequests, gin.H{
		"error": gin.H{"code": "RATE_LIMITED", "message": "Terlalu banyak percobaan password. Coba lagi dalam 15 menit."},
	})
	return true
}

// shareByToken memuat share dari token mentah. Respons 404 sudah dikirim bila
// token tidak valid atau kedaluwarsa.
func (h *SharesHandler) shareByToken(c *gin.Context) (db.GetShareByTokenHashRow, bool) {
	var tokenHashPg pgtype.Text
	_ = tokenHashPg.Scan(auth.HashToken(c.Param("token")))

	share, err := h.queries.GetShareByTokenHash(c.Request.Context(), tokenHashPg)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "SHARE_NOT_FOUND", "message": "Link berbagi tidak ditemukan atau telah kedaluwarsa."}})
		return share, false
	}
	return share, true
}

// authorizeShare memeriksa password share bila ada. Password boleh dikirim
// lewat header X-Share-Password atau query ?password= (dipakai navigasi
// browser yang tidak bisa menambah header).
func (h *SharesHandler) authorizeShare(c *gin.Context, share db.GetShareByTokenHashRow) bool {
	if !share.PasswordHash.Valid || share.PasswordHash.String == "" {
		return true
	}
	if shareRateLimited(c) {
		return false
	}

	pass := c.GetHeader("X-Share-Password")
	if pass == "" {
		pass = c.Query("password")
	}
	if pass == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "PASSWORD_REQUIRED", "message": "Password diperlukan untuk mengakses berkas ini."}})
		return false
	}

	valid, err := auth.ComparePassword(pass, share.PasswordHash.String)
	if err != nil || !valid {
		sharePasswordLimiter.fail(sharePasswordKey(c))
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PASSWORD", "message": "Password salah."}})
		return false
	}
	sharePasswordLimiter.reset(sharePasswordKey(c))
	return true
}

// PublicVerifyPassword memvalidasi password share tanpa menyentuh berkas.
// Dipakai halaman publik untuk membuka share folder, yang tidak punya berkas
// tunggal untuk diuji dengan permintaan Range.
func (h *SharesHandler) PublicVerifyPassword(c *gin.Context) {
	share, ok := h.shareByToken(c)
	if !ok {
		return
	}

	if !share.PasswordHash.Valid || share.PasswordHash.String == "" {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"valid": true}})
		return
	}
	if shareRateLimited(c) {
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	_ = c.ShouldBindJSON(&req)

	pass := req.Password
	if pass == "" {
		pass = c.GetHeader("X-Share-Password")
	}
	valid, err := auth.ComparePassword(pass, share.PasswordHash.String)
	if err != nil || !valid {
		sharePasswordLimiter.fail(sharePasswordKey(c))
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PASSWORD", "message": "Password salah."}})
		return
	}

	sharePasswordLimiter.reset(sharePasswordKey(c))
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"valid": true}})
}

// PublicDownloadArchive mengalirkan isi folder share sebagai zip tanpa
// menulis arsip sementara ke disk. Berkas yang hilang dari disk dilewati agar
// sisa arsip tetap bisa diunduh.
func (h *SharesHandler) PublicDownloadArchive(c *gin.Context) {
	share, ok := h.shareByToken(c)
	if !ok {
		return
	}
	if !share.IsDirectory {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "NOT_DIRECTORY", "message": "Tautan ini menunjuk ke berkas, bukan folder."}})
		return
	}
	if !h.authorizeShare(c, share) {
		return
	}

	nodes, err := h.queries.ListShareSubtreeNodes(c.Request.Context(), share.NodeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal membaca isi folder."}})
		return
	}
	if len(nodes) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "EMPTY_SHARE", "message": "Folder tidak lagi tersedia."}})
		return
	}

	byID := make(map[string]db.ListShareSubtreeNodesRow, len(nodes))
	for _, node := range nodes {
		byID[node.ID.String()] = node
	}
	rootID := share.NodeID.String()

	folderName := zipSafeName(share.NodeName)
	if folderName == "" {
		folderName = "folder"
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", attachmentDisposition(folderName+".zip"))
	c.Header("X-Content-Type-Options", "nosniff")

	zw := zip.NewWriter(c.Writer)
	defer func() {
		if err := zw.Close(); err != nil {
			log.Printf("[share-archive] gagal menutup zip: %v", err)
		}
	}()

	skipped := 0
	for _, node := range nodes {
		if node.ID.String() == rootID {
			continue
		}

		rel := relativeZipPath(node, byID, rootID)
		if rel == "" {
			continue
		}

		if node.IsDirectory {
			header := &zip.FileHeader{Name: rel + "/", Method: zip.Store, Modified: time.Now()}
			if _, err := zw.CreateHeader(header); err != nil {
				log.Printf("[share-archive] gagal menambah folder %q: %v", rel, err)
				return
			}
			continue
		}

		if !node.StoragePath.Valid || node.StoragePath.String == "" {
			skipped++
			continue
		}

		src, err := os.Open(node.StoragePath.String)
		if err != nil {
			log.Printf("[share-archive] berkas hilang, dilewati: %s", node.StoragePath.String)
			skipped++
			continue
		}

		header := &zip.FileHeader{Name: rel, Method: zip.Store, Modified: time.Now()}
		dst, err := zw.CreateHeader(header)
		if err != nil {
			_ = src.Close()
			log.Printf("[share-archive] gagal menambah %q: %v", rel, err)
			return
		}
		if _, err := io.Copy(dst, src); err != nil {
			_ = src.Close()
			log.Printf("[share-archive] gagal menyalin %q: %v", rel, err)
			return
		}
		_ = src.Close()
	}

	if skipped > 0 {
		log.Printf("[share-archive] %d berkas dilewati karena tidak ada di disk", skipped)
	}
}

// relativeZipPath menyusun path relatif terhadap folder yang dibagikan.
func relativeZipPath(node db.ListShareSubtreeNodesRow, byID map[string]db.ListShareSubtreeNodesRow, rootID string) string {
	parts := make([]string, 0, 4)
	cursor := node

	for i := 0; i < 256; i++ {
		if cursor.ID.String() == rootID {
			break
		}
		name := zipSafeName(cursor.Name)
		if name == "" {
			name = "tanpa-nama"
		}
		parts = append([]string{name}, parts...)

		parent, ok := byID[cursor.ParentID.String()]
		if !ok {
			break
		}
		cursor = parent
	}

	return strings.Join(parts, "/")
}

// zipSafeName memaksa satu komponen nama: tanpa garis miring, tanpa karakter
// kontrol, sehingga entri zip tidak bisa keluar dari direktorinya.
func zipSafeName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "." || name == ".." {
		return ""
	}
	return name
}

// attachmentDisposition menyertakan nama ASCII sederhana plus filename* untuk
// nama non-ASCII (huruf beraksen, karakter non-Latin).
func attachmentDisposition(filename string) string {
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, filename)

	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, url.PathEscape(filename))
}
