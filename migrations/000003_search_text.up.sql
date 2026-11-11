-- Indeks teks dokumen untuk pencarian isi (PDF, DOCX, teks biasa).
--
-- Satu baris per file_objects, bukan per node: objek CAS yang sama bisa
-- dirujuk banyak node dan isinya identik. Baris supported=false sengaja
-- ditulis untuk objek yang tidak bisa diekstrak supaya backfill tidak
-- mencoba ulang setiap start.
--
-- CREATE EXTENSION membutuhkan user DSN yang boleh membuat extension
-- (default `postgres` memenuhi). pg_trgm bukan CREATE INDEX CONCURRENTLY,
-- jadi aman dijalankan di dalam transaksi migrasi.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS file_texts (
    object_id    UUID PRIMARY KEY REFERENCES file_objects(id) ON DELETE CASCADE,
    content      TEXT NOT NULL DEFAULT '',
    supported    BOOLEAN NOT NULL DEFAULT FALSE,
    source_name  TEXT NOT NULL DEFAULT '',
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_texts_content_trgm
    ON file_texts USING GIN (content gin_trgm_ops);

-- Dipakai CTE "alive" pada pencarian; idx_file_nodes_owner_parent tidak
-- cocok karena kolom depannya owner_id.
CREATE INDEX IF NOT EXISTS idx_file_nodes_parent_id ON file_nodes(parent_id);
