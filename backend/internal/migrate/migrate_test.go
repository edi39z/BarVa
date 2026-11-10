package migrate

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFilesSortedAndFiltered(t *testing.T) {
	dir := t.TempDir()

	for _, name := range []string{
		"000002_tambah_indeks.up.sql",
		"000001_init_schema.up.sql",
		"000001_init_schema.down.sql",
		"catatan.txt",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("SELECT 1;"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	got, err := Files(dir)
	if err != nil {
		t.Fatalf("Files() error: %v", err)
	}

	want := []string{"000001_init_schema.up.sql", "000002_tambah_indeks.up.sql"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Files() = %v, want %v", got, want)
	}
}

func TestResolveDirPrefersEnv(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MIGRATIONS_DIR", dir)

	if got := ResolveDir(); got != dir {
		t.Fatalf("ResolveDir() = %q, want %q", got, dir)
	}
}
