package handler

import (
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"nas-backend/internal/db"
)

const (
	minSearchRunes     = 3
	maxSearchRunes     = 80
	defaultSearchLimit = 50
	maxSearchLimit     = 100
)

// likeEscaper meng-escape karakter khusus LIKE. Karakter escape '!' dipilih
// agar tidak bergantung pada standard_conforming_strings. Urutan penggantian
// penting: escape karakter escape lebih dulu.
var likeEscaper = strings.NewReplacer("!", "!!", "%", "!%", "_", "!_")

func escapeLike(value string) string {
	return likeEscaper.Replace(value)
}

// SearchContent mencari dokumen berdasarkan isinya. Minimal tiga karakter
// karena indeks trigram pg_trgm baru efektif pada panjang itu.
func (h *FilesHandler) SearchContent(c *gin.Context) {
	userId, ok := currentUser(c)
	if !ok {
		return
	}

	query := strings.TrimSpace(c.Query("q"))
	if utf8.RuneCountInString(query) < minSearchRunes {
		fail(c, http.StatusBadRequest, "QUERY_TOO_SHORT", "Kata kunci minimal 3 karakter untuk pencarian isi.")
		return
	}
	if runes := []rune(query); len(runes) > maxSearchRunes {
		query = string(runes[:maxSearchRunes])
	}

	limit := defaultSearchLimit
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > maxSearchLimit {
		limit = maxSearchLimit
	}

	rows, err := h.queries.SearchFileContents(c.Request.Context(), db.SearchFileContentsParams{
		AllOwners: canManageAllFiles(c),
		OwnerID:   userId,
		Query:     escapeLike(query),
		RowLimit:  int32(limit),
	})
	if err != nil {
		failInternal(c, err, "DB_ERROR", "Gagal mencari isi dokumen.")
		return
	}
	if rows == nil {
		rows = []db.SearchFileContentsRow{}
	}

	c.JSON(http.StatusOK, gin.H{"data": rows})
}
