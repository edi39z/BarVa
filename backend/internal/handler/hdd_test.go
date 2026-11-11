package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHDDHandlerReadOnlyAndPathTraversal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()

	if err := os.WriteFile(filepath.Join(root, "dokumen.txt"), []byte("isi aman"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "barva"), 0700); err != nil {
		t.Fatal(err)
	}

	h := NewHDDHandler(root)
	r := gin.New()
	r.GET("/list", h.List)
	r.GET("/download", h.Download)

	// 1. List root harus menyembunyikan folder internal "barva"
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/list", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("list code = %d, want 200", w.Code)
	}

	// 2. Download file normal
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, "/download?path=dokumen.txt", nil)
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK || w2.Body.String() != "isi aman" {
		t.Fatalf("download = %d %q", w2.Code, w2.Body.String())
	}

	// 3. Path traversal keluar root ditolak
	_, _, err := h.resolveSafePath("../../etc/passwd")
	if err == nil {
		t.Fatal("expected path traversal error")
	}
}
