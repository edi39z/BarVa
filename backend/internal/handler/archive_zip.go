package handler

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/db"
)

// writeSubtreeZip mengalirkan isi subtree sebagai zip langsung ke respons
// tanpa menulis arsip sementara ke disk. `nodes` harus memuat folder akar itu
// sendiri; akar tidak ditulis sebagai entri karena namanya sudah dipakai
// sebagai nama berkas zip. Berkas yang hilang dari disk dilewati agar sisa
// arsip tetap bisa diunduh.
func writeSubtreeZip(c *gin.Context, nodes []db.ListSubtreeNodesRow, rootID, rootName string) {
	byID := make(map[string]db.ListSubtreeNodesRow, len(nodes))
	for _, node := range nodes {
		byID[node.ID.String()] = node
	}

	folderName := zipSafeName(rootName)
	if folderName == "" {
		folderName = "folder"
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", attachmentDisposition(folderName+".zip"))
	c.Header("X-Content-Type-Options", "nosniff")

	zw := zip.NewWriter(c.Writer)
	defer func() {
		if err := zw.Close(); err != nil {
			log.Printf("[archive] gagal menutup zip: %v", err)
		}
	}()

	skipped := 0
	for _, node := range nodes {
		if node.ID.String() == rootID {
			continue
		}

		rel := relativeZipPath(node, byID, rootID)
		if rel == "" {
			continue
		}

		if node.IsDirectory {
			header := &zip.FileHeader{Name: rel + "/", Method: zip.Store, Modified: time.Now()}
			if _, err := zw.CreateHeader(header); err != nil {
				log.Printf("[archive] gagal menambah folder %q: %v", rel, err)
				return
			}
			continue
		}

		if !node.StoragePath.Valid || node.StoragePath.String == "" {
			skipped++
			continue
		}

		src, err := os.Open(node.StoragePath.String)
		if err != nil {
			log.Printf("[archive] berkas hilang, dilewati: %s", node.StoragePath.String)
			skipped++
			continue
		}

		header := &zip.FileHeader{Name: rel, Method: zip.Store, Modified: time.Now()}
		dst, err := zw.CreateHeader(header)
		if err != nil {
			_ = src.Close()
			log.Printf("[archive] gagal menambah %q: %v", rel, err)
			return
		}
		if _, err := io.Copy(dst, src); err != nil {
			_ = src.Close()
			log.Printf("[archive] gagal menyalin %q: %v", rel, err)
			return
		}
		_ = src.Close()
	}

	if skipped > 0 {
		log.Printf("[archive] %d berkas dilewati karena tidak ada di disk", skipped)
	}
}

// relativeZipPath menyusun path relatif terhadap folder akar arsip.
func relativeZipPath(node db.ListSubtreeNodesRow, byID map[string]db.ListSubtreeNodesRow, rootID string) string {
	parts := make([]string, 0, 4)
	cursor := node

	for i := 0; i < 256; i++ {
		if cursor.ID.String() == rootID {
			break
		}
		name := zipSafeName(cursor.Name)
		if name == "" {
			name = "tanpa-nama"
		}
		parts = append([]string{name}, parts...)

		parent, ok := byID[cursor.ParentID.String()]
		if !ok {
			break
		}
		cursor = parent
	}

	return strings.Join(parts, "/")
}

// zipSafeName memaksa satu komponen nama: tanpa garis miring, tanpa karakter
// kontrol, sehingga entri zip tidak bisa keluar dari direktorinya.
func zipSafeName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if name == "." || name == ".." {
		return ""
	}
	return name
}

// attachmentDisposition menyertakan nama ASCII sederhana plus filename* untuk
// nama non-ASCII (huruf beraksen, karakter non-Latin).
func attachmentDisposition(filename string) string {
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, filename)

	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, url.PathEscape(filename))
}
