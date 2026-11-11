package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
)

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

// enforceQuota mengirim 413 bila unggahan akan melewati kuota anggota dan
// mengembalikan true (respons sudah ditulis). Objek yang sudah dimiliki
// dilewatkan karena dedup CAS tidak menambah pemakaian.
func (h *FilesHandler) enforceQuota(c *gin.Context, userId pgtype.UUID, sha256Hex string, incoming int64) bool {
	user, err := h.queries.GetUserByID(c.Request.Context(), userId)
	if err != nil || user.QuotaBytes <= 0 {
		return false
	}

	usage, err := h.queries.GetOwnerUsage(c.Request.Context(), db.GetOwnerUsageParams{
		OwnerID: userId,
		Sha256:  sha256Hex,
	})
	if err != nil {
		// Gagal membaca pemakaian tidak boleh memblokir unggahan pengguna.
		log.Printf("[upload] gagal menghitung pemakaian kuota: %v", err)
		return false
	}
	if usage.HasObject || !quotaExceeded(user.QuotaBytes, usage.UsedBytes, incoming) {
		return false
	}

	c.JSON(http.StatusRequestEntityTooLarge, gin.H{
		"error": gin.H{
			"code": "QUOTA_EXCEEDED",
			"message": fmt.Sprintf(
				"Kuota penyimpanan tidak cukup: terpakai %s dari %s, berkas ini %s.",
				humanBytes(usage.UsedBytes), humanBytes(user.QuotaBytes), humanBytes(incoming),
			),
		},
	})
	return true
}

// discardUploadObject membersihkan objek yang gagal dipakai node, beserta
// berkas CAS-nya. Objek yang masih dirujuk node lain (kasus dedup) tidak
// disentuh, karena berkasnya memang masih dipakai.
func (h *FilesHandler) discardUploadObject(ctx context.Context, objectID pgtype.UUID, sha string) {
	if _, err := h.queries.DeleteObjectIfOrphan(ctx, objectID); err != nil {
		return
	}
	h.discardUploadFile(ctx, sha)
}

// discardUploadFile menghapus berkas CAS hanya bila tidak ada baris
// file_objects yang menunjuk sha tersebut.
func (h *FilesHandler) discardUploadFile(ctx context.Context, sha string) {
	if _, err := h.queries.GetFileObjectBySHA256(ctx, sha); err == nil {
		return
	}
	if err := h.storage.Delete(ctx, sha); err != nil {
		log.Printf("[upload] gagal menghapus objek yatim %s: %v", sha, err)
	}
}

func (h *FilesHandler) Upload(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
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

	// Validasi folder induk sebelum menyentuh storage: menolak di sini jauh
	// lebih murah daripada menulis objek lalu meninggalkannya yatim.
	parentId, parentErr := h.resolveParent(c.Request.Context(), userId, c.PostForm("parent_id"))
	if parentErr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_PARENT", "message": parentErr.Error()}})
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

	// Kuota diperiksa setelah hash diketahui: mengunggah ulang berkas yang
	// sudah dimiliki tidak menambah pemakaian (dedup CAS), jadi tidak boleh
	// ditolak hanya karena ukurannya besar.
	if h.enforceQuota(c, userId, hashHex, copiedBytes) {
		return
	}

	// Reopen tmp file to store via StorageProvider
	reader, err := os.Open(tmpPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "READ_ERROR", "message": "Gagal membaca hasil upload."}})
		return
	}
	defer reader.Close()

	if err := h.storage.Put(c.Request.Context(), hashHex, reader); err != nil {
		failInternal(c, err, "STORAGE_ERROR", "Gagal menyimpan berkas ke storage.")
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
		h.discardUploadFile(c.Request.Context(), hashHex)
		failInternal(c, err, "DB_ERROR", "Gagal mencatat metadata berkas.")
		return
	}

	// Opsi ganti: hapus dulu node lama dengan nama sama di folder yang sama,
	// supaya unik-index parsial (deleted_at IS NULL) tidak menolak upload baru.
	if strings.EqualFold(c.PostForm("overwrite"), "true") {
		existing, listErr := h.queries.ListNodesByParent(c.Request.Context(), db.ListNodesByParentParams{
			AllOwners: false,
			OwnerID:   userId,
			ParentID:  parentId,
		})
		if listErr == nil {
			for _, n := range existing {
				if n.Name == fileHeader.Filename {
					_ = h.queries.SoftDeleteNode(c.Request.Context(), db.SoftDeleteNodeParams{
						ID:      n.ID,
						OwnerID: userId,
					})
				}
			}
		}
	}

	node, err := h.queries.CreateFileNode(c.Request.Context(), db.CreateFileNodeParams{
		OwnerID:     userId,
		ParentID:    parentId,
		Name:        fileHeader.Filename,
		IsDirectory: false,
		ObjectID:    fileObj.ID,
	})
	if err != nil {
		// Node gagal dibuat (nama bentrok): objek yang barusan dicatat akan
		// yatim kalau dibiarkan, jadi dibersihkan sebelum menjawab 409.
		h.discardUploadObject(c.Request.Context(), fileObj.ID, hashHex)
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "CONFLICT", "message": "File dengan nama tersebut sudah ada di folder ini."}})
		return
	}

	// Jadwalkan ekstraksi teks untuk pencarian isi. Memakai path CAS, bukan
	// tmpPath yang dihapus defer saat handler selesai. Antrean penuh bukan
	// kegagalan: backfill periodik akan mengambil objek ini.
	if h.indexer != nil {
		h.indexer.EnqueueText(fileObj.ID, fileObj.StoragePath, node.Name)
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"node":   node,
			"object": fileObj,
		},
	})
}
