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
WHERE n.owner_id = $1 
  AND ((n.parent_id = $2) OR ($2 IS NULL AND n.parent_id IS NULL))
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
