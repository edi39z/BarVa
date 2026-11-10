-- name: CreateUser :one
INSERT INTO users (
    email, username, password_hash, role, quota_bytes
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING id, email, username, role, quota_bytes, created_at, updated_at;

-- name: GetUserByEmail :one
SELECT id, email, username, password_hash, role, quota_bytes, created_at, updated_at
FROM users
WHERE email = $1 LIMIT 1;

-- name: GetUserByID :one
SELECT id, email, username, role, quota_bytes, created_at, updated_at
FROM users
WHERE id = $1 LIMIT 1;

-- name: ListUsers :many
SELECT id, email, username, role, quota_bytes, created_at, updated_at
FROM users
ORDER BY created_at ASC;
