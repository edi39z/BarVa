// Package store menyediakan persistensi JSON kecil tanpa database.
//
// Alasan: fitur seperti "koneksi Google Drive" dan "undangan keluarga" harus
// tetap hidup setelah server restart, tetapi tidak butuh RDBMS. Satu file JSON
// dengan tulis atomik (tmp + rename) jauh lebih murah daripada memaksa
// PostgreSQL menyala hanya untuk menyimpan 3 kunci.
package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// FileStore adalah penyimpanan JSON tunggal yang aman dipakai banyak goroutine.
type FileStore struct {
	path string
	mu   sync.RWMutex
}

// New membuat FileStore. Direktori induk dibuat otomatis.
func New(path string) (*FileStore, error) {
	if path == "" {
		return nil, errors.New("store: path kosong")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	return &FileStore{path: path}, nil
}

// Load membaca isi file ke dalam v. File belum ada bukan error: v dibiarkan apa adanya.
func (s *FileStore) Load(v any) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, v)
}

// Save menulis v secara atomik: file sementara lalu rename.
// Kegagalan di tengah tulis tidak akan merusak data lama.
func (s *FileStore) Save(v any) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Update memuat, mengubah, lalu menyimpan kembali di bawah satu kunci tulis.
// Dipakai agar operasi baca-ubah-tulis tidak saling menimpa.
func (s *FileStore) Update(v any, mutate func() error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	raw, err := os.ReadFile(s.path)
	if err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, v); err != nil {
			return err
		}
	} else if err != nil && !os.IsNotExist(err) {
		return err
	}

	if err := mutate(); err != nil {
		return err
	}

	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, out, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
