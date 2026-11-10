package thumbnail

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func pngBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}

func TestGenerateScalesDown(t *testing.T) {
	src := bytes.NewReader(pngBytes(t, 800, 600))

	out, err := Generate(src, Small)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	img, format, err := image.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("hasil bukan gambar: %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("format = %q, mau jpeg", format)
	}

	b := img.Bounds()
	if b.Dx() != 320 || b.Dy() != 240 {
		t.Fatalf("ukuran = %dx%d, mau 320x240", b.Dx(), b.Dy())
	}
}

func TestGenerateDoesNotUpscale(t *testing.T) {
	src := bytes.NewReader(pngBytes(t, 100, 80))

	out, err := Generate(src, Large)
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode jpeg: %v", err)
	}
	b := img.Bounds()
	if b.Dx() != 100 || b.Dy() != 80 {
		t.Fatalf("ukuran = %dx%d, mau tetap 100x80", b.Dx(), b.Dy())
	}
}

func TestGenerateRejectsNonImage(t *testing.T) {
	_, err := Generate(bytes.NewReader([]byte("bukan gambar sama sekali")), Small)
	if !errors.Is(err, ErrUnsupported) {
		t.Fatalf("err = %v, mau ErrUnsupported", err)
	}
}

func TestSizeFor(t *testing.T) {
	cases := []struct {
		in    string
		want  int
		valid bool
	}{
		{"", Small, true},
		{"small", Small, true},
		{"large", Large, true},
		{"huge", 0, false},
	}
	for _, c := range cases {
		got, ok := SizeFor(c.in)
		if got != c.want || ok != c.valid {
			t.Errorf("SizeFor(%q) = (%d,%v), mau (%d,%v)", c.in, got, ok, c.want, c.valid)
		}
	}
}
