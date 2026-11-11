#!/usr/bin/env bash
# ==============================================================================
# Barva - Automated Backup Script (database + metadata, prinsip 3-2-1)
# ==============================================================================
# Yang dicadangkan:
#   1. dump PostgreSQL (struktur + metadata)
#   2. direktori DATA_DIR (gdrive.json, invites.json) dan cache thumbnail
# Objek berkas di STORAGE_DIR tidak diikutkan di sini karena ukurannya besar;
# bagian itu ditangani scripts/offsite_sync.sh.
# ==============================================================================
set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/nas/backups/postgres}"
DATA_DIR="${DATA_DIR:-/opt/nas/data}"
DB_NAME="${DB_NAME:-nas_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_backup_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
DATA_FILE="${BACKUP_DIR}/${DB_NAME}_data_${TIMESTAMP}.tar.gz"
DATA_CHECKSUM_FILE="${DATA_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] [INFO] Memulai backup database '${DB_NAME}'..."

# Dump and compress. Tulis ke berkas .part dulu supaya kegagalan di tengah
# jalan tidak meninggalkan arsip setengah jadi yang terlihat seperti backup sah.
TMP_BACKUP_FILE="${BACKUP_FILE}.part"
if PGPASSWORD="${DB_PASSWORD:-}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip -9 > "${TMP_BACKUP_FILE}"; then
    mv "${TMP_BACKUP_FILE}" "${BACKUP_FILE}"
    # Generate SHA-256 checksum
    sha256sum "${BACKUP_FILE}" | awk '{print $1}' > "${CHECKSUM_FILE}"
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date -Iseconds)] [SUCCESS] Backup selesai: ${BACKUP_FILE} (Ukuran: ${BACKUP_SIZE})"
    echo "[$(date -Iseconds)] [INFO] Checksum SHA-256: $(cat "${CHECKSUM_FILE}")"
else
    rm -f "${TMP_BACKUP_FILE}"
    echo "[$(date -Iseconds)] [ERROR] Backup database gagal!" >&2
    exit 1
fi

# Arsipkan metadata non-database. Tanpa ini, restore kehilangan koneksi Google
# Drive dan daftar undangan meski database kembali utuh.
if [ -d "${DATA_DIR}" ]; then
    DATA_PARENT=$(dirname "${DATA_DIR}")
    DATA_BASENAME=$(basename "${DATA_DIR}")
    TMP_DATA_FILE="${DATA_FILE}.part"
    tar -czf "${TMP_DATA_FILE}" -C "${DATA_PARENT}" "${DATA_BASENAME}"
    mv "${TMP_DATA_FILE}" "${DATA_FILE}"
    sha256sum "${DATA_FILE}" | awk '{print $1}' > "${DATA_CHECKSUM_FILE}"
    echo "[$(date -Iseconds)] [SUCCESS] Arsip data selesai: ${DATA_FILE}"
else
    echo "[$(date -Iseconds)] [WARNING] DATA_DIR '${DATA_DIR}' tidak ditemukan; arsip data dilewati." >&2
fi

# Rotate old backups older than RETENTION_DAYS
echo "[$(date -Iseconds)] [INFO] Membersihkan backup yang lebih tua dari ${RETENTION_DAYS} hari..."
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_backup_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "${DB_NAME}_data_*.tar.gz*" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -Iseconds)] [SUCCESS] Rotasi selesai."
