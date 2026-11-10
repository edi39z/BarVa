-- name: CreateFileObject :one
INSERT INTO file_objects (
    sha256, storage_path, size_bytes, mime_type
) VALUES (
    $1, $2, $3, $4
)
ON CONFLICT (sha256) DO UPDATE SET sha256 = EXCLUDED.sha256
RETURNING id, sha256, storage_path, size_bytes, mime_type, created_at;

-- name: GetFileObjectBySHA256 :one
SELECT id, sha256, storage_path, size_bytes, mime_type, created_at
FROM file_objects
WHERE sha256 = $1 LIMIT 1;

-- name: CreateFileNode :one
INSERT INTO file_nodes (
    owner_id, parent_id, name, is_directory, object_id
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING id, owner_id, parent_id, name, is_directory, object_id, deleted_at, created_at, updated_at;

-- name: ListNodesByParent :many
SELECT n.id, n.owner_id, n.parent_id, n.name, n.is_directory, n.object_id,
       n.deleted_at, n.created_at, n.updated_at,
       o.size_bytes, o.mime_type
FROM file_nodes n
LEFT JOIN file_objects o ON o.id = n.object_id
WHERE (sqlc.arg(all_owners)::boolean OR n.owner_id = sqlc.arg(owner_id))
  AND ((n.parent_id = sqlc.arg(parent_id)) OR (sqlc.arg(parent_id) IS NULL AND n.parent_id IS NULL))
  AND n.deleted_at IS NULL
ORDER BY n.is_directory DESC, n.name ASC;

-- name: GetNodeByID :one
SELECT n.id, n.owner_id, n.parent_id, n.name, n.is_directory, n.object_id,
       n.deleted_at, n.created_at, n.updated_at,
       o.storage_path, o.size_bytes, o.mime_type, o.sha256
FROM file_nodes n
LEFT JOIN file_objects o ON o.id = n.object_id
WHERE n.id = $1 AND n.deleted_at IS NULL
LIMIT 1;

-- name: SoftDeleteNode :exec
UPDATE file_nodes
SET deleted_at = NOW(), updated_at = NOW()
WHERE id = $1 AND owner_id = $2;

-- name: RenameNode :one
UPDATE file_nodes
SET name = $3, updated_at = NOW()
WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
RETURNING id, name, updated_at;

-- name: MoveNode :one
UPDATE file_nodes
SET parent_id = $3, updated_at = NOW()
WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
RETURNING id, parent_id, updated_at;

-- name: ListTrashedNodes :many
SELECT n.id, n.owner_id, n.parent_id, n.name, n.is_directory, n.object_id,
       n.deleted_at, n.created_at, n.updated_at,
       o.size_bytes, o.mime_type,
       p.name AS parent_name
FROM file_nodes n
LEFT JOIN file_objects o ON o.id = n.object_id
LEFT JOIN file_nodes p ON p.id = n.parent_id
WHERE (sqlc.arg(all_owners)::boolean OR n.owner_id = sqlc.arg(owner_id))
  AND n.deleted_at IS NOT NULL
ORDER BY n.deleted_at DESC;

-- GetNodeAnyState membaca node tanpa memfilter pemilik maupun deleted_at.
-- Otorisasi dilakukan di handler supaya owner/admin bisa menjangkau
-- berkas anggota lain, dan 404 bisa dibedakan dari 403.
-- name: GetNodeAnyState :one
SELECT id, owner_id, parent_id, name, is_directory, object_id,
       deleted_at, created_at, updated_at
FROM file_nodes
WHERE id = $1
LIMIT 1;

-- name: RestoreNode :one
UPDATE file_nodes
SET deleted_at = NULL, updated_at = NOW()
WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
RETURNING id, parent_id, name, updated_at;

-- name: PurgeNode :execrows
DELETE FROM file_nodes
WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL;

-- name: ListSubtreeObjectIDs :many
WITH RECURSIVE subtree AS (
    SELECT n.id AS id, n.object_id AS object_id
    FROM file_nodes n
    WHERE n.id = $1 AND n.owner_id = $2
    UNION ALL
    SELECT c.id AS id, c.object_id AS object_id
    FROM file_nodes c
    JOIN subtree s ON c.parent_id = s.id
)
SELECT DISTINCT object_id
FROM subtree
WHERE object_id IS NOT NULL;

-- name: DeleteObjectIfOrphan :one
DELETE FROM file_objects o
WHERE o.id = $1
  AND NOT EXISTS (SELECT 1 FROM file_nodes n WHERE n.object_id = o.id)
RETURNING o.sha256;

-- ListShareSubtreeNodes mengambil seluruh isi folder (termasuk folder itu
-- sendiri) untuk dijadikan arsip zip pada share link publik. Hanya node aktif
-- yang ikut, dan pemilik tidak difilter karena akses sudah divalidasi lewat
-- token share.
-- name: ListShareSubtreeNodes :many
WITH RECURSIVE subtree AS (
    SELECT n.id AS id, n.parent_id AS parent_id, n.name AS name,
           n.is_directory AS is_directory, n.object_id AS object_id
    FROM file_nodes n
    WHERE n.id = $1 AND n.deleted_at IS NULL
    UNION ALL
    SELECT c.id AS id, c.parent_id AS parent_id, c.name AS name,
           c.is_directory AS is_directory, c.object_id AS object_id
    FROM file_nodes c
    JOIN subtree s ON c.parent_id = s.id
    WHERE c.deleted_at IS NULL
)
SELECT s.id, s.parent_id, s.name, s.is_directory,
       o.storage_path, o.size_bytes, o.mime_type
FROM subtree s
LEFT JOIN file_objects o ON o.id = s.object_id
ORDER BY s.is_directory DESC, s.name ASC;
