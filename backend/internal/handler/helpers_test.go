package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/auth"
)

func newTestContext(t *testing.T) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	return c, rec
}

// errorCode membaca code dari envelope error pada recorder.
func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("respons bukan JSON envelope: %v (%s)", err, rec.Body.String())
	}
	return body.Error.Code
}

func TestCurrentUser(t *testing.T) {
	t.Run("tanpa sesi mengirim 401", func(t *testing.T) {
		c, rec := newTestContext(t)

		if _, ok := currentUser(c); ok {
			t.Fatal("currentUser() = true, ingin false")
		}
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, ingin 401", rec.Code)
		}
		if code := errorCode(t, rec); code != "UNAUTHORIZED" {
			t.Fatalf("code = %q, ingin UNAUTHORIZED", code)
		}
	})

	t.Run("dengan sesi mengembalikan UUID", func(t *testing.T) {
		c, rec := newTestContext(t)
		want := testUUID(7)
		c.Set(auth.ContextUserID, want)

		got, ok := currentUser(c)
		if !ok || got != want {
			t.Fatalf("currentUser() = (%v, %v), ingin (%v, true)", got, ok, want)
		}
		if rec.Code != http.StatusOK && rec.Body.Len() != 0 {
			t.Fatalf("tidak seharusnya menulis respons: %s", rec.Body.String())
		}
	})
}

func TestRequireNodeAccess(t *testing.T) {
	caller := testUUID(1)
	other := testUUID(2)

	cases := []struct {
		name     string
		role     string
		ownerID  pgtype.UUID
		wantOK   bool
		wantCode string
	}{
		{"member pada berkas sendiri", "member", caller, true, ""},
		{"member pada berkas orang lain", "member", other, false, "FORBIDDEN"},
		{"admin pada berkas anggota", "admin", other, true, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, rec := newTestContext(t)
			c.Set(auth.ContextUserID, caller)
			c.Set(auth.ContextUserRole, tc.role)

			_, ok := requireNodeAccess(c, tc.ownerID)
			if ok != tc.wantOK {
				t.Fatalf("requireNodeAccess() = %v, ingin %v", ok, tc.wantOK)
			}
			if !tc.wantOK && errorCode(t, rec) != tc.wantCode {
				t.Fatalf("code = %q, ingin %q", errorCode(t, rec), tc.wantCode)
			}
		})
	}
}

func TestParseUUIDParam(t *testing.T) {
	t.Run("UUID valid", func(t *testing.T) {
		c, _ := newTestContext(t)
		c.Params = gin.Params{{Key: "id", Value: "3f7a9c1e-0000-4000-8000-000000000000"}}

		id, ok := parseUUIDParam(c, "id", "ID tidak valid.")
		if !ok || !id.Valid {
			t.Fatalf("parseUUIDParam() = (%v, %v), ingin UUID valid", id, ok)
		}
	})

	t.Run("bukan UUID mengirim 400", func(t *testing.T) {
		c, rec := newTestContext(t)
		c.Params = gin.Params{{Key: "id", Value: "bukan-uuid"}}

		if _, ok := parseUUIDParam(c, "id", "ID tidak valid."); ok {
			t.Fatal("parseUUIDParam() = true, ingin false")
		}
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, ingin 400", rec.Code)
		}
		if code := errorCode(t, rec); code != "INVALID_ID" {
			t.Fatalf("code = %q, ingin INVALID_ID", code)
		}
	})
}
