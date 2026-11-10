package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

type SharesHandler struct {
	queries *db.Queries
}

func NewSharesHandler(queries *db.Queries) *SharesHandler {
	return &SharesHandler{queries: queries}
}

type CreateShareRequest struct {
	NodeID     string  `json:"node_id" binding:"required"`
	Permission string  `json:"permission"` // viewer, editor, uploader
	Password   *string `json:"password"`
	ExpiresIn  *string `json:"expires_in"` // "24h", "7d", "30d", or null
}

func (h *SharesHandler) Create(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	var req CreateShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
		return
	}

	var nodeId pgtype.UUID
	if err := nodeId.Scan(req.NodeID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_NODE_ID", "message": "ID node tidak valid."}})
		return
	}

	// Verify node exists & owned by user
	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil || node.OwnerID != userId {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File atau folder tidak ditemukan."}})
		return
	}

	// Generate 32 bytes random token
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "RANDOM_ERROR", "message": "Gagal menghasilkan token."}})
		return
	}
	rawToken := hex.EncodeToString(tokenBytes)
	hSum := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hSum[:])

	var passHash pgtype.Text
	if req.Password != nil && *req.Password != "" {
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "PASSWORD_ERROR", "message": "Gagal mengenkripsi password share."}})
			return
		}
		_ = passHash.Scan(hash)
	}

	var expiresAt pgtype.Timestamptz
	if req.ExpiresIn != nil && *req.ExpiresIn != "" {
		var d time.Duration
		switch *req.ExpiresIn {
		case "24h":
			d = 24 * time.Hour
		case "7d":
			d = 7 * 24 * time.Hour
		case "30d":
			d = 30 * 24 * time.Hour
		default:
			d = 24 * time.Hour
		}
		_ = expiresAt.Scan(time.Now().Add(d))
	}

	perm := "viewer"
	if req.Permission == "editor" || req.Permission == "uploader" {
		perm = req.Permission
	}

	var tokenHashPg pgtype.Text
	_ = tokenHashPg.Scan(tokenHash)

	share, err := h.queries.CreateShare(c.Request.Context(), db.CreateShareParams{
		NodeID:         nodeId,
		CreatedBy:      userId,
		ShareTokenHash: tokenHashPg,
		PasswordHash:   passHash,
		Permission:     perm,
		ExpiresAt:      expiresAt,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal membuat share link: " + err.Error()}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"id":         share.ID,
			"raw_token":  rawToken,
			"link_url":   fmt.Sprintf("/s/%s", rawToken),
			"permission": share.Permission,
			"expires_at": share.ExpiresAt,
			"created_at": share.CreatedAt,
		},
	})
}

func (h *SharesHandler) List(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	shares, err := h.queries.ListSharesByOwner(c.Request.Context(), userId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": err.Error()}})
		return
	}
	if shares == nil {
		shares = []db.ListSharesByOwnerRow{}
	}

	c.JSON(http.StatusOK, gin.H{"data": shares})
}

func (h *SharesHandler) Delete(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	shareIdStr := c.Param("id")
	var shareId pgtype.UUID
	if err := shareId.Scan(shareIdStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID share tidak valid."}})
		return
	}

	err := h.queries.DeleteShare(c.Request.Context(), db.DeleteShareParams{
		ID:        shareId,
		CreatedBy: userId,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": err.Error()}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "Share link berhasil dicabut."}})
}

func (h *SharesHandler) PublicGet(c *gin.Context) {
	rawToken := c.Param("token")
	hSum := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hSum[:])

	var tokenHashPg pgtype.Text
	_ = tokenHashPg.Scan(tokenHash)

	share, err := h.queries.GetShareByTokenHash(c.Request.Context(), tokenHashPg)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "SHARE_NOT_FOUND", "message": "Link berbagi tidak ditemukan atau telah kedaluwarsa."}})
		return
	}

	hasPassword := share.PasswordHash.Valid && share.PasswordHash.String != ""

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"node_name":    share.NodeName,
			"is_directory": share.IsDirectory,
			"size_bytes":   share.SizeBytes,
			"mime_type":    share.MimeType,
			"permission":   share.Permission,
			"expires_at":   share.ExpiresAt,
			"has_password": hasPassword,
		},
	})
}

func (h *SharesHandler) PublicDownload(c *gin.Context) {
	share, ok := h.shareByToken(c)
	if !ok {
		return
	}
	if !h.authorizeShare(c, share) {
		return
	}

	if share.IsDirectory {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "IS_DIRECTORY", "message": "Tautan ini menunjuk ke folder. Gunakan unduhan arsip."}})
		return
	}

	storagePath := share.StoragePath.String
	if _, err := os.Stat(storagePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "STORAGE_MISSING", "message": "File fisik tidak ditemukan di disk server."}})
		return
	}

	cleanFilename := filepath.Base(share.NodeName)
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, cleanFilename))
	c.Header("Content-Type", share.MimeType.String)
	c.File(storagePath)
}
