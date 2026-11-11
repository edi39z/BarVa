#!/usr/bin/env bash
# ==============================================================================
# Barva - Automated Database Backup Script (Prinsip 3-2-1)
# ==============================================================================
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/nas/backups/postgres}"
DB_NAME="${DB_NAME:-nas_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] [INFO] Memulai backup database '${DB_NAME}'..."

# Dump and compress
if PGPASSWORD="${DB_PASSWORD:-}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip -9 > "${BACKUP_FILE}"; then
    # Generate SHA-256 checksum
    sha256sum "${BACKUP_FILE}" | awk '{print $1}' > "${CHECKSUM_FILE}"
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date -Iseconds)] [SUCCESS] Backup selesai: ${BACKUP_FILE} (Ukuran: ${BACKUP_SIZE})"
    echo "[$(date -Iseconds)] [INFO] Checksum SHA-256: $(cat "${CHECKSUM_FILE}")"
else
    echo "[$(date -Iseconds)] [ERROR] Backup database gagal!" >&2
    exit 1
fi

# Rotate old backups older than RETENTION_DAYS
echo "[$(date -Iseconds)] [INFO] Membersihkan backup yang lebih tua dari ${RETENTION_DAYS} hari..."
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_backup_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -Iseconds)] [SUCCESS] Rotasi selesai."
