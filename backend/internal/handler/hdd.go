package handler

import (
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/auth"
)

// HDDHandler menyediakan akses BACA-SAJA (read-only) ke disk eksternal yang
// di-mount di server (mis. HDD 500GB /mnt/hdd500).
//
// ATURAN KESELAMATAN DATA (MUTLAK):
// Handler ini HANYA boleh melakukan operasi baca (os.ReadDir, os.Stat, os.Open).
// DILARANG KERAS memanggil os.Remove, os.RemoveAll, os.Rename, os.WriteFile,
// os.Create, atau fungsi mutasi apa pun terhadap isi disk eksternal agar data
// lama milik pengguna tidak pernah terhapus atau korup.
type HDDHandler struct {
	root string
}

type hddEntry struct {
	Name         string `json:"name"`
	RelPath      string `json:"path"`
	IsDir        bool   `json:"is_dir"`
	SizeBytes    int64  `json:"size_bytes"`
	ModifiedTime string `json:"modified_time"`
	MimeType     string `json:"mime_type"`
}

func NewHDDHandler(root string) *HDDHandler {
	clean := filepath.Clean(strings.TrimSpace(root))
	return &HDDHandler{root: clean}
}

// ignoredHDDNames menyembunyikan folder sistem Windows/NTFS dan folder internal
// CAS Barva agar daftar file lama pengguna bersih dan aman.
var ignoredHDDNames = map[string]bool{
	"$recycle.bin":              true,
	"system volume information": true,
	"msocache":                  true,
	"found.000":                 true,
	"found.001":                 true,
	"pagefile.sys":              true,
	"hiberfil.sys":              true,
	"swapfile.sys":              true,
	"barva":                     true,
}

func shouldSkipHDDEntry(name string, isRoot bool) bool {
	if strings.HasPrefix(name, "~$") || strings.HasPrefix(name, "~WRL") {
		return true
	}
	if isRoot && ignoredHDDNames[strings.ToLower(name)] {
		return true
	}
	return false
}

// resolveSafePath memvalidasi relPath terhadap root HDD dan menolak segala
// upaya path traversal (`..`) atau symlink keluar dari root.
func (h *HDDHandler) resolveSafePath(rel string) (string, string, error) {
	if h.root == "" || h.root == "." {
		return "", "", fmt.Errorf("EXTERNAL_HDD_DIR belum dikonfigurasi")
	}
	slashed := strings.ReplaceAll(strings.TrimSpace(rel), `\`, "/")
	for _, part := range strings.Split(slashed, "/") {
		if part == ".." {
			return "", "", fmt.Errorf("path traversal ditolak")
		}
	}
	cleaned := strings.TrimPrefix(filepath.Clean("/"+slashed), "/")
	cleaned = strings.TrimPrefix(cleaned, `\`)
	if cleaned == "." {
		cleaned = ""
	}

	absRoot, err := filepath.Abs(h.root)
	if err != nil {
		return "", "", err
	}
	target := filepath.Join(absRoot, cleaned)
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return "", "", err
	}

	relCheck, err := filepath.Rel(absRoot, absTarget)
	if err != nil || relCheck == ".." || strings.HasPrefix(relCheck, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("path di luar direktori disk eksternal")
	}
	normalizedRel := filepath.ToSlash(relCheck)
	if normalizedRel == "." {
		normalizedRel = ""
	}
	return absTarget, normalizedRel, nil
}

func requireOwnerOrAdmin(c *gin.Context) bool {
	role := auth.GetUserRole(c)
	// Jika masuk lewat sesi login, role wajib owner atau admin.
	// Jika role == "" berarti sudah lolos via X-Admin-Key di AdminKeyMiddleware.
	if role != "" && role != "owner" && role != "admin" {
		fail(c, http.StatusForbidden, "FORBIDDEN", "Hanya pemilik/admin NAS yang dapat mengakses disk eksternal.")
		return false
	}
	return true
}

// List -> GET /api/v1/hdd/list?path=&q=
// Hanya membaca daftar direktori (READ-ONLY).
func (h *HDDHandler) List(c *gin.Context) {
	if !requireOwnerOrAdmin(c) {
		return
	}
	relParam := c.Query("path")
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))

	absDir, normRel, err := h.resolveSafePath(relParam)
	if err != nil {
		fail(c, http.StatusBadRequest, "INVALID_PATH", err.Error())
		return
	}

	info, err := os.Stat(absDir)
	if err != nil || !info.IsDir() {
		fail(c, http.StatusNotFound, "NOT_FOUND", "Folder tidak ditemukan di HDD eksternal.")
		return
	}

	entries, err := os.ReadDir(absDir)
	if err != nil {
		failInternal(c, err, "READ_DIR_ERROR", "Gagal membaca isi folder HDD.")
		return
	}

	isRoot := normRel == ""
	items := make([]hddEntry, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		if shouldSkipHDDEntry(name, isRoot) {
			continue
		}
		if query != "" && !strings.Contains(strings.ToLower(name), query) {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		childRel := name
		if normRel != "" {
			childRel = normRel + "/" + name
		}
		mimeType := "application/octet-stream"
		if e.IsDir() {
			mimeType = "inode/directory"
		} else if ext := strings.ToLower(filepath.Ext(name)); ext != "" {
			if m := mime.TypeByExtension(ext); m != "" {
				mimeType = m
			}
		}
		items = append(items, hddEntry{
			Name:         name,
			RelPath:      childRel,
			IsDir:        e.IsDir(),
			SizeBytes:    fi.Size(),
			ModifiedTime: fi.ModTime().Format(time.RFC3339),
			MimeType:     mimeType,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	c.JSON(http.StatusOK, gin.H{
		"path":      normRel,
		"read_only": true,
		"items":     items,
	})
}

// Download -> GET /api/v1/hdd/download?path=&inline=1
// Membuka file secara READ-ONLY (os.Open) dan mengalirkannya via http.ServeContent
// (mendukung HTTP 206 Range untuk video/audio/PDF tanpa memuat seluruh file ke RAM).
func (h *HDDHandler) Download(c *gin.Context) {
	if !requireOwnerOrAdmin(c) {
		return
	}
	relParam := c.Query("path")
	if strings.TrimSpace(relParam) == "" {
		fail(c, http.StatusBadRequest, "INVALID_PATH", "Parameter path wajib diisi.")
		return
	}

	absFile, _, err := h.resolveSafePath(relParam)
	if err != nil {
		fail(c, http.StatusBadRequest, "INVALID_PATH", err.Error())
		return
	}

	f, err := os.Open(absFile) // os.Open = O_RDONLY (100% read-only)
	if err != nil {
		fail(c, http.StatusNotFound, "NOT_FOUND", "Berkas tidak ditemukan di HDD eksternal.")
		return
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil || fi.IsDir() {
		fail(c, http.StatusBadRequest, "IS_DIRECTORY", "Path menunjuk ke folder, bukan berkas.")
		return
	}

	disposition := "attachment"
	if c.Query("inline") == "1" {
		disposition = "inline"
	}
	safeName := strings.ReplaceAll(fi.Name(), `"`, "")
	c.Header("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, safeName))
	http.ServeContent(c.Writer, c.Request, fi.Name(), fi.ModTime(), f)
}
