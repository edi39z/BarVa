DROP INDEX IF EXISTS idx_file_nodes_parent_id;
DROP TABLE IF EXISTS file_texts;
-- pg_trgm sengaja dibiarkan terpasang: extension milik database, bukan fitur.
