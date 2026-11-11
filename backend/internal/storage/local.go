package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type LocalStorage struct {
	baseDir string
}

func NewLocalStorage(baseDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(filepath.Join(baseDir, "objects"), 0755); err != nil {
		return nil, fmt.Errorf("failed to create objects dir: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(baseDir, "tmp"), 0755); err != nil {
		return nil, fmt.Errorf("failed to create tmp dir: %w", err)
	}
	return &LocalStorage{baseDir: baseDir}, nil
}

func (l *LocalStorage) getPath(key string) string {
	if len(key) >= 2 {
		prefix := key[:2]
		return filepath.Join(l.baseDir, "objects", prefix, key)
	}
	return filepath.Join(l.baseDir, "objects", "misc", key)
}

func (l *LocalStorage) GetPhysicalPath(key string) string {
	return l.getPath(key)
}

func (l *LocalStorage) Put(ctx context.Context, key string, src io.Reader) error {
	destPath := l.getPath(key)

	// If already exists (deduplication hit), no need to write again
	if _, err := os.Stat(destPath); err == nil {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return fmt.Errorf("failed to create object sub-directory: %w", err)
	}

	// Write to temporary file first for atomic safety
	tmpFile, err := os.CreateTemp(filepath.Join(l.baseDir, "tmp"), "upload-*")
	if err != nil {
		return fmt.Errorf("failed to create tmp file: %w", err)
	}
	tmpName := tmpFile.Name()
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName) // safe no-op if renamed
	}()

	// 32KB buffered copy (zero-RAM allocation)
	if _, err := io.Copy(tmpFile, src); err != nil {
		return fmt.Errorf("failed to copy file stream: %w", err)
	}

	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("failed to close tmp file: %w", err)
	}

	// Atomic rename to final CAS path
	if err := os.Rename(tmpName, destPath); err != nil {
		return fmt.Errorf("failed to rename to destination: %w", err)
	}

	return nil
}

func (l *LocalStorage) Delete(ctx context.Context, key string) error {
	path := l.getPath(key)
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
