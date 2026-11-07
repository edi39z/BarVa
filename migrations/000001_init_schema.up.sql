-- 000001_init_schema.up.sql
-- NAS Project Core Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    user_agent TEXT,
    client_ip VARCHAR(45),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 3. FILE OBJECTS (Physical Content Addressable Storage)
CREATE TABLE IF NOT EXISTS file_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sha256 VARCHAR(64) NOT NULL UNIQUE,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    mime_type VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_objects_sha256 ON file_objects(sha256);

-- 4. FILE NODES (Virtual Hierarchical File System)
CREATE TABLE IF NOT EXISTS file_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES file_nodes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_directory BOOLEAN NOT NULL DEFAULT FALSE,
    object_id UUID REFERENCES file_objects(id) ON DELETE RESTRICT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique name per parent folder for active (non-deleted) nodes
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_nodes_unique_name 
ON file_nodes (owner_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_file_nodes_owner_parent ON file_nodes(owner_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_file_nodes_deleted_at ON file_nodes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_nodes_object_id ON file_nodes(object_id);

-- 5. SHARES
CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_token_hash VARCHAR(64) UNIQUE,
    password_hash VARCHAR(255),
    permission VARCHAR(32) NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer', 'editor', 'uploader')),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shares_node_id ON shares(node_id);
CREATE INDEX IF NOT EXISTS idx_shares_token_hash ON shares(share_token_hash);
