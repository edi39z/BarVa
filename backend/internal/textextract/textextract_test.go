package textextract

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTemp(t *testing.T, name string, content []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("gagal menulis berkas uji: %v", err)
	}
	return path
}

func TestExtractPlainText(t *testing.T) {
	path := writeTemp(t, "catatan.txt", []byte("Halo dunia.\r\n\r\n\r\nBaris kedua.\n"))

	text, supported, err := Extract(path, "catatan.txt")
	if err != nil {
		t.Fatalf("tidak mengharapkan error: %v", err)
	}
	if !supported {
		t.Fatal("teks biasa harus didukung")
	}
	if text != "Halo dunia.\n\nBaris kedua." {
		t.Fatalf("teks tidak sesuai: %q", text)
	}
}

func TestExtractPlainTextRejectsBinary(t *testing.T) {
	path := writeTemp(t, "gambar.txt", []byte{'P', 'N', 'G', 0, 1, 2, 3})

	_, supported, err := Extract(path, "gambar.txt")
	if err != nil {
		t.Fatalf("tidak mengharapkan error: %v", err)
	}
	if supported {
		t.Fatal("berkas dengan byte NUL tidak boleh didukung")
	}
}

func TestExtractDOCX(t *testing.T) {
	path := filepath.Join(t.TempDir(), "surat.docx")
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("gagal membuat docx: %v", err)
	}

	archive := zip.NewWriter(file)
	entry, err := archive.Create("word/document.xml")
	if err != nil {
		t.Fatalf("gagal membuat entri zip: %v", err)
	}
	document := `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
		`<w:body>` +
		`<w:p><w:r><w:t>Undangan rapat</w:t></w:r></w:p>` +
		`<w:p><w:r><w:t>Hari </w:t></w:r><w:r><w:t>Senin</w:t></w:r></w:p>` +
		`</w:body></w:document>`
	if _, err := entry.Write([]byte(document)); err != nil {
		t.Fatalf("gagal menulis document.xml: %v", err)
	}
	if err := archive.Close(); err != nil {
		t.Fatalf("gagal menutup zip: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("gagal menutup berkas: %v", err)
	}

	text, supported, err := Extract(path, "surat.docx")
	if err != nil {
		t.Fatalf("tidak mengharapkan error: %v", err)
	}
	if !supported {
		t.Fatal("docx harus didukung")
	}
	if !strings.Contains(text, "Undangan rapat") || !strings.Contains(text, "Hari Senin") {
		t.Fatalf("teks docx tidak sesuai: %q", text)
	}
}

func TestExtractUnsupported(t *testing.T) {
	path := writeTemp(t, "foto.png", []byte("bukan teks"))

	_, supported, err := Extract(path, "foto.png")
	if err != nil {
		t.Fatalf("tidak mengharapkan error: %v", err)
	}
	if supported {
		t.Fatal("png tidak boleh didukung")
	}
}

func TestTooLarge(t *testing.T) {
	if tooLarge(MaxSourceBytes) {
		t.Fatal("berkas tepat di batas harus diterima")
	}
	if !tooLarge(MaxSourceBytes + 1) {
		t.Fatal("berkas di atas batas harus ditolak")
	}
}
