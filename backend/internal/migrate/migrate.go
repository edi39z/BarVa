// Package migrate menjalankan migrasi SQL saat backend start.
//
// Aturannya sengaja sederhana: satu file .up.sql = satu versi, diurutkan
// berdasarkan nama, dan yang sudah tercatat di schema_migrations tidak
// dijalankan ulang. Tidak ada rollback otomatis — migrasi .down.sql tetap
// dijalankan manual bila diperlukan.
package migrate

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

const createTableSQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`

// ResolveDir mencari folder migrasi: env MIGRATIONS_DIR, lalu ./migrations,
// lalu ../migrations. Mengembalikan path kosong bila tidak ada yang cocok.
func ResolveDir() string {
	if dir := strings.TrimSpace(os.Getenv("MIGRATIONS_DIR")); dir != "" {
		return dir
	}
	for _, candidate := range []string{"./migrations", "../migrations"} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return ""
}

// Files mengembalikan nama file migrasi naik yang valid, terurut.
func Files(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var files []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		files = append(files, entry.Name())
	}
	sort.Strings(files)
	return files, nil
}

// Run menerapkan semua migrasi yang belum tercatat. Bila database sudah
// memiliki tabel users tetapi schema_migrations masih kosong (deployment lama
// yang migrasinya dijalankan manual), migrasi pertama dianggap sudah
// diterapkan agar tidak gagal karena tabel sudah ada.
func Run(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	if _, err := pool.Exec(ctx, createTableSQL); err != nil {
		return fmt.Errorf("gagal menyiapkan schema_migrations: %w", err)
	}

	files, err := Files(dir)
	if err != nil {
		return fmt.Errorf("gagal membaca folder migrasi %q: %w", dir, err)
	}
	if len(files) == 0 {
		return nil
	}

	applied, err := appliedVersions(ctx, pool)
	if err != nil {
		return err
	}

	if len(applied) == 0 {
		hasUsers, err := tableExists(ctx, pool, "users")
		if err != nil {
			return err
		}
		if hasUsers {
			// Baseline: skema awal sudah dibuat manual sebelum runner ada.
			if _, err := pool.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", files[0]); err != nil {
				return fmt.Errorf("gagal menandai migrasi baseline %q: %w", files[0], err)
			}
			applied[files[0]] = true
		}
	}

	for _, name := range files {
		if applied[name] {
			continue
		}

		body, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return fmt.Errorf("gagal membaca %q: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("gagal membuka transaksi untuk %q: %w", name, err)
		}

		// Satu Exec tanpa argumen memakai simple protocol, sehingga file boleh
		// berisi banyak statement sekaligus.
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("migrasi %q gagal: %w", name, err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", name); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("gagal mencatat migrasi %q: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("gagal commit migrasi %q: %w", name, err)
		}

		fmt.Printf("[migrate] diterapkan: %s\n", name)
	}

	return nil
}

func appliedVersions(ctx context.Context, pool *pgxpool.Pool) (map[string]bool, error) {
	rows, err := pool.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return nil, fmt.Errorf("gagal membaca schema_migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[version] = true
	}
	return applied, rows.Err()
}

func tableExists(ctx context.Context, pool *pgxpool.Pool, name string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", "public."+name).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("gagal memeriksa tabel %q: %w", name, err)
	}
	return exists, nil
}
