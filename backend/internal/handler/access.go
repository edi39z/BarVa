package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
)

// isPrivilegedRole menandai role yang boleh menjangkau berkas anggota lain.
// "member" hanya boleh menyentuh node miliknya sendiri.
func isPrivilegedRole(role string) bool {
	return role == "owner" || role == "admin"
}

// canAccessNode menentukan apakah pemanggil boleh membaca atau mengelola
// node milik ownerID. Otorisasi tetap berbasis pemilik; role hanya
// memperluas jangkauan untuk owner/admin.
func canAccessNode(c *gin.Context, userId, ownerID pgtype.UUID) bool {
	if ownerID == userId {
		return true
	}
	return isPrivilegedRole(auth.GetUserRole(c))
}

// canManageAllFiles melaporkan apakah daftar file harus mencakup semua
// pemilik, bukan hanya milik pemanggil.
func canManageAllFiles(c *gin.Context) bool {
	return isPrivilegedRole(auth.GetUserRole(c))
}

func forbid(c *gin.Context, code, message string) {
	fail(c, http.StatusForbidden, code, message)
}
