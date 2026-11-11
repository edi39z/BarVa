package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
)

func (h *FilesHandler) CreateFolder(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	var req struct {
		Name     string  `json:"name" binding:"required"`
		ParentID *string `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "Payload folder tidak valid.")
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

// Rename mengubah nama file/folder. Nama harus unik di dalam folder yang sama.
func (h *FilesHandler) Rename(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	nodeId, ok := parseUUIDParam(c, "id", "ID tidak valid.")
	if !ok {
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": "Nama wajib diisi."}})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 255 || strings.ContainsAny(name, "/\\") || strings.ContainsRune(name, 0) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_NAME", "message": "Nama tidak valid. Hindari garis miring, maksimal 255 karakter."}})
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File atau folder tidak ditemukan."}})
		return
	}
	if !canAccessNode(c, userId, node.OwnerID) {
		forbid(c, "FORBIDDEN", "Akses ditolak.")
		return
	}

	renamed, err := h.queries.RenameNode(c.Request.Context(), db.RenameNodeParams{
		ID:      nodeId,
		OwnerID: node.OwnerID,
		Name:    name,
	})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CONFLICT", "message": "Nama tersebut sudah dipakai di folder ini."}})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File atau folder tidak ditemukan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal mengganti nama."}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": renamed})
}

// Move memindahkan file/folder ke folder lain. Folder tidak boleh dipindahkan
// ke dalam dirinya sendiri atau ke salah satu turunannya.
func (h *FilesHandler) Move(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	nodeId, ok := parseUUIDParam(c, "id", "ID tidak valid.")
	if !ok {
		return
	}

	var req struct {
		ParentID *string `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": "Tujuan pemindahan tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File atau folder tidak ditemukan."}})
		return
	}
	if !canAccessNode(c, userId, node.OwnerID) {
		forbid(c, "FORBIDDEN", "Akses ditolak.")
		return
	}

	// Tujuan harus berada di pohon milik pemilik node. Memindahkan lintas
	// pemilik akan membuat item tidak terlihat oleh pemiliknya sendiri.
	rawParent := ""
	if req.ParentID != nil {
		rawParent = *req.ParentID
	}
	targetParent, err := h.resolveParentForMove(c.Request.Context(), node.OwnerID, rawParent)
	if err != nil {
		fail(c, http.StatusBadRequest, "INVALID_PARENT", err.Error())
		return
	}

	if node.IsDirectory {
		if targetParent.Valid && targetParent == nodeId {
			c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TARGET", "message": "Folder tidak bisa dipindahkan ke dalam dirinya sendiri."}})
			return
		}
		// Telusuri rantai induk tujuan; kalau bertemu node ini, tujuan adalah turunannya.
		cursor := targetParent
		for i := 0; i < 256 && cursor.Valid; i++ {
			if cursor == nodeId {
				c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_TARGET", "message": "Folder tidak bisa dipindahkan ke dalam turunannya sendiri."}})
				return
			}
			parent, pErr := h.queries.GetNodeByID(c.Request.Context(), cursor)
			if pErr != nil {
				break
			}
			cursor = parent.ParentID
		}
	}

	moved, err := h.queries.MoveNode(c.Request.Context(), db.MoveNodeParams{
		ID:       nodeId,
		OwnerID:  node.OwnerID,
		ParentID: targetParent,
	})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CONFLICT", "message": "Sudah ada item dengan nama sama di folder tujuan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memindahkan item."}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": moved})
}

func (h *FilesHandler) SoftDelete(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	nodeIdStr := c.Param("id")
	var nodeId pgtype.UUID
	if err := nodeId.Scan(nodeIdStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID file tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "File atau folder tidak ditemukan."}})
		return
	}
	if !canAccessNode(c, userId, node.OwnerID) {
		forbid(c, "FORBIDDEN", "Akses ditolak.")
		return
	}

	if err := h.queries.SoftDeleteNode(c.Request.Context(), db.SoftDeleteNodeParams{
		ID:      nodeId,
		OwnerID: node.OwnerID,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal menghapus file."}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "File berhasil dipindahkan ke trash bin."}})
}
