package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

// sharePasswordLimiter mencegah brute force password share. Kuncinya
// IP+token: satu penyerang tidak bisa mengunci pemegang tautan lain, dan
// menebak password satu tautan tidak membuka tautan lain.
const (
	maxSharePasswordFailures = 5
	sharePasswordWindow      = 15 * time.Minute
)

var sharePasswordLimiter = newFailureLimiter(maxSharePasswordFailures, sharePasswordWindow)

func sharePasswordKey(c *gin.Context) string {
	return c.ClientIP() + "|" + c.Param("token")
}

// shareRateLimited mengirim 429 bila kunci sudah melewati batas. Mengembalikan
// true berarti respons sudah ditulis dan handler harus berhenti.
func shareRateLimited(c *gin.Context) bool {
	if !sharePasswordLimiter.blocked(sharePasswordKey(c)) {
		return false
	}
	c.JSON(http.StatusTooManyRequests, gin.H{
		"error": gin.H{"code": "RATE_LIMITED", "message": "Terlalu banyak percobaan password. Coba lagi dalam 15 menit."},
	})
	return true
}

// shareByToken memuat share dari token mentah. Respons 404 sudah dikirim bila
// token tidak valid atau kedaluwarsa.
func (h *SharesHandler) shareByToken(c *gin.Context) (db.GetShareByTokenHashRow, bool) {
	var tokenHashPg pgtype.Text
	_ = tokenHashPg.Scan(auth.HashToken(c.Param("token")))

	share, err := h.queries.GetShareByTokenHash(c.Request.Context(), tokenHashPg)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "SHARE_NOT_FOUND", "message": "Link berbagi tidak ditemukan atau telah kedaluwarsa."}})
		return share, false
	}
	return share, true
}

// authorizeShare memeriksa password share bila ada. Password boleh dikirim
// lewat header X-Share-Password atau query ?password= (dipakai navigasi
// browser yang tidak bisa menambah header).
func (h *SharesHandler) authorizeShare(c *gin.Context, share db.GetShareByTokenHashRow) bool {
	if !share.PasswordHash.Valid || share.PasswordHash.String == "" {
		return true
	}
	if shareRateLimited(c) {
		return false
	}

	pass := c.GetHeader("X-Share-Password")
	if pass == "" {
		pass = c.Query("password")
	}
	if pass == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "PASSWORD_REQUIRED", "message": "Password diperlukan untuk mengakses berkas ini."}})
		return false
	}

	valid, err := auth.ComparePassword(pass, share.PasswordHash.String)
	if err != nil || !valid {
		sharePasswordLimiter.fail(sharePasswordKey(c))
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PASSWORD", "message": "Password salah."}})
		return false
	}
	sharePasswordLimiter.reset(sharePasswordKey(c))
	return true
}

// PublicVerifyPassword memvalidasi password share tanpa menyentuh berkas.
// Dipakai halaman publik untuk membuka share folder, yang tidak punya berkas
// tunggal untuk diuji dengan permintaan Range.
func (h *SharesHandler) PublicVerifyPassword(c *gin.Context) {
	share, ok := h.shareByToken(c)
	if !ok {
		return
	}

	if !share.PasswordHash.Valid || share.PasswordHash.String == "" {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"valid": true}})
		return
	}
	if shareRateLimited(c) {
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	_ = c.ShouldBindJSON(&req)

	pass := req.Password
	if pass == "" {
		pass = c.GetHeader("X-Share-Password")
	}
	valid, err := auth.ComparePassword(pass, share.PasswordHash.String)
	if err != nil || !valid {
		sharePasswordLimiter.fail(sharePasswordKey(c))
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "INVALID_PASSWORD", "message": "Password salah."}})
		return
	}

	sharePasswordLimiter.reset(sharePasswordKey(c))
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"valid": true}})
}

// PublicDownloadArchive mengalirkan isi folder share sebagai zip tanpa
// menulis arsip sementara ke disk. Berkas yang hilang dari disk dilewati agar
// sisa arsip tetap bisa diunduh.
func (h *SharesHandler) PublicDownloadArchive(c *gin.Context) {
	share, ok := h.shareByToken(c)
	if !ok {
		return
	}
	if !share.IsDirectory {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "NOT_DIRECTORY", "message": "Tautan ini menunjuk ke berkas, bukan folder."}})
		return
	}
	if !h.authorizeShare(c, share) {
		return
	}

	nodes, err := h.queries.ListSubtreeNodes(c.Request.Context(), share.NodeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal membaca isi folder."}})
		return
	}
	if len(nodes) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "EMPTY_SHARE", "message": "Folder tidak lagi tersedia."}})
		return
	}

	writeSubtreeZip(c, nodes, share.NodeID.String(), share.NodeName)
}
