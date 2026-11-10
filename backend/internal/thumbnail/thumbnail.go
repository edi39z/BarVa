// Package thumbnail membuat pratinjau gambar berukuran kecil yang disimpan
// di cache disk. Semua gambar dikonversi ke JPEG agar ukurannya konsisten
// kecil dan bisa ditampilkan semua browser.
package thumbnail

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"math"

	"golang.org/x/image/draw"

	// Pendaftaran decoder. GIF/PNG/JPEG dari stdlib, WebP dari x/image.
	_ "image/gif"
	_ "image/png"
	_ "golang.org/x/image/webp"
)

const (
	// Small dipakai untuk grid galeri dan daftar berkas.
	Small = 320
	// Large dipakai untuk pratinjau di beranda atau kartu yang lebih besar.
	Large = 960

	// MaxPixels menolak gambar yang terlalu besar agar decode tidak menghabiskan
	// memori proses. 80 MP setara foto 10.000 x 8.000.
	MaxPixels = 80_000_000

	jpegQuality = 82
)

var (
	// ErrUnsupported menandai isi berkas yang bukan gambar yang bisa didekode.
	ErrUnsupported = errors.New("format gambar tidak didukung")
	// ErrTooLarge menandai gambar yang melebihi MaxPixels.
	ErrTooLarge = errors.New("dimensi gambar terlalu besar")
)

// SizeFor memetakan nama ukuran dari query string ke sisi terpanjang piksel.
func SizeFor(name string) (int, bool) {
	switch name {
	case "", "small":
		return Small, true
	case "large":
		return Large, true
	default:
		return 0, false
	}
}

// Generate memperkecil gambar dari src sehingga sisi terpanjangnya tidak
// melebihi maxEdge, lalu mengembalikan JPEG. Gambar yang lebih kecil dari
// maxEdge tidak diperbesar.
func Generate(src io.ReadSeeker, maxEdge int) ([]byte, error) {
	if maxEdge <= 0 {
		maxEdge = Small
	}

	cfg, _, err := image.DecodeConfig(src)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return nil, ErrUnsupported
	}
	if cfg.Width*cfg.Height > MaxPixels {
		return nil, ErrTooLarge
	}
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("gagal membaca ulang gambar: %w", err)
	}

	img, _, err := image.Decode(src)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}

	bounds := img.Bounds()
	srcW, srcH := bounds.Dx(), bounds.Dy()
	scale := float64(maxEdge) / float64(maxInt(srcW, srcH))
	dstW, dstH := srcW, srcH
	if scale < 1 {
		dstW = maxInt(1, int(math.Round(float64(srcW)*scale)))
		dstH = maxInt(1, int(math.Round(float64(srcH)*scale)))
	}

	// Latar putih supaya transparansi PNG tidak menjadi hitam saat di-encode
	// sebagai JPEG.
	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return nil, fmt.Errorf("gagal meng-encode JPEG: %w", err)
	}
	return buf.Bytes(), nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
