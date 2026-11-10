-- 000002_user_quota.down.sql
ALTER TABLE users DROP COLUMN IF EXISTS quota_bytes;
