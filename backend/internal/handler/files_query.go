package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
)

func (h *FilesHandler) List(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	var parentId pgtype.UUID
	parentParam := c.Query("parent_id")
	if parentParam != "" && parentParam != "root" {
		parsed, err := uuid.Parse(parentParam)
		if err == nil {
			_ = parentId.Scan(parsed.String())
		}
	}

	nodes, err := h.queries.ListNodesByParent(c.Request.Context(), db.ListNodesByParentParams{
		AllOwners: canManageAllFiles(c),
		OwnerID:   userId,
		ParentID:  parentId,
	})
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal memuat daftar file.")
		return
	}
	if nodes == nil {
		nodes = []db.ListNodesByParentRow{}
	}

	c.JSON(http.StatusOK, gin.H{"data": nodes})
}

// Batas jumlah media yang dikirim ke galeri. Satu keluarga tidak akan
// melewati ini, tetapi batas tetap ada supaya respons tidak meledak.
const (
	defaultMediaLimit = 500
	maxMediaLimit     = 2000
)

// ListMedia mengembalikan seluruh foto & video milik pengguna lintas folder.
// Galeri memakai ini agar media di subfolder tidak tersembunyi.
func (h *FilesHandler) ListMedia(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	limit := defaultMediaLimit
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > maxMediaLimit {
		limit = maxMediaLimit
	}

	nodes, err := h.queries.ListMediaNodes(c.Request.Context(), db.ListMediaNodesParams{
		AllOwners: canManageAllFiles(c),
		OwnerID:   userId,
		RowLimit:  int32(limit),
	})
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal memuat daftar media.")
		return
	}
	if nodes == nil {
		nodes = []db.ListMediaNodesRow{}
	}

	c.JSON(http.StatusOK, gin.H{"data": nodes})
}

func (h *FilesHandler) Download(c *gin.Context) {
	nodeIdStr := c.Param("id")
	var nodeId pgtype.UUID
	if err := nodeId.Scan(nodeIdStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID file tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File tidak ditemukan."}})
		return
	}

	// Validate ownership (owner/admin boleh mengakses berkas anggota lain)
	if _, ok := requireNodeAccess(c, node.OwnerID); !ok {
		return
	}

	if node.IsDirectory {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "IS_DIRECTORY", "message": "Folder tidak dapat diunduh langsung."}})
		return
	}

	storagePath := node.StoragePath.String
	if _, err := os.Stat(storagePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "STORAGE_MISSING", "message": "File fisik tidak ditemukan di disk."}})
		return
	}

	cleanFilename := filepath.Base(node.Name)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, cleanFilename))
	c.Header("Content-Type", node.MimeType.String)
	c.File(storagePath)
}

func (h *FilesHandler) Stream(c *gin.Context) {
	nodeIdStr := c.Param("id")
	var nodeId pgtype.UUID
	if err := nodeId.Scan(nodeIdStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID file tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File tidak ditemukan."}})
		return
	}

	// Check ownership (owner/admin boleh mengakses berkas anggota lain)
	if _, ok := requireNodeAccess(c, node.OwnerID); !ok {
		return
	}

	storagePath := node.StoragePath.String
	file, err := os.Open(storagePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "STORAGE_MISSING", "message": "File fisik tidak dapat dibuka."}})
		return
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "STAT_ERROR", "message": "Gagal membaca stat file."}})
		return
	}

	// Handle Range headers & 206 Partial Content automatically via http.ServeContent
	mime := node.MimeType.String
	if strings.HasPrefix(mime, "video/") || strings.HasPrefix(mime, "audio/") {
		c.Header("Accept-Ranges", "bytes")
	}
	c.Header("Content-Type", mime)
	http.ServeContent(c.Writer, c.Request, node.Name, stat.ModTime(), file)
}
