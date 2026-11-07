-- name: CreateSession :one
INSERT INTO sessions (
    user_id, token_hash, user_agent, client_ip, expires_at
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING id, user_id, token_hash, user_agent, client_ip, expires_at, created_at;

-- name: GetSessionByTokenHash :one
SELECT s.id, s.user_id, s.token_hash, s.user_agent, s.client_ip, s.expires_at, s.created_at,
       u.email, u.username, u.role
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.expires_at > NOW()
LIMIT 1;

-- name: DeleteSessionByTokenHash :exec
DELETE FROM sessions
WHERE token_hash = $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions
WHERE expires_at <= NOW();
