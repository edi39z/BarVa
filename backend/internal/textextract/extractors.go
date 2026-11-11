package textextract

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"os"
	"strings"

	"github.com/ledongthuc/pdf"
)

// extractPDF mengambil teks polos. Library ini panic pada PDF rusak, jadi
// panic ditangkap dan dikembalikan sebagai error agar worker tetap hidup.
func extractPDF(path string) (text string, err error) {
	defer func() {
		if r := recover(); r != nil {
			text = ""
			err = wrapErr("pdf", errors.New("berkas rusak atau terenkripsi"))
		}
	}()

	file, reader, err := pdf.Open(path)
	if err != nil {
		return "", wrapErr("pdf", err)
	}
	defer file.Close()

	if reader.NumPage() > MaxPDFPages {
		return "", errors.New("pdf melebihi batas halaman")
	}

	plain, err := reader.GetPlainText()
	if err != nil {
		return "", wrapErr("pdf", err)
	}

	data, err := io.ReadAll(io.LimitReader(plain, MaxTextBytes))
	if err != nil {
		return "", wrapErr("pdf", err)
	}
	return string(data), nil
}

// extractDOCX membaca word/document.xml. Hanya isi paragraf yang diambil;
// header/footer dan metadata dilewati.
func extractDOCX(path string) (string, error) {
	archive, err := zip.OpenReader(path)
	if err != nil {
		return "", wrapErr("docx", err)
	}
	defer archive.Close()

	var document *zip.File
	for _, entry := range archive.File {
		if entry.Name == "word/document.xml" {
			document = entry
			break
		}
	}
	if document == nil {
		return "", errors.New("docx tidak punya word/document.xml")
	}
	if tooLarge(int64(document.UncompressedSize64)) {
		return "", errors.New("docx terlalu besar setelah dibuka")
	}

	stream, err := document.Open()
	if err != nil {
		return "", wrapErr("docx", err)
	}
	defer stream.Close()

	return docxText(stream)
}

// docxText mengumpulkan isi <w:t>, dengan newline pada akhir paragraf dan
// tab/baris baru pada elemen terkait.
func docxText(stream io.Reader) (string, error) {
	decoder := xml.NewDecoder(stream)
	var builder strings.Builder
	inText := false

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", wrapErr("docx", err)
		}

		switch element := token.(type) {
		case xml.StartElement:
			switch element.Name.Local {
			case "t":
				inText = true
			case "tab":
				builder.WriteByte('\t')
			case "br":
				builder.WriteByte('\n')
			}
		case xml.EndElement:
			switch element.Name.Local {
			case "t":
				inText = false
			case "p":
				builder.WriteByte('\n')
			}
		case xml.CharData:
			if inText {
				builder.Write(element)
			}
		}
	}

	return builder.String(), nil
}

// extractPlain membaca berkas teks. Berkas biner dengan byte NUL di awal
// ditolak agar tidak menghasilkan sampah di indeks.
func extractPlain(path string) (string, bool, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", false, err
	}
	defer file.Close()

	head := make([]byte, 8192)
	read, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return "", false, wrapErr("teks", err)
	}
	if bytes.IndexByte(head[:read], 0) >= 0 {
		return "", false, nil
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", false, wrapErr("teks", err)
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxTextBytes))
	if err != nil {
		return "", false, wrapErr("teks", err)
	}
	return string(data), true, nil
}
