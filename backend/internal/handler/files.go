package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
	"nas-backend/internal/storage"
)

type FilesHandler struct {
	queries *db.Queries
	storage storage.StorageProvider
	tempDir string
}

func NewFilesHandler(queries *db.Queries, store storage.StorageProvider, tempDir string) *FilesHandler {
	_ = os.MkdirAll(tempDir, 0755)
	return &FilesHandler{
		queries: queries,
		storage: store,
		tempDir: tempDir,
	}
}

// maxUploadBytes membatasi ukuran upload agar disk tidak bisa dipenuhi
// satu request. Default 10 GB, dapat diubah lewat env MAX_UPLOAD_BYTES.
func maxUploadBytes() int64 {
	const defaultLimit = 10 << 30 // 10 GiB
	if raw := os.Getenv("MAX_UPLOAD_BYTES"); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 {
			return n
		}
	}
	return defaultLimit
}

// sniffMIME membaca 512 byte pertama untuk menentukan tipe berdasarkan isi
// file, bukan hanya header Content-Type dari klien.
func sniffMIME(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	buf := make([]byte, 512)
	n, err := f.Read(buf)
	if err != nil && n == 0 {
		return ""
	}
	return http.DetectContentType(buf[:n])
}

// resolveParent memvalidasi bahwa parent_id benar-benar folder milik user.
func (h *FilesHandler) resolveParent(ctx context.Context, userId pgtype.UUID, raw string) (pgtype.UUID, error) {
	var parentId pgtype.UUID
	if raw == "" || raw == "root" {
		return parentId, nil
	}
	if err := parentId.Scan(raw); err != nil {
		return parentId, errors.New("parent_id tidak valid")
	}

	node, err := h.queries.GetNodeByID(ctx, parentId)
	if err != nil {
		return parentId, errors.New("folder induk tidak ditemukan")
	}
	if node.OwnerID != userId {
		return parentId, errors.New("akses ke folder induk ditolak")
	}
	if !node.IsDirectory {
		return parentId, errors.New("parent_id bukan folder")
	}
	return parentId, nil
}

func (h *FilesHandler) List(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
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
		OwnerID:  userId,
		ParentID: parentId,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": err.Error()}})
		return
	}
	if nodes == nil {
		nodes = []db.ListNodesByParentRow{}
	}

	c.JSON(http.StatusOK, gin.H{"data": nodes})
}

func (h *FilesHandler) CreateFolder(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	var req struct {
		Name     string  `json:"name" binding:"required"`
		ParentID *string `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}

	var parentId pgtype.UUID
	if req.ParentID != nil {
		var parentErr error
		parentId, parentErr = h.resolveParent(c.Request.Context(), userId, *req.ParentID)
		if parentErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_PARENT", "message": parentErr.Error()}})
			return
		}
	}

	node, err := h.queries.CreateFileNode(c.Request.Context(), db.CreateFileNodeParams{
		OwnerID:     userId,
		ParentID:    parentId,
		Name:        req.Name,
		IsDirectory: true,
		ObjectID:    pgtype.UUID{},
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CONFLICT", "message": "Folder dengan nama tersebut sudah ada."}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": node})
}

func (h *FilesHandler) Upload(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	// Tolak lebih awal jika body melebihi batas, sebelum menulis ke disk.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBytes())

	fileHeader, err := c.FormFile("file")
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": gin.H{"code": "FILE_TOO_LARGE", "message": fmt.Sprintf("Ukuran file melebihi batas %d byte.", maxErr.Limit)}})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "FILE_REQUIRED", "message": "File upload diperlukan."}})
		return
	}

	srcFile, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "FILE_ERROR", "message": "Gagal membuka stream file."}})
		return
	}
	defer srcFile.Close()

	// Write to temporary disk while calculating SHA-256 (Zero RAM allocation)
	tmpFile, err := os.CreateTemp(h.tempDir, "upload-*")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "TMP_ERROR", "message": "Gagal membuat temporary file."}})
		return
	}
	tmpPath := tmpFile.Name()
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
	}()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(tmpFile, hasher)

	copiedBytes, err := io.Copy(multiWriter, srcFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "COPY_ERROR", "message": "Gagal menulis file ke disk."}})
		return
	}
	_ = tmpFile.Close()

	hashHex := hex.EncodeToString(hasher.Sum(nil))

	// Reopen tmp file to store via StorageProvider
	reader, err := os.Open(tmpPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "READ_ERROR", "message": "Gagal membaca hasil upload."}})
		return
	}
	defer reader.Close()

	if err := h.storage.Put(c.Request.Context(), hashHex, reader); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "STORAGE_ERROR", "message": "Gagal menyimpan ke storage CAS: " + err.Error()}})
		return
	}

	// Prioritaskan tipe hasil deteksi isi file; header klien hanya fallback.
	mimeType := sniffMIME(tmpPath)
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = fileHeader.Header.Get("Content-Type")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	physicalPath := h.storage.GetPhysicalPath(hashHex)

	fileObj, err := h.queries.CreateFileObject(c.Request.Context(), db.CreateFileObjectParams{
		Sha256:      hashHex,
		StoragePath: physicalPath,
		SizeBytes:   copiedBytes,
		MimeType:    mimeType,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal mencatat metadata objek: " + err.Error()}})
		return
	}

	// Parse & validasi folder induk
	parentId, parentErr := h.resolveParent(c.Request.Context(), userId, c.PostForm("parent_id"))
	if parentErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_PARENT", "message": parentErr.Error()}})
		return
	}

	node, err := h.queries.CreateFileNode(c.Request.Context(), db.CreateFileNodeParams{
		OwnerID:     userId,
		ParentID:    parentId,
		Name:        fileHeader.Filename,
		IsDirectory: false,
		ObjectID:    fileObj.ID,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CONFLICT", "message": "File dengan nama tersebut sudah ada di folder ini."}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"node":   node,
			"object": fileObj,
		},
	})
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

	// Validate ownership
	userId, ok := auth.GetUserID(c)
	if !ok || node.OwnerID != userId {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Akses ditolak."}})
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

	// Check ownership
	userId, ok := auth.GetUserID(c)
	if !ok || node.OwnerID != userId {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Akses ditolak."}})
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

func (h *FilesHandler) SoftDelete(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	nodeIdStr := c.Param("id")
	var nodeId pgtype.UUID
	if err := nodeId.Scan(nodeIdStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID file tidak valid."}})
		return
	}

	err := h.queries.SoftDeleteNode(c.Request.Context(), db.SoftDeleteNodeParams{
		ID:      nodeId,
		OwnerID: userId,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal menghapus file."}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "File berhasil dipindahkan ke trash bin."}})
}
