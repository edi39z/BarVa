# Deploy

Panduan menaikkan Barva ke server dari repo git, bukan dari salinan berkas
manual. Dengan alur ini versi yang berjalan selalu bisa dilacak ke satu commit.

## Bentuk stack

`deploy/docker/docker-compose.yml` menaikkan empat service:

| Service | Port host (default) | Keterangan |
|---|---|---|
| `nas-nginx` | `8088` | Pintu masuk untuk domain publik (Cloudflare Tunnel) |
| `nas-frontend` | `3002` | Next.js standalone; dipakai untuk akses LAN |
| `nas-backend` | `8082` | API Go; dipakai untuk akses LAN dan upload besar |
| `nas-postgres` | — | Hanya di jaringan internal Docker |

nginx meneruskan `/api/*`, `/health`, dan `/public/*` ke backend, sisanya ke
frontend. Tunnel Cloudflare cukup diarahkan ke nginx.

## Sekali saja: siapkan repo di server

```bash
sudo mkdir -p /opt/docker/compose
sudo git clone <url-repo> /opt/docker/compose/barva
cd /opt/docker/compose/barva/deploy/docker
cp .env.example .env
```

Isi `.env` (tidak pernah di-commit):

- `POSTGRES_PASSWORD`, `NAS_ADMIN_KEY`, `APP_URL` — wajib, compose menolak start
  bila kosong.
- `ALLOWED_ORIGINS` — domain publik plus alamat LAN yang dipakai.
- `EXTERNAL_HDD_DIR` — akar disk eksternal baca-saja bila ada.
- `BARVA_STORAGE_DIR` / `BARVA_TMP_DIR` / `BARVA_DATA_DIR` — arahkan ke disk
  data, bukan disk sistem.

```bash
docker compose up -d --build
docker compose ps          # semua service "healthy"/"running"
curl http://127.0.0.1:8088/health
```

### Bila direktori sudah berisi kode lama (bukan clone)

Server yang sebelumnya diisi dengan salin berkas bisa diubah jadi clone tanpa
kehilangan data:

```bash
cd /opt/docker/compose
tar czf "barva-backup-$(date +%F).tar.gz" barva      # cadangan dulu
cd barva
git init -q
git remote add origin <url-repo>
git fetch origin
git reset --hard origin/main        # atau branch fitur yang sedang dipakai
```

`git reset --hard` hanya menimpa berkas yang dilacak. `.env` dan berkas lain
yang masuk `.gitignore` tidak tersentuh, jadi konfigurasi server tetap. Setelah
ini alur update kembali normal (`./deploy/deploy.sh`).

Selama repo masih **privat**, `git fetch`/`git pull` dari server butuh
kredensial: deploy key read-only (Settings → Deploy keys) atau personal access
token. Setelah repo dijadikan publik, tidak ada kredensial yang perlu disimpan
di server.

## Update

```bash
cd /opt/docker/compose/barva
./deploy/deploy.sh
```

Script itu menarik `git pull --ff-only`, membangun ulang image, menaikkan stack,
lalu menunggu container `nas-backend` berstatus `healthy`. Bila kesehatan tidak
tercapai dalam 60 detik, script keluar dengan status 1 — cek
`docker compose logs nas-backend`.

Langkah manualnya sama:

```bash
git pull --ff-only
cd deploy/docker
docker compose up -d --build
```

## Rollback

```bash
cd /opt/docker/compose/barva
git log --oneline -5
git checkout <commit-yang-terakhir-baik>
cd deploy/docker && docker compose up -d --build
```

Setelah pulih, kembali ke jalur utama dengan `git switch main`.

> Migrasi database **tidak** ikut mundur. `migrations/*.up.sql` hanya berjalan
> maju, jadi rollback kode harus tetap kompatibel dengan skema terbaru. Untuk
> perubahan yang mengubah skema, siapkan rencana data sebelum deploy.

## Catatan

- Jangan menaruh `.env`, `docs/`, atau folder data di dalam repo.
- Migrasi dijalankan backend saat start; tidak perlu langkah terpisah.
- Cloudflare (free/pro) memotong request body di 100 MB. Berkas lebih besar
  harus lewat alamat LAN (`http://<ip-server>:3002` atau `:8082`), bukan domain.
- Backup yang perlu diambil: folder `BARVA_DATA_DIR` (`gdrive.json`,
  `invites.json`, thumbnail) dan volume PostgreSQL.
