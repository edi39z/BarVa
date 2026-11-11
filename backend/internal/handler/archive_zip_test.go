package handler

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
)

func testNode(id, parent, name string, isDir bool) db.ListSubtreeNodesRow {
	var nodeID, parentID pgtype.UUID
	_ = nodeID.Scan(id)
	if parent != "" {
		_ = parentID.Scan(parent)
	}
	return db.ListSubtreeNodesRow{
		ID:          nodeID,
		ParentID:    parentID,
		Name:        name,
		IsDirectory: isDir,
	}
}

// Entri zip tidak boleh bisa keluar dari direktorinya, sekalipun nama node
// berisi garis miring atau "..".
func TestZipSafeName(t *testing.T) {
	cases := map[string]string{
		"foto.jpg":        "foto.jpg",
		"../../etc":       "etc",
		`a\b\c.txt`:       "c.txt",
		"nama\x00kontrol": "namakontrol",
		"  spasi  ":       "spasi",
		"..":              "",
		".":               "",
	}

	for input, want := range cases {
		if got := zipSafeName(input); got != want {
			t.Errorf("zipSafeName(%q) = %q, mau %q", input, got, want)
		}
	}
}

func TestRelativeZipPath(t *testing.T) {
	const (
		rootID   = "11111111-1111-1111-1111-111111111111"
		subID    = "22222222-2222-2222-2222-222222222222"
		fileID   = "33333333-3333-3333-3333-333333333333"
		orphanID = "44444444-4444-4444-4444-444444444444"
	)

	nodes := []db.ListSubtreeNodesRow{
		testNode(rootID, "", "Album", true),
		testNode(subID, rootID, "2026", true),
		testNode(fileID, subID, "liburan.jpg", false),
	}
	byID := make(map[string]db.ListSubtreeNodesRow, len(nodes))
	for _, node := range nodes {
		byID[node.ID.String()] = node
	}

	if got := relativeZipPath(nodes[2], byID, rootID); got != "2026/liburan.jpg" {
		t.Errorf("path bersarang = %q, mau %q", got, "2026/liburan.jpg")
	}

	// Node yang induknya tidak ikut dalam subtree tetap menghasilkan nama
	// sendiri, bukan path kosong.
	const missingParentID = "55555555-5555-5555-5555-555555555555"
	orphan := testNode(orphanID, missingParentID, "yatim.txt", false)
	if got := relativeZipPath(orphan, byID, rootID); got != "yatim.txt" {
		t.Errorf("path yatim = %q, mau %q", got, "yatim.txt")
	}
}

func TestAttachmentDisposition(t *testing.T) {
	got := attachmentDisposition("Foto Liburan.zip")
	if !strings.Contains(got, `filename="Foto Liburan.zip"`) {
		t.Errorf("nama ASCII hilang: %q", got)
	}
	if !strings.Contains(got, "filename*=UTF-8''") {
		t.Errorf("filename* tidak ada: %q", got)
	}

	nonASCII := attachmentDisposition("résumé.zip")
	if !strings.Contains(nonASCII, "r_sum_.zip") {
		t.Errorf("nama ASCII pengganti salah: %q", nonASCII)
	}
	if !strings.Contains(nonASCII, "filename*=UTF-8''r%C3%A9sum%C3%A9.zip") {
		t.Errorf("encoding UTF-8 salah: %q", nonASCII)
	}
}
