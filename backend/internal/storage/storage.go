package storage

import (
	"context"
	"io"
)

// StorageProvider adalah antarmuka penyimpanan objek berbasis konten (CAS).
// Hanya operasi yang benar-benar dipakai handler yang masuk ke antarmuka ini:
// menulis objek, menghapusnya, dan mengetahui path fisik untuk streaming.
// Pembacaan isi berkas dilayani langsung dari path fisik tersebut.
type StorageProvider interface {
	Put(ctx context.Context, key string, src io.Reader) error
	Delete(ctx context.Context, key string) error
	GetPhysicalPath(key string) string
}
