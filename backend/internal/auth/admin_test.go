package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAdminKeyMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	run := func(key, remoteAddr, header string) int {
		t.Setenv("NAS_ADMIN_KEY", key)

		r := gin.New()
		r.Use(AdminKeyMiddleware())
		r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = remoteAddr
		if header != "" {
			req.Header.Set(AdminKeyHeader, header)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	cases := []struct {
		name       string
		key        string
		remoteAddr string
		header     string
		want       int
	}{
		{"tanpa key dari lokal", "", "127.0.0.1:1234", "", http.StatusOK},
		{"tanpa key dari publik", "", "8.8.8.8:1234", "", http.StatusForbidden},
		{"key benar", "rahasia", "8.8.8.8:1234", "rahasia", http.StatusOK},
		{"key salah", "rahasia", "8.8.8.8:1234", "salah", http.StatusUnauthorized},
		{"key kosong dari publik", "rahasia", "8.8.8.8:1234", "", http.StatusUnauthorized},
	}

	for _, tc := range cases {
		if got := run(tc.key, tc.remoteAddr, tc.header); got != tc.want {
			t.Errorf("%s: got %d, want %d", tc.name, got, tc.want)
		}
	}
}
