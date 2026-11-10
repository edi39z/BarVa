package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

// ListTrash menampilkan semua node milik user yang sudah di-soft-delete.
func (h *FilesHandler) ListTrash(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	rows, err := h.queries.ListTrashedNodes(c.Request.Context(), userId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memuat trash."}})
		return
	}
	if rows == nil {
		rows = []db.ListTrashedNodesRow{}
	}

	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// Restore memulihkan node dari trash. Node ditolak bila folder induknya
// masih berada di trash, supaya item tidak muncul kembali di tempat yang
// tidak bisa dijangkau pengguna.
func (h *FilesHandler) Restore(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	var nodeId pgtype.UUID
	if err := nodeId.Scan(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeForOwner(c.Request.Context(), db.GetNodeForOwnerParams{
		ID:      nodeId,
		OwnerID: userId,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Item tidak ditemukan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memuat item."}})
		return
	}
	if !node.DeletedAt.Valid {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "NOT_TRASHED", "message": "Item ini tidak berada di trash."}})
		return
	}

	if node.ParentID.Valid {
		parent, parentErr := h.queries.GetNodeForOwner(c.Request.Context(), db.GetNodeForOwnerParams{
			ID:      node.ParentID,
			OwnerID: userId,
		})
		if parentErr != nil && !errors.Is(parentErr, pgx.ErrNoRows) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memeriksa folder induk."}})
			return
		}
		if errors.Is(parentErr, pgx.ErrNoRows) || parent.DeletedAt.Valid {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "PARENT_IN_TRASH", "message": "Folder induk masih di trash. Pulihkan folder induknya lebih dulu."}})
			return
		}
	}

	restored, err := h.queries.RestoreNode(c.Request.Context(), db.RestoreNodeParams{
		ID:      nodeId,
		OwnerID: userId,
	})
	if err != nil {
		if isUniqueViolation(err) {
			c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CONFLICT", "message": "Sudah ada item dengan nama sama di folder tujuan. Ganti nama dulu sebelum memulihkan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memulihkan item."}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": restored})
}

// Purge menghapus node dari trash secara permanen, termasuk seluruh isi
// folder. Objek CAS yang tidak lagi dipakai node mana pun ikut dihapus dari
// disk; objek yang masih dipakai node lain dibiarkan (deduplikasi).
func (h *FilesHandler) Purge(c *gin.Context) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	var nodeId pgtype.UUID
	if err := nodeId.Scan(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID tidak valid."}})
		return
	}

	node, err := h.queries.GetNodeForOwner(c.Request.Context(), db.GetNodeForOwnerParams{
		ID:      nodeId,
		OwnerID: userId,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Item tidak ditemukan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memuat item."}})
		return
	}
	if !node.DeletedAt.Valid {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "NOT_TRASHED", "message": "Hanya item di trash yang bisa dihapus permanen."}})
		return
	}

	// Kumpulkan objek subtree sebelum baris node dihapus.
	objectIDs, err := h.queries.ListSubtreeObjectIDs(c.Request.Context(), db.ListSubtreeObjectIDsParams{
		ID:      nodeId,
		OwnerID: userId,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memindai isi folder."}})
		return
	}

	deleted, err := h.queries.PurgeNode(c.Request.Context(), db.PurgeNodeParams{
		ID:      nodeId,
		OwnerID: userId,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal menghapus permanen."}})
		return
	}
	if deleted == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "NOT_FOUND", "message": "Item tidak ditemukan di trash."}})
		return
	}

	// Hapus blob hanya bila tidak ada node lain yang masih menunjuk objek itu.
	for _, objectID := range objectIDs {
		if !objectID.Valid {
			continue
		}
		sha, shaErr := h.queries.DeleteObjectIfOrphan(c.Request.Context(), objectID)
		if shaErr != nil {
			if errors.Is(shaErr, pgx.ErrNoRows) {
				continue
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal membersihkan objek."}})
			return
		}
		_ = h.storage.Delete(c.Request.Context(), sha)
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "Item dihapus permanen."}})
}
