-- name: CreateShare :one
INSERT INTO shares (
    node_id, created_by, share_token_hash, password_hash, permission, expires_at
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING id, node_id, created_by, share_token_hash, permission, expires_at, created_at;

-- name: GetShareByTokenHash :one
SELECT s.id, s.node_id, s.created_by, s.share_token_hash, s.password_hash,
       s.permission, s.expires_at, s.created_at,
       n.name AS node_name, n.is_directory,
       o.storage_path, o.size_bytes, o.mime_type, o.sha256
FROM shares s
JOIN file_nodes n ON n.id = s.node_id
LEFT JOIN file_objects o ON o.id = n.object_id
WHERE s.share_token_hash = $1
  AND (s.expires_at IS NULL OR s.expires_at > NOW())
  AND n.deleted_at IS NULL
LIMIT 1;

-- name: ListSharesByOwner :many
SELECT s.id, s.node_id, s.share_token_hash, s.permission, s.expires_at, s.created_at,
       (s.password_hash IS NOT NULL AND s.password_hash <> '') AS has_password,
       n.name AS node_name, n.is_directory,
       o.size_bytes, o.mime_type
FROM shares s
JOIN file_nodes n ON n.id = s.node_id
LEFT JOIN file_objects o ON o.id = n.object_id
WHERE s.created_by = $1
  AND n.deleted_at IS NULL
ORDER BY s.created_at DESC;

-- name: DeleteShare :exec
DELETE FROM shares
WHERE id = $1 AND created_by = $2;
