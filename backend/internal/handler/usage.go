package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/db"
)

// usageFolderLimit membatasi jumlah folder yang dikirim. Folder kecil tidak
// perlu ditampilkan; frontend memberi catatan bila batas ini tercapai.
const usageFolderLimit = 50

// usageTypeOrder menjaga urutan kategori di UI tetap sama walau query
// mengurutkan berdasarkan ukuran.
var usageTypeOrder = []string{"image", "video", "document", "archive"}

type UsageHandler struct {
	queries *db.Queries
}

func NewUsageHandler(queries *db.Queries) *UsageHandler {
	return &UsageHandler{queries: queries}
}

type UsageTypeEntry struct {
	Type      string `json:"type"`
	SizeBytes int64  `json:"size_bytes"`
	FileCount int64  `json:"file_count"`
}

type UsageFolderEntry struct {
	ID        *string `json:"id"`
	Name      string  `json:"name"`
	SizeBytes int64   `json:"size_bytes"`
	FileCount int64   `json:"file_count"`
}

type UsageSummaryResponse struct {
	QuotaBytes int64              `json:"quota_bytes"`
	UsedBytes  int64              `json:"used_bytes"`
	ByType     []UsageTypeEntry   `json:"by_type"`
	ByFolder   []UsageFolderEntry `json:"by_folder"`
}

// Summary mengirim rincian pemakaian kuota pengguna yang sedang login:
// total, per jenis berkas, dan ukuran folder top-level (rekursif).
func (h *UsageHandler) Summary(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	user, err := h.queries.GetUserByID(c.Request.Context(), userId)
	if err != nil {
		fail(c, http.StatusNotFound, "USER_NOT_FOUND", "Pengguna tidak ditemukan.")
		return
	}

	typeRows, err := h.queries.GetOwnerUsageByType(c.Request.Context(), userId)
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal menghitung pemakaian per jenis berkas.")
		return
	}

	typeSizes := make(map[string]UsageTypeEntry, len(typeRows))
	for _, row := range typeRows {
		typeSizes[row.Kind] = UsageTypeEntry{
			Type:      row.Kind,
			SizeBytes: row.SizeBytes,
			FileCount: row.FileCount,
		}
	}

	// Total dihitung dari hasil per jenis supaya kedua angka di respons selalu
	// konsisten. Semua objek pasti masuk salah satu kategori.
	var usedBytes int64
	byType := make([]UsageTypeEntry, 0, len(usageTypeOrder))
	for _, kind := range usageTypeOrder {
		entry := typeSizes[kind]
		entry.Type = kind
		usedBytes += entry.SizeBytes
		byType = append(byType, entry)
	}

	folderRows, err := h.queries.GetOwnerUsageByFolder(c.Request.Context(), db.GetOwnerUsageByFolderParams{
		OwnerID:  userId,
		RowLimit: usageFolderLimit,
	})
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal menghitung pemakaian per folder.")
		return
	}

	byFolder := make([]UsageFolderEntry, 0, len(folderRows))
	for _, row := range folderRows {
		var id *string
		if row.RootID.Valid {
			value := row.RootID.String()
			id = &value
		}
		byFolder = append(byFolder, UsageFolderEntry{
			ID:        id,
			Name:      row.RootName,
			SizeBytes: row.SizeBytes,
			FileCount: row.FileCount,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data": UsageSummaryResponse{
			QuotaBytes: user.QuotaBytes,
			UsedBytes:  usedBytes,
			ByType:     byType,
			ByFolder:   byFolder,
		},
	})
}
