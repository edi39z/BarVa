# Setup

Panduan menjalankan Barva dari nol. Dua jalur: **development lokal** dan
**Docker**. Untuk gambaran arsitektur, lihat [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Prasyarat

| Tool | Versi minimum |
|---|---|
| Go | 1.27 |
| Node.js | 22 |
| PostgreSQL | 17 |
| Git | — |

Docker opsional, hanya untuk jalur container.

Versi Node yang dipakai CI ada di `frontend/.nvmrc`. Bila memakai `nvm`:

```bash
cd frontend && nvm use
```

---

## 1. Database

Pakai Docker bila PostgreSQL belum terpasang:

```bash
docker compose -f deploy/docker/docker-compose.dev.yml up -d
```

Atau pakai PostgreSQL lokal:

```bash
createdb nas_db
```

Tidak perlu menjalankan SQL manual di kedua jalur: backend menerapkan migrasi
dari folder `migrations/` saat start, lalu mencatat versi yang sudah dijalankan
di tabel `schema_migrations`.

Skema membuat lima tabel: `users`, `sessions`, `file_objects`, `file_nodes`,
`shares`, plus index yang dibutuhkan (termasuk unique index nama per folder).

Koneksi default yang dipakai backend:

```
postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable
```

Kalau berbeda, set `DATABASE_URL`.

> Untuk perubahan skema, buat `migrations/000002_*.up.sql` lalu restart
> backend. Jangan mengubah migrasi yang sudah pernah dijalankan — runner hanya
> menambah, tidak pernah mengulang. Database lama yang skemanya dibuat manual
> akan di-baseline otomatis (migrasi pertama ditandai sudah diterapkan).

---

## 2. Backend

```bash
cd backend
go run ./cmd/server
```

Berjalan di `http://localhost:8080`. Verifikasi:

```bash
curl http://localhost:8080/health
# {"database":true,"status":"online","version":"0.1.0","time":"..."}
```

Bila `"database":false`, backend tetap hidup dalam **mode storage-only**: hanya
Google Drive dan undangan yang aktif. Backend tidak mencoba menyambung ulang
otomatis — restart setelah database siap.

### Environment variables

Semua opsional; default bekerja untuk localhost.

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `8080` | Port HTTP |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable` | Koneksi PostgreSQL |
| `STORAGE_DIR` | `./data/storage` | Akar penyimpanan objek |
| `TEMP_DIR` | `./data/tmp` | Berkas sementara saat upload |
| `THUMBNAIL_DIR` | `./data/thumbnails` | Cache pratinjau gambar (`<sha256>_<sisi>.jpg`) |
| `DATA_DIR` | `./data` | Lokasi `gdrive.json` dan `invites.json` |
| `APP_URL` | `http://localhost:3000` | Base URL redirect OAuth dan link undangan |
| `NAS_ADMIN_KEY` | *(kosong)* | Kunci `X-Admin-Key` untuk `/gdrive/*` dan `/invites/*`. Kosong = hanya boleh dari IP lokal/privat (mode debug). **Wajib** bila `GIN_MODE=release`, backend menolak start |
| `ALLOWED_ORIGINS` | *(kosong)* | Origin CORS tambahan, dipisah koma |
| `MAX_UPLOAD_BYTES` | `10737418240` (10 GiB) | Batas ukuran satu upload |

---

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:3000`, pilih **Private NAS**, lalu daftar. Pengguna
pertama otomatis menjadi **owner**.

`npm run dev` dan `npm run build` menjalankan `scripts/sync-pdf-worker.mjs` lebih
dulu. Skrip itu menyalin `pdf.worker.min.mjs` dari `pdfjs-dist` ke `public/`
karena Web Worker pdf.js harus dilayani dari origin sendiri. Berkas hasil
salinan tidak masuk repo — sudah terdaftar di `.gitignore`.

Alamat backend ditentukan di dua tempat:

- `frontend/src/lib/api/cloud.ts` → `const PORT = "8080"`
- `frontend/src/lib/api/nas.ts` → `DEFAULT_SERVER_URL`

Ubah keduanya bila backend pindah host atau port.

---

## 4. Docker

```bash
cd deploy/docker
cp .env.example .env
```

Isi tiga variabel wajib di `.env` — compose menolak start bila salah satunya
kosong:

| Variabel | Isi |
|---|---|
| `POSTGRES_PASSWORD` | Password user `nas_admin`. Huruf dan angka saja, karena nilainya dirangkai menjadi `DATABASE_URL` |
| `NAS_ADMIN_KEY` | Hasil `openssl rand -hex 32` (minimal 32 karakter). Nilai contoh ditolak saat start |
| `APP_URL` | Alamat aplikasi yang dibuka pengguna, mis. `http://192.168.1.10:3000`. Dipakai redirect OAuth dan link undangan |

```bash
docker compose up -d --build
```

Migrasi dijalankan oleh backend saat start (`MIGRATIONS_DIR=/app/migrations`).
Compose me-mount `migrations/` ke container backend, bukan ke initdb PostgreSQL,
supaya hanya ada satu sumber kebenaran.

Untuk produksi:

- jangan ekspos port `5432` ke publik (default sudah `127.0.0.1`)
- port backend juga dibatasi ke loopback; akses masuk lewat nginx
- isi `ALLOWED_ORIGINS` dengan domain frontend
- ikutkan volume `nas_data` dalam backup: isinya `gdrive.json`, `invites.json`,
  dan cache thumbnail

`GIN_MODE=release` membuat backend **menolak start** bila `NAS_ADMIN_KEY`
kosong, masih berupa nilai contoh, atau kurang dari 32 karakter. Alasannya: di
dalam Docker semua request datang dari IP container proxy yang privat, sehingga
izin "hanya IP lokal" akan membuka `/gdrive/*` dan `/invites/*` bagi siapa pun
yang bisa menjangkau port 8080. Compose juga menolak `up` bila variabel ini
belum diisi di `deploy/docker/.env`.

### Catatan upgrade

Stack lama yang belum punya volume `nas_data` akan membuat container backend
memakai direktori kosong, sehingga koneksi Google Drive dan undangan lama tidak
terbaca. Sebelum `up -d`:

```bash
docker compose cp nas-backend:/app/data ./data-lama   # bila container lama masih ada
```

Setelah stack baru hidup, salin isinya ke volume:

```bash
docker compose cp ./data-lama/. nas-backend:/app/data/
```

`APP_URL` juga wajib diisi ulang; tanpa itu link undangan dan redirect OAuth
akan menunjuk `localhost:3000`.

---

## 5. Google Drive (opsional)

Integrasi Drive memakai OAuth Client milik Anda sendiri. Dibuat sekali, lalu
dipakai seterusnya.

### Langkah di Google Cloud Console

1. Buat project baru di `console.cloud.google.com`.
2. **APIs & Services → Library** → aktifkan **Google Drive API**.
   Tanpa langkah ini, scope Drive tidak akan muncul di halaman izin.
3. **Google Auth Platform → Data Access** → tambahkan scope
   `https://www.googleapis.com/auth/drive`.
4. **Audience** → tambahkan akun Google Anda sebagai **Test user**.
5. **Clients → Create client → Web application**.
6. Di **Authorized redirect URIs**, tambahkan:
   ```
   http://localhost:8080/api/v1/gdrive/callback
   ```
   Untuk server lain, ganti host dengan alamat server Anda.
7. Salin **Client ID** dan **Client Secret**.

### Langkah di aplikasi

Buka tab **Google Drive**, tempel Client ID dan Secret, simpan, lalu klik
**Hubungkan & Beri Izin**. Setelah menyetujui di tab Google, panel akan
menampilkan kuota dan isi Drive.

### Catatan mode Testing

Selama aplikasi belum diverifikasi Google:

- maksimal 100 akun uji
- refresh token kedaluwarsa setelah 7 hari
- scope `auth/drive` termasuk *restricted*, sehingga pemakaian publik jangka
  panjang memerlukan verifikasi (CASA)

### Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `403 access_denied` | Akun belum terdaftar sebagai test user | Tambahkan di halaman Audience |
| `403 insufficientPermissions` | Google Drive API belum diaktifkan, atau scope belum disetujui | Aktifkan API, tambahkan scope, lalu putuskan dan hubungkan ulang |
| Panel hanya melihat berkas baru | Izin hanya `drive.file` | Putuskan koneksi lalu hubungkan ulang dengan scope penuh |
| `redirect_uri_mismatch` | URI tidak sama persis dengan yang didaftarkan | Samakan skema, host, port, dan path |

---

## 6. Menjalankan sebagai service

Tersedia di `deploy/`:

- `deploy/systemd/nas-backend.service` — unit systemd untuk backend
- `deploy/systemd/backend.env.example` — contoh env berisi `DATABASE_URL` dan
  `NAS_ADMIN_KEY`
- `deploy/nginx/nas.conf` — reverse proxy (frontend `:3000`, backend `:8080`,
  batas upload 10 GB)

Unit ini **tidak** menyimpan kredensial. Rahasia dibaca dari
`/etc/nas/backend.env`, yang harus dibuat sekali:

```bash
sudo install -d -m 750 /etc/nas
sudo cp deploy/systemd/backend.env.example /etc/nas/backend.env
sudo chown root:nas /etc/nas/backend.env
sudo chmod 640 /etc/nas/backend.env
sudo -e /etc/nas/backend.env          # isi DATABASE_URL dan NAS_ADMIN_KEY
```

Lalu pasang dan nyalakan unitnya:

```bash
sudo cp deploy/systemd/nas-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nas-backend
systemctl status nas-backend
```

`NAS_ADMIN_KEY` wajib diisi: unit memakai `GIN_MODE=release`, dan backend
menolak start tanpa kunci itu. Periksa log dengan `journalctl -u nas-backend -f`.

Untuk akses dari luar rumah, gunakan **Tailscale** atau **WireGuard**.
Hindari tunnel HTTP untuk transfer berkas besar.

---

## 7. Pemeriksaan sebelum commit

```bash
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npm run lint && npx tsc --noEmit && npm run build
cd frontend && npm run test:e2e   # Playwright menyalakan servernya sendiri
```
