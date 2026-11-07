package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
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

func (h *FamilyHandler) ListMembers(c *gin.Context) {
	_, ok := auth.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{"code": "UNAUTHORIZED", "message": "Tidak terautentikasi."}})
		return
	}

	users, err := h.queries.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "DB_ERROR", "message": err.Error()}})
		return
	}

	// Sanitize output (never expose password hashes)
	type MemberResponse struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		Username  string `json:"username"`
		Role      string `json:"role"`
		CreatedAt string `json:"created_at"`
	}

	members := make([]MemberResponse, 0, len(users))
	for _, u := range users {
		members = append(members, MemberResponse{
			ID:        u.ID.String(),
			Email:     u.Email,
			Username:  u.Username,
			Role:      u.Role,
			CreatedAt: u.CreatedAt.Time.Format("2 Jan 2006, 15:04"),
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (h *FamilyHandler) InviteMember(c *gin.Context) {
	// Check user role from context
	userRole, _ := c.Get(auth.ContextUserRole)
	if userRole != "owner" && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": gin.H{"code": "FORBIDDEN", "message": "Hanya Owner atau Admin yang dapat menambahkan anggota keluarga."}})
		return
	}

	var req InviteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"code": "VALIDATION_ERROR", "message": err.Error()}})
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
