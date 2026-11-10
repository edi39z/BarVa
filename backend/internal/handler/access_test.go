package handler

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
)

func testUUID(b byte) pgtype.UUID {
	var u pgtype.UUID
	u.Valid = true
	for i := range u.Bytes {
		u.Bytes[i] = b
	}
	return u
}

func TestCanAccessNode(t *testing.T) {
	gin.SetMode(gin.TestMode)

	own := testUUID(1)
	other := testUUID(2)

	cases := []struct {
		name    string
		role    string
		ownerID pgtype.UUID
		want    bool
	}{
		{"member melihat berkas sendiri", "member", own, true},
		{"member melihat berkas orang lain", "member", other, false},
		{"admin melihat berkas anggota", "admin", other, true},
		{"owner melihat berkas anggota", "owner", other, true},
		{"role kosong hanya berkas sendiri", "", other, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Set(auth.ContextUserRole, tc.role)

			if got := canAccessNode(c, own, tc.ownerID); got != tc.want {
				t.Fatalf("canAccessNode() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCanManageAllFiles(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := map[string]bool{
		"owner":  true,
		"admin":  true,
		"member": false,
		"":       false,
	}

	for role, want := range cases {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Set(auth.ContextUserRole, role)

		if got := canManageAllFiles(c); got != want {
			t.Fatalf("role %q: canManageAllFiles() = %v, want %v", role, got, want)
		}
	}
}
