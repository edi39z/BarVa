package handler

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/thumbnail"
)

// Thumbnail mengirim pratinjau JPEG dari berkas gambar. Hasilnya di-cache di
// disk dengan nama <sha256>_<sisi>.jpg; karena objek CAS tidak pernah berubah,
// cache tidak perlu divalidasi ulang.
func (h *FilesHandler) Thumbnail(c *gin.Context) {
	var nodeId pgtype.UUID
	if err := nodeId.Scan(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID file tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File tidak ditemukan."}})
		return
	}

	userId, ok := auth.GetUserID(c)
	if !ok || !canAccessNode(c, userId, node.OwnerID) {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Akses ditolak."}})
		return
	}

	if node.IsDirectory {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "IS_DIRECTORY", "message": "Folder tidak punya thumbnail."}})
		return
	}

	if !strings.HasPrefix(strings.ToLower(node.MimeType.String), "image/") {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": gin.H{"code": "NOT_IMAGE", "message": "Berkas ini bukan gambar."}})
		return
	}

	edge, ok := thumbnail.SizeFor(c.Query("size"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_SIZE", "message": "Ukuran hanya small atau large."}})
		return
	}

	sha := node.Sha256.String
	if sha == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "STORAGE_MISSING", "message": "Objek gambar tidak tercatat."}})
		return
	}

	etag := fmt.Sprintf(`"%s-%d"`, sha, edge)
	c.Header("ETag", etag)
	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	if c.GetHeader("If-None-Match") == etag {
		c.Status(http.StatusNotModified)
		return
	}

	cachePath := filepath.Join(h.thumbDir, fmt.Sprintf("%s_%d.jpg", sha, edge))
	if data, err := os.ReadFile(cachePath); err == nil && len(data) > 0 {
		c.Data(http.StatusOK, "image/jpeg", data)
		return
	}

	src, err := os.Open(node.StoragePath.String)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "STORAGE_MISSING", "message": "File fisik tidak dapat dibuka."}})
		return
	}
	defer src.Close()

	data, err := thumbnail.Generate(src, edge)
	if err != nil {
		switch {
		case errors.Is(err, thumbnail.ErrTooLarge):
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": gin.H{"code": "IMAGE_TOO_LARGE", "message": "Dimensi gambar terlalu besar untuk dibuat pratinjau."}})
		case errors.Is(err, thumbnail.ErrUnsupported):
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": gin.H{"code": "UNSUPPORTED_IMAGE", "message": "Format gambar tidak dapat diproses server."}})
		default:
			log.Printf("[thumbnail] gagal membuat pratinjau %q: %v", node.Name, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "THUMBNAIL_FAILED", "message": "Gagal membuat pratinjau."}})
		}
		return
	}

	if err := writeFileAtomic(cachePath, data); err != nil {
		// Cache gagal ditulis bukan alasan menggagalkan respons; pratinjau
		// tetap dikirim dan akan dibuat ulang pada permintaan berikutnya.
		log.Printf("[thumbnail] gagal menyimpan cache %s: %v", cachePath, err)
	}

	c.Data(http.StatusOK, "image/jpeg", data)
}

// writeFileAtomic menulis lewat berkas sementara di folder yang sama lalu
// rename, sehingga permintaan bersamaan tidak membaca berkas setengah jadi.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, ".thumb-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
