package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
)

// multipartRelatedWriter menulis body multipart/related untuk Google Drive
// uploadType=multipart tanpa menahan seluruh file di memori.
//
// Format yang diharapkan Drive:
//
//	--BOUNDARY CRLF
//	Content-Type: application/json; charset=UTF-8 CRLF CRLF
//	{metadata} CRLF
//	--BOUNDARY CRLF
//	Content-Type: <mime> CRLF CRLF
//	<bytes> CRLF
//	--BOUNDARY-- CRLF
type multipartRelatedWriter struct {
	w        io.Writer
	boundary string
	meta     []byte
	filename string
	mimeType string
	body     io.Reader
	ct       string
}

func newMultipartRelatedWriter(w io.Writer, _ string, meta []byte, filename, mimeType string, body ...io.Reader) *multipartRelatedWriter {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	boundary := "nas-boundary-" + hex.EncodeToString(buf)

	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	// Buang parameter yang tidak perlu, sisakan tipe dasar.
	if mt, _, err := mime.ParseMediaType(mimeType); err == nil {
		mimeType = mt
	}

	var r io.Reader
	if len(body) > 0 {
		r = body[0]
	}

	return &multipartRelatedWriter{
		w:        w,
		boundary: boundary,
		meta:     meta,
		filename: filename,
		mimeType: mimeType,
		body:     r,
		ct:       fmt.Sprintf("multipart/related; boundary=%s", boundary),
	}
}

func (m *multipartRelatedWriter) contentType() string { return m.ct }

func (m *multipartRelatedWriter) write() {
	fmt.Fprintf(m.w, "--%s\r\n", m.boundary)
	fmt.Fprint(m.w, "Content-Type: application/json; charset=UTF-8\r\n\r\n")
	m.w.Write(m.meta)
	fmt.Fprint(m.w, "\r\n")

	fmt.Fprintf(m.w, "--%s\r\n", m.boundary)
	fmt.Fprintf(m.w, "Content-Type: %s\r\n\r\n", m.mimeType)
	if m.body != nil {
		_, _ = io.Copy(m.w, m.body)
	}
	fmt.Fprint(m.w, "\r\n")

	fmt.Fprintf(m.w, "--%s--\r\n", m.boundary)
}
