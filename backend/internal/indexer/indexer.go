// Package indexer mengekstrak teks dokumen di latar belakang untuk pencarian
// isi. Satu objek CAS cukup diekstrak sekali; hasilnya disimpan di file_texts.
package indexer

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"nas-backend/internal/db"
	"nas-backend/internal/textextract"
)

const (
	queueSize      = 64
	backfillBatch  = 200
	backfillPeriod = 15 * time.Minute
	defaultWorkers = 2
	logPrefix      = "[indexer] "
)

type job struct {
	objectID pgtype.UUID
	path     string
	name     string
}

type Indexer struct {
	queries *db.Queries
	jobs    chan job
	wg      sync.WaitGroup
	workers int
}

func New(queries *db.Queries, workers int) *Indexer {
	if workers < 1 {
		workers = defaultWorkers
	}
	return &Indexer{
		queries: queries,
		jobs:    make(chan job, queueSize),
		workers: workers,
	}
}

// EnqueueText menjadwalkan ekstraksi satu objek. Mengembalikan false bila
// antrean penuh; backfill periodik akan mengambil objek itu nanti.
func (ix *Indexer) EnqueueText(objectID pgtype.UUID, path, name string) bool {
	select {
	case ix.jobs <- job{objectID: objectID, path: path, name: name}:
		return true
	default:
		return false
	}
}

// Start menjalankan worker dan backfill periodik sampai ctx dibatalkan.
func (ix *Indexer) Start(ctx context.Context) {
	for i := 0; i < ix.workers; i++ {
		ix.wg.Add(1)
		go func() {
			defer ix.wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case item := <-ix.jobs:
					ix.index(ctx, item)
				}
			}
		}()
	}

	ix.wg.Add(1)
	go func() {
		defer ix.wg.Done()
		ix.backfill(ctx)

		ticker := time.NewTicker(backfillPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				ix.backfill(ctx)
			}
		}
	}()
}

// Wait menunggu worker selesai. Mengembalikan false bila melewati batas waktu.
func (ix *Indexer) Wait(timeout time.Duration) bool {
	done := make(chan struct{})
	go func() {
		ix.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

func (ix *Indexer) index(ctx context.Context, item job) {
	exists, err := ix.queries.FileTextExists(ctx, item.objectID)
	if err != nil {
		log.Printf("%sgagal memeriksa indeks %s: %v", logPrefix, item.name, err)
		return
	}
	if exists {
		return
	}

	text, supported, err := textextract.Extract(item.path, item.name)
	if err != nil {
		// Simpan sebagai tidak didukung agar backfill tidak mengulang berkas
		// yang rusak setiap start.
		log.Printf("%sgagal mengekstrak %s: %v", logPrefix, item.name, err)
		text = ""
		supported = false
	}

	if err := ix.queries.CreateFileText(ctx, db.CreateFileTextParams{
		ObjectID:   item.objectID,
		Content:    text,
		Supported:  supported,
		SourceName: item.name,
	}); err != nil {
		log.Printf("%sgagal menyimpan indeks %s: %v", logPrefix, item.name, err)
	}
}

// backfill memproses objek lama yang belum punya baris indeks.
func (ix *Indexer) backfill(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}

		rows, err := ix.queries.ListObjectsMissingText(ctx, backfillBatch)
		if err != nil {
			if ctx.Err() == nil {
				log.Printf("%sgagal memuat objek tanpa indeks: %v", logPrefix, err)
			}
			return
		}
		if len(rows) == 0 {
			return
		}

		for _, row := range rows {
			if ctx.Err() != nil {
				return
			}
			ix.index(ctx, job{
				objectID: row.ID,
				path:     row.StoragePath,
				name:     row.Name,
			})
		}

		if len(rows) < backfillBatch {
			return
		}
	}
}
