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
DATA_DIR="${DATA_DIR:-/opt/nas/data}"
BACKUP_DIR="${BACKUP_DIR:-/opt/nas/backups}"
REMOTE_TARGET="${REMOTE_TARGET:-gdrive:NAS_Offsite_Backup}"
LOG_DIR="${LOG_DIR:-/var/log/nas}"
LOG_FILE="${LOG_DIR}/offsite_sync.log"

mkdir -p "${LOG_DIR}"

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "${LOG_FILE}"
}

log "[INFO] Memulai sinkronisasi Offsite Backup (Prinsip 3-2-1)..."

# 1. Pastikan database dan metadata ter-backup terlebih dahulu
if [ -f "$(dirname "$0")/backup_db.sh" ]; then
    log "[INFO] Menjalankan dump database PostgreSQL..."
    bash "$(dirname "$0")/backup_db.sh" >> "${LOG_FILE}" 2>&1 || log "[WARNING] Gagal backup DB otomatis."
fi

# 2. Salin objek CAS, metadata, dan dump ke remote.
#    `rclone copy` dipakai, bukan `sync`: penghapusan lokal (mis. berkas yang
#    baru dipindahkan ke Trash) tidak boleh ikut menghapus salinan offsite.
if command -v rclone &> /dev/null; then
    log "[INFO] Mengunggah objek CAS ke ${REMOTE_TARGET}/objects..."
    rclone copy "${STORAGE_DIR}/objects" "${REMOTE_TARGET}/objects" \
        --fast-list \
        --transfers 4 \
        --checkers 8 \
        --bwlimit 10M \
        --log-file="${LOG_FILE}" \
        --log-level INFO

    log "[INFO] Mengunggah metadata (gdrive.json, invites.json) ke ${REMOTE_TARGET}/data..."
    rclone copy "${DATA_DIR}" "${REMOTE_TARGET}/data" \
        --exclude "thumbnails/**" \
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
