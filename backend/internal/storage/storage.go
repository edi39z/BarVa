package storage

import (
	"context"
	"io"
	"time"
)

type ObjectInfo struct {
	Key       string    `json:"key"`
	Size      int64     `json:"size"`
	UpdatedAt time.Time `json:"updated_at"`
}

type StorageProvider interface {
	Put(ctx context.Context, key string, src io.Reader) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
	Stat(ctx context.Context, key string) (ObjectInfo, error)
	GetPhysicalPath(key string) string
}
