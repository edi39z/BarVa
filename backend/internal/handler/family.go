package handler

import (
	"errors"
	"math"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
	"nas-backend/internal/db"
)

type FamilyHandler struct {
	queries *db.Queries
}

func NewFamilyHandler(queries *db.Queries) *FamilyHandler {
	return &FamilyHandler{queries: queries}
}

type InviteMemberRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required,min=8"`
	Role     string `json:"role"` // admin, member
}

type MemberResponse struct {
	ID             string `json:"id"`
	Email          string `json:"email"`
	Username       string `json:"username"`
	Role           string `json:"role"`
	QuotaBytes     int64  `json:"quota_bytes"`
	QuotaUsedBytes int64  `json:"quota_used_bytes"`
	CreatedAt      string `json:"created_at"`
}

func (h *FamilyHandler) ListMembers(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	users, err := h.queries.ListUsers(c.Request.Context())
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal memuat daftar anggota.")
		return
	}

	// Member hanya boleh melihat datanya sendiri. Daftar lengkap (termasuk
	// email anggota lain) hanya untuk owner/admin.
	if !isPrivilegedRole(auth.GetUserRole(c)) {
		own := make([]db.ListUsersRow, 0, 1)
		for _, u := range users {
			if u.ID == userId {
				own = append(own, u)
				break
			}
		}
		users = own
	}

	members := make([]MemberResponse, 0, len(users))
	for _, u := range users {
		used, err := h.queries.GetOwnerUsage(c.Request.Context(), db.GetOwnerUsageParams{
			OwnerID: u.ID,
			Sha256:  "",
		})
		if err != nil {
			failInternal(c, err, "DB_ERROR", "Gagal menghitung pemakaian anggota.")
			return
		}
		members = append(members, MemberResponse{
			ID:             u.ID.String(),
			Email:          u.Email,
			Username:       u.Username,
			Role:           u.Role,
			QuotaBytes:     u.QuotaBytes,
			QuotaUsedBytes: used.UsedBytes,
			CreatedAt:      u.CreatedAt.Time.Format("2 Jan 2006, 15:04"),
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *FamilyHandler) InviteMember(c *gin.Context) {
	if !isPrivilegedRole(auth.GetUserRole(c)) {
		fail(c, http.StatusForbidden, "FORBIDDEN", "Hanya Owner atau Admin yang dapat menambahkan anggota keluarga.")
		return
	}

	var req InviteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "VALIDATION_ERROR", "Payload anggota tidak valid.")
		return
	}

	hashedPassword, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "SERVER_ERROR", "message": "Gagal mengenkripsi password."}})
		return
	}

	role := "member"
	if req.Role == "admin" {
		role = "admin"
	}

	user, err := h.queries.CreateUser(c.Request.Context(), db.CreateUserParams{
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hashedPassword,
		Role:         role,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{"code": "USER_EXISTS", "message": "Email atau username sudah terdaftar."}})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"data": gin.H{
			"id":         user.ID,
			"email":      user.Email,
			"username":   user.Username,
			"role":       user.Role,
			"created_at": user.CreatedAt,
		},
	})
}

// maxQuotaGB membatasi kuota yang bisa diatur agar tidak melampaui batas
// wajar penyimpanan (100 TB).
const maxQuotaGB = 100 * 1024

type UpdateQuotaRequest struct {
	// QuotaGB 0 berarti tanpa batas. Pointer dipakai agar nilai 0 tetap
	// dianggap sebagai permintaan yang sah, bukan field kosong.
	QuotaGB *float64 `json:"quota_gb" binding:"required"`
}

// quotaBytesFromGB mengubah GB menjadi byte tanpa kehilangan presisi pada
// nilai desimal (mis. 1.5 GB).
func quotaBytesFromGB(gb float64) int64 {
	return int64(math.Round(gb * 1024 * 1024 * 1024))
}

// validQuotaGB memastikan nilai kuota berada dalam rentang yang diterima.
func validQuotaGB(gb float64) bool {
	return gb >= 0 && gb <= maxQuotaGB
}

// canManageQuota menentukan siapa yang boleh mengubah kuota target.
// Owner boleh semua; admin hanya boleh anggota/admin lain, bukan owner.
func canManageQuota(callerRole, targetRole string) bool {
	switch callerRole {
	case "owner":
		return true
	case "admin":
		return targetRole != "owner"
	default:
		return false
	}
}

// UpdateMemberQuota mengubah kuota penyimpanan satu akun. Nilai 0 berarti
// akun tersebut tidak dibatasi.
func (h *FamilyHandler) UpdateMemberQuota(c *gin.Context) {
	callerRole := auth.GetUserRole(c)
	if !isPrivilegedRole(callerRole) {
		forbid(c, "FORBIDDEN", "Hanya Owner atau Admin yang dapat mengubah kuota anggota.")
		return
	}

	var targetID pgtype.UUID
	if err := targetID.Scan(strings.TrimSpace(c.Param("id"))); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "INVALID_ID", "message": "ID anggota tidak valid."}})
		return
	}

	var req UpdateQuotaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": "Field quota_gb wajib diisi."}})
		return
	}
	if !validQuotaGB(*req.QuotaGB) {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": "Kuota harus di antara 0 dan 102400 GB."}})
		return
	}

	target, err := h.queries.GetUserByID(c.Request.Context(), targetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "USER_NOT_FOUND", "message": "Anggota tidak ditemukan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memuat data anggota."}})
		return
	}
	if !canManageQuota(callerRole, target.Role) {
		forbid(c, "FORBIDDEN", "Admin tidak dapat mengubah kuota Owner.")
		return
	}

	newQuota := quotaBytesFromGB(*req.QuotaGB)
	usage, err := h.queries.GetOwnerUsage(c.Request.Context(), db.GetOwnerUsageParams{
		OwnerID: targetID,
		Sha256:  "",
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal menghitung pemakaian anggota."}})
		return
	}
	if newQuota > 0 && usage.UsedBytes > newQuota {
		c.JSON(http.StatusConflict, gin.H{"error": gin.H{
			"code": "QUOTA_BELOW_USAGE",
			"message": "Kuota tidak boleh lebih kecil dari pemakaian saat ini (" +
				humanBytes(usage.UsedBytes) + ").",
		}})
		return
	}

	updated, err := h.queries.UpdateUserQuota(c.Request.Context(), db.UpdateUserQuotaParams{
		ID:         targetID,
		QuotaBytes: newQuota,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Anggota dihapus di antara pemeriksaan dan pembaruan.
			c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"code": "USER_NOT_FOUND", "message": "Anggota tidak ditemukan."}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": "Gagal memperbarui kuota."}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": MemberResponse{
			ID:             updated.ID.String(),
			Email:          updated.Email,
			Username:       updated.Username,
			Role:           updated.Role,
			QuotaBytes:     updated.QuotaBytes,
			QuotaUsedBytes: usage.UsedBytes,
			CreatedAt:      updated.CreatedAt.Time.Format("2 Jan 2006, 15:04"),
		},
	})
}
