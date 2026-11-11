package handler

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// quotaExceeded melaporkan apakah unggahan baru akan melewati kuota.
// Kuota 0 berarti belum dibatasi.
func quotaExceeded(quota, used, incoming int64) bool {
	if quota <= 0 {
		return false
	}
	return used+incoming > quota
}

// humanBytes merapikan angka byte untuk pesan error.
func humanBytes(n int64) string {
	const unit = int64(1024)
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := unit, 0
	for v := n / unit; v >= unit; v /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "KMGTPE"[exp])
}

// isUniqueViolation menandai bentrokan nama pada unique index parsial
// (owner_id, parent_id, name) WHERE deleted_at IS NULL.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
