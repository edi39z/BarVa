-- Pencarian isi dokumen. Teks disimpan per objek CAS (file_texts), jadi satu
-- objek yang dirujuk beberapa node tetap satu baris.

-- SearchFileContents mencari objek yang isinya cocok lalu mengembalikan node
-- aktif yang merujuknya.
--
-- CTE "alive" menelusuri pohon dari akar karena SoftDeleteNode hanya menandai
-- satu baris: anak-anak folder yang dihapus tetap deleted_at IS NULL dan tidak
-- boleh muncul di hasil.
--
-- "matched" diberi MATERIALIZED agar konten penuh tidak ikut disortir; snippet
-- dihitung sekali di dalamnya.
-- name: SearchFileContents :many
WITH RECURSIVE alive AS (
    SELECT n.id, n.owner_id, n.parent_id, n.name, n.object_id,
           n.created_at, n.updated_at
    FROM file_nodes n
    WHERE n.parent_id IS NULL
      AND n.deleted_at IS NULL
      AND (sqlc.arg(all_owners)::boolean OR n.owner_id = sqlc.arg(owner_id))
    UNION ALL
    SELECT c.id, c.owner_id, c.parent_id, c.name, c.object_id,
           c.created_at, c.updated_at
    FROM file_nodes c
    JOIN alive a ON c.parent_id = a.id
    WHERE c.deleted_at IS NULL
),
matched AS MATERIALIZED (
    SELECT t.object_id,
           CASE
               WHEN strpos(lower(t.content), lower(sqlc.arg(query)::text)) > 0
               THEN substr(t.content,
                           greatest(1, strpos(lower(t.content), lower(sqlc.arg(query)::text)) - 60),
                           220)
               ELSE left(t.content, 220)
           END::text AS snippet
    FROM file_texts t
    WHERE t.supported = TRUE
      AND t.content ILIKE '%' || sqlc.arg(query)::text || '%' ESCAPE '!'
)
SELECT a.id, a.owner_id, a.parent_id, a.name, a.object_id,
       FALSE AS is_directory,
       o.size_bytes, o.mime_type, a.created_at, a.updated_at,
       COALESCE(p.name, '')::text AS parent_name,
       m.snippet
FROM matched m
JOIN alive a ON a.object_id = m.object_id
JOIN file_objects o ON o.id = a.object_id
LEFT JOIN file_nodes p ON p.id = a.parent_id
ORDER BY a.updated_at DESC
LIMIT sqlc.arg(row_limit)::int;

-- name: FileTextExists :one
SELECT EXISTS (SELECT 1 FROM file_texts WHERE object_id = $1) AS exists;

-- name: CreateFileText :exec
INSERT INTO file_texts (object_id, content, supported, source_name)
VALUES ($1, $2, $3, $4)
ON CONFLICT (object_id) DO NOTHING;

-- ListObjectsMissingText mengambil objek yang belum punya baris indeks.
-- DISTINCT ON memberi satu nama deterministik per objek: DOCX ber-MIME
-- application/zip, jadi ekstraktor butuh nama untuk mengenali ekstensinya.
-- name: ListObjectsMissingText :many
SELECT DISTINCT ON (o.id) o.id, o.storage_path, o.size_bytes, o.mime_type, n.name
FROM file_objects o
JOIN file_nodes n ON n.object_id = o.id AND n.deleted_at IS NULL
LEFT JOIN file_texts t ON t.object_id = o.id
WHERE t.object_id IS NULL
ORDER BY o.id, n.is_directory, n.name
LIMIT sqlc.arg(row_limit)::int;
