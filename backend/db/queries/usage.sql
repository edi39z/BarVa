-- GetOwnerUsageByType mengelompokkan objek unik per kategori tampilan.
-- Kategori diturunkan dari MIME objek (bukan nama node) agar satu objek tidak
-- masuk dua kategori sekaligus, dan aturannya mengikuti detectFileType di
-- frontend: audio digabung ke video.
-- name: GetOwnerUsageByType :many
WITH owned AS (
    SELECT DISTINCT n.object_id
    FROM file_nodes n
    WHERE n.owner_id = sqlc.arg(owner_id)
      AND n.deleted_at IS NULL
      AND n.object_id IS NOT NULL
),
typed AS (
    SELECT
        CASE
            WHEN o.mime_type LIKE 'image/%' THEN 'image'
            WHEN o.mime_type LIKE 'video/%' THEN 'video'
            WHEN o.mime_type LIKE 'audio/%' THEN 'video'
            WHEN o.mime_type LIKE 'application/zip%'
              OR o.mime_type LIKE 'application/x-rar%'
              OR o.mime_type LIKE 'application/x-7z%'
              OR o.mime_type LIKE 'application/gzip%'
              OR o.mime_type LIKE 'application/x-gzip%' THEN 'archive'
            ELSE 'document'
        END::text AS kind,
        o.size_bytes
    FROM owned x
    JOIN file_objects o ON o.id = x.object_id
)
SELECT kind, SUM(size_bytes)::bigint AS size_bytes, COUNT(*)::bigint AS file_count
FROM typed
GROUP BY kind
ORDER BY SUM(size_bytes) DESC;

-- GetOwnerUsageByFolder menghitung ukuran tiap folder top-level secara
-- rekursif (termasuk subfolder). Objek yang sama di dua folder top-level
-- dihitung di keduanya — itu memang isi folder — sehingga jumlah seluruh baris
-- bisa melebihi total kuota.
--
-- root_id NULL menggabungkan berkas di akar dan node yang induknya sudah
-- dihapus; frontend memberi label "Di luar folder".
--
-- UNION (bukan UNION ALL) menghentikan rekursi bila data parent_id membentuk
-- siklus. Filter owner_id di recursive term penting karena pemindahan tidak
-- memeriksa pemilik folder tujuan.
-- name: GetOwnerUsageByFolder :many
WITH RECURSIVE tree AS (
    SELECT n.id, n.object_id, n.id AS root_id
    FROM file_nodes n
    WHERE n.owner_id = sqlc.arg(owner_id)
      AND n.deleted_at IS NULL
      AND n.parent_id IS NULL
      AND n.is_directory = TRUE
    UNION
    SELECT c.id, c.object_id, t.root_id
    FROM file_nodes c
    JOIN tree t ON c.parent_id = t.id
    WHERE c.owner_id = sqlc.arg(owner_id)
      AND c.deleted_at IS NULL
),
mapped AS (
    SELECT t.object_id, t.root_id
    FROM tree t
    WHERE t.object_id IS NOT NULL
    UNION ALL
    SELECT n.object_id, NULL::uuid
    FROM file_nodes n
    WHERE n.owner_id = sqlc.arg(owner_id)
      AND n.deleted_at IS NULL
      AND n.object_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tree t WHERE t.id = n.id)
),
per_folder AS (
    SELECT DISTINCT m.root_id, m.object_id FROM mapped m
)
SELECT f.root_id, COALESCE(r.name, '')::text AS root_name,
       SUM(o.size_bytes)::bigint AS size_bytes, COUNT(*)::bigint AS file_count
FROM per_folder f
JOIN file_objects o ON o.id = f.object_id
LEFT JOIN file_nodes r ON r.id = f.root_id
GROUP BY f.root_id, r.name
ORDER BY SUM(o.size_bytes) DESC, COALESCE(r.name, '') ASC
LIMIT sqlc.arg(row_limit)::int;
