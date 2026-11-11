#!/usr/bin/env bash
# ==============================================================================
# Barva - 3-2-1 Offsite Storage Synchronization
# ==============================================================================
# Aturan 3-2-1:
# - 3 salinan data (1 primer, 2 cadangan)
# - 2 media penyimpanan berbeda (SSD NAS lokal + Secondary Drive / Cloud)
# - 1 salinan di lokasi fisik berbeda (Google Drive / Remote Homelab)
# ==============================================================================
set -euo pipefail

STORAGE_DIR="${STORAGE_DIR:-/opt/nas/data/storage}"
BACKUP_DIR="${BACKUP_DIR:-/opt/nas/backups}"
REMOTE_TARGET="${REMOTE_TARGET:-gdrive:NAS_Offsite_Backup}"
LOG_FILE="/var/log/nas/offsite_sync.log"

mkdir -p "$(dirname "${LOG_FILE}")"

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "${LOG_FILE}"
}

log "[INFO] Memulai sinkronisasi Offsite Backup (Prinsip 3-2-1)..."

# 1. Pastikan database ter-backup terlebih dahulu
if [ -f "$(dirname "$0")/backup_db.sh" ]; then
    log "[INFO] Menjalankan dump database PostgreSQL..."
    bash "$(dirname "$0")/backup_db.sh" >> "${LOG_FILE}" 2>&1 || log "[WARNING] Gagal backup DB otomatis."
fi

# 2. Sinkronisasi Objek CAS & Backup ke Remote Cloud via rclone / rsync
if command -v rclone &> /dev/null; then
    log "[INFO] Menggunakan rclone untuk sinkronisasi ke ${REMOTE_TARGET}..."
    rclone sync "${STORAGE_DIR}/objects" "${REMOTE_TARGET}/objects" \
        --fast-list \
        --transfers 4 \
        --checkers 8 \
        --bwlimit 10M \
        --log-file="${LOG_FILE}" \
        --log-level INFO

    log "[INFO] Mengunggah dump database terbaru ke ${REMOTE_TARGET}/backups..."
    rclone copy "${BACKUP_DIR}/postgres" "${REMOTE_TARGET}/backups" \
        --max-age 24h \
        --log-file="${LOG_FILE}" \
        --log-level INFO
    log "[SUCCESS] Sinkronisasi Offsite 3-2-1 selesai!"
else
    log "[WARNING] rclone belum terinstall di server. Silakan install rclone ('sudo apt install rclone') untuk offsite sync otomatis."
fi
