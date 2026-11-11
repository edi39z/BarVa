package handler

import (
	"context"
	"errors"
	"os"

	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
	"nas-backend/internal/storage"
)

// FilesHandler melayani seluruh operasi berkas: daftar, unggah, unduh,
// ganti nama, pindah, dan hapus. Handler dipecah per tanggung jawab:
//   - files.go          — struct, konstruktor, dan resolusi folder induk
//   - files_query.go    — daftar, unduh, stream
//   - files_upload.go   — unggah, kuota, pembersihan objek yatim
//   - files_mutation.go — buat folder, ganti nama, pindah, hapus
type FilesHandler struct {
	queries  *db.Queries
	storage  storage.StorageProvider
	tempDir  string
	thumbDir string
}

func NewFilesHandler(queries *db.Queries, store storage.StorageProvider, tempDir, thumbDir string) *FilesHandler {
	_ = os.MkdirAll(tempDir, 0755)
	_ = os.MkdirAll(thumbDir, 0755)
	return &FilesHandler{
		queries:  queries,
		storage:  store,
		tempDir:  tempDir,
		thumbDir: thumbDir,
	}
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

// resolveParentForMove memvalidasi folder tujuan berada di pohon milik
// ownerID (pemilik node yang dipindahkan), bukan milik pemanggil. Dengan
// begitu admin bisa merapikan berkas anggota lain tanpa memindahkannya ke
// pohon yang salah.
func (h *FilesHandler) resolveParentForMove(ctx context.Context, ownerID pgtype.UUID, raw string) (pgtype.UUID, error) {
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
	if node.OwnerID != ownerID {
		return parentId, errors.New("folder tujuan bukan milik pemilik item ini")
	}
	if !node.IsDirectory {
		return parentId, errors.New("parent_id bukan folder")
	}
	return parentId, nil
}
