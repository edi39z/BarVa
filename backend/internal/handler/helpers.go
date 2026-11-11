package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
)

// Helper di file ini menjaga tiga pola yang dipakai hampir semua handler:
// mengambil pemanggil dari sesi, memeriksa akses ke node, dan membaca UUID dari
// path. Semuanya mengirim respons error sendiri, sehingga pemanggil cukup
// `return` saat nilai kedua false.

// currentUser mengambil UUID pemanggil. Bila sesi tidak ada, respons 401 sudah
// dikirim.
func currentUser(c *gin.Context) (pgtype.UUID, bool) {
	userId, ok := auth.GetUserID(c)
	if !ok {
		fail(c, http.StatusUnauthorized, "UNAUTHORIZED", "Tidak terautentikasi.")
	}
	return userId, ok
}

// requireNodeAccess memastikan pemanggil boleh menyentuh node milik ownerID.
// Respons 401/403 sudah dikirim bila tidak boleh.
func requireNodeAccess(c *gin.Context, ownerID pgtype.UUID) (pgtype.UUID, bool) {
	userId, ok := currentUser(c)
	if !ok {
		return userId, false
	}
	if !canAccessNode(c, userId, ownerID) {
		fail(c, http.StatusForbidden, "FORBIDDEN", "Akses ditolak.")
		return userId, false
	}
	return userId, true
}

// parseUUIDParam membaca parameter path bernama name sebagai UUID. Respons 400
// sudah dikirim bila nilainya bukan UUID.
func parseUUIDParam(c *gin.Context, name, message string) (pgtype.UUID, bool) {
	var id pgtype.UUID
	if err := id.Scan(c.Param(name)); err != nil {
		fail(c, http.StatusBadRequest, "INVALID_ID", message)
		return id, false
	}
	return id, true
}
