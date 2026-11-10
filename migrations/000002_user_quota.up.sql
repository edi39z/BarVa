-- 000002_user_quota.up.sql
-- Kuota privat per anggota keluarga.
--
-- 0 berarti belum dibatasi. Undangan membawa kuota dalam GB; nilainya
-- diterjemahkan ke byte saat akun dibuat (lihat handler.Register).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NOT NULL DEFAULT 0
    CHECK (quota_bytes >= 0);
