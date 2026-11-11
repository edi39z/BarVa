// Package textextract mengambil teks dari dokumen untuk indeks pencarian.
//
// Format dideteksi dari ekstensi nama, bukan MIME: DOCX dilaporkan sebagai
// application/zip oleh sniffMIME di handler upload.
package textextract

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const (
	// MaxSourceBytes membatasi ukuran berkas yang dibaca. Berkas lebih besar
	// ditandai tidak didukung tanpa dibaca, supaya worker tidak kehabisan
	// memori pada PDF raksasa.
	MaxSourceBytes = 25 << 20
	// MaxTextBytes membatasi teks yang disimpan di database.
	MaxTextBytes = 256 << 10
	// MaxPDFPages mencegah ekstraksi dokumen yang sangat tebal.
	MaxPDFPages = 300
)

var plainExtensions = map[string]bool{
	".txt":      true,
	".md":       true,
	".markdown": true,
	".csv":      true,
	".log":      true,
	".json":     true,
	".xml":      true,
	".html":     true,
	".htm":      true,
}

// Extract mengembalikan teks dokumen dan apakah formatnya didukung.
//
// `supported=false, err=nil` berarti format tidak dikenal atau berkas terlalu
// besar; `supported=true, text=""` berarti format didukung tetapi tidak ada
// teks (mis. PDF hasil pindai). Keduanya tetap disimpan sebagai baris indeks
// supaya backfill tidak mencoba ulang.
func Extract(path, name string) (string, bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", false, err
	}
	if tooLarge(info.Size()) {
		return "", false, nil
	}

	ext := strings.ToLower(filepath.Ext(name))
	switch {
	case ext == ".pdf":
		text, err := extractPDF(path)
		return normalize(text), true, err
	case ext == ".docx":
		text, err := extractDOCX(path)
		return normalize(text), true, err
	case plainExtensions[ext]:
		text, ok, err := extractPlain(path)
		return normalize(text), ok, err
	default:
		return "", false, nil
	}
}

// normalize merapikan whitespace dan memotong teks ke batas penyimpanan.
func normalize(text string) string {
	text = strings.ToValidUTF8(text, "")
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	lines := strings.Split(text, "\n")
	kept := make([]string, 0, len(lines))
	blank := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if blank {
				continue
			}
			blank = true
		} else {
			blank = false
		}
		kept = append(kept, line)
	}

	text = strings.TrimSpace(strings.Join(kept, "\n"))
	if len(text) > MaxTextBytes {
		text = text[:MaxTextBytes]
		// Potong sisa byte yang membentuk rune tidak lengkap.
		for len(text) > 0 && !utf8.ValidString(text) {
			text = text[:len(text)-1]
		}
	}
	return text
}

func tooLarge(size int64) bool {
	return size > MaxSourceBytes
}

func wrapErr(kind string, err error) error {
	return fmt.Errorf("ekstraksi %s: %w", kind, err)
}
