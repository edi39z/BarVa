# Setup

Panduan menjalankan NAS Project dari nol. Dua jalur: **development lokal** dan
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

---

## 1. Database

```bash
createdb nas_db
psql -d nas_db -f migrations/000001_init_schema.up.sql
```

Skema membuat lima tabel: `users`, `sessions`, `file_objects`, `file_nodes`,
`shares`, plus index yang dibutuhkan (termasuk unique index nama per folder).

Koneksi default yang dipakai backend:

```
postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable
```

Kalau berbeda, set `DATABASE_URL`.

> Belum ada tool migrasi otomatis. Untuk perubahan skema berikutnya, buat
> `migrations/000002_*.up.sql` dan jalankan manual. Jangan mengubah migrasi yang
> sudah pernah dijalankan.

---

## 2. Backend

```bash
cd backend
go run ./cmd/server
```

Berjalan di `http://localhost:8080`. Verifikasi:

```bash
curl http://localhost:8080/health
# {"database":true,"status":"online","version":"1.0-mvp","time":"..."}
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
| `DATA_DIR` | `./data` | Lokasi `gdrive.json` dan `invites.json` |
| `APP_URL` | `http://localhost:3000` | Base URL redirect OAuth dan link undangan |
| `NAS_ADMIN_KEY` | *(kosong)* | Kunci `X-Admin-Key` untuk `/gdrive/*` dan `/invites/*`. Kosong = hanya boleh dari IP lokal/privat |
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

Isi `POSTGRES_PASSWORD` di `.env` — wajib, compose menolak start bila kosong.
Gunakan huruf dan angka saja, karena nilainya dirangkai menjadi `DATABASE_URL`.

```bash
docker compose up -d --build
```

Migrasi dijalankan otomatis oleh image PostgreSQL karena `migrations/` di-mount
ke `/docker-entrypoint-initdb.d`. Ini hanya berlaku saat volume database masih
kosong.

Untuk produksi:

- jangan ekspos port `5432` ke publik (default sudah `127.0.0.1`)
- set `NAS_ADMIN_KEY` bila server dapat diakses dari luar jaringan lokal
- isi `ALLOWED_ORIGINS` dengan domain frontend

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
- `deploy/nginx/nas.conf` — reverse proxy (frontend `:3000`, backend `:8080`,
  batas upload 10 GB)

Untuk akses dari luar rumah, gunakan **Tailscale** atau **WireGuard**.
Hindari tunnel HTTP untuk transfer berkas besar.

---

## 7. Pemeriksaan sebelum commit

```bash
cd backend  && go build ./... && go test ./...
cd frontend && npx tsc --noEmit && npm run build
```
