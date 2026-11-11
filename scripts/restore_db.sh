#!/usr/bin/env bash
# ==============================================================================
# Barva - Database Disaster Recovery & Restore Script
# ==============================================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path_to_backup_file.sql.gz>"
    echo "Contoh: $0 /opt/nas/backups/postgres/nas_db_backup_20261105_020000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
DB_NAME="${DB_NAME:-nas_db}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "[ERROR] File backup tidak ditemukan: ${BACKUP_FILE}" >&2
    exit 1
fi

# Verify Checksum if present
if [ -f "${CHECKSUM_FILE}" ]; then
    echo "[INFO] Memvalidasi integritas file backup via SHA-256..."
    EXPECTED_HASH=$(cat "${CHECKSUM_FILE}" | awk '{print $1}')
    ACTUAL_HASH=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')

    if [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
        echo "[CRITICAL] Checksum MISMATCH! File backup korup atau telah dimodifikasi." >&2
        echo "Expected: ${EXPECTED_HASH}"
        echo "Actual:   ${ACTUAL_HASH}"
        exit 1
    fi
    echo "[SUCCESS] Verifikasi integritas SHA-256 berhasil."
else
    echo "[WARNING] File checksum .sha256 tidak ditemukan. Melanjutkan restore tanpa verifikasi hash..."
fi

echo "[INFO] Mengembalikan database '${DB_NAME}' dari ${BACKUP_FILE}..."
# ON_ERROR_STOP membuat psql berhenti pada error pertama; tanpa itu skrip tetap
# mencetak sukses meski restore gagal di tengah jalan.
gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD:-}" psql \
    -v ON_ERROR_STOP=1 \
    -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}"

echo "[SUCCESS] Database '${DB_NAME}' berhasil dipulihkan!"
echo "[INFO] Arsip metadata (bila ada) dipulihkan terpisah:"
echo "       sudo tar -xzf ${DB_NAME}_data_<timestamp>.tar.gz -C /opt/nas"
