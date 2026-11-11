package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// DownloadArchive mengalirkan isi folder sebagai zip. Akses memakai aturan
// node yang sama dengan unduhan berkas: pemilik sendiri, atau owner/admin untuk
// berkas anggota lain.
func (h *FilesHandler) DownloadArchive(c *gin.Context) {
	nodeId, ok := parseUUIDParam(c, "id", "ID folder tidak valid.")
	if !ok {
		return
	}

	node, err := h.queries.GetNodeByID(c.Request.Context(), nodeId)
	if err != nil {
		fail(c, http.StatusNotFound, "NOT_FOUND", "Folder tidak ditemukan.")
		return
	}
	if _, ok := requireNodeAccess(c, node.OwnerID); !ok {
		return
	}
	if !node.IsDirectory {
		fail(c, http.StatusBadRequest, "NOT_DIRECTORY", "Hanya folder yang bisa diunduh sebagai ZIP.")
		return
	}

	nodes, err := h.queries.ListSubtreeNodes(c.Request.Context(), node.ID)
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal membaca isi folder.")
		return
	}
	if len(nodes) == 0 {
		fail(c, http.StatusNotFound, "EMPTY_FOLDER", "Folder tidak lagi tersedia.")
		return
	}

	writeSubtreeZip(c, nodes, node.ID.String(), node.Name)
}
