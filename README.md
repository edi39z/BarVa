# NAS Project

Private NAS dan cloud keluarga yang berjalan di server sendiri — dengan dua mode:
**standalone di browser** (tanpa server sama sekali) atau **terhubung ke server
pribadi** untuk kapasitas multi-terabyte, streaming video, dan deduplikasi file.

Dibangun dengan Next.js + Go + PostgreSQL. Tidak ada layanan cloud wajib, tidak
ada langganan, dan file tetap di tangan Anda.

> **Status:** MVP aktif dikembangkan. Fitur inti (auth, file manager, streaming,
> Google Drive, undangan keluarga, share link) sudah berjalan; lihat
> [Status Fitur](#status-fitur) untuk yang belum selesai.

**Dokumentasi lengkap ada di [`documentation/`](documentation/):**
[Arsitektur](documentation/ARCHITECTURE.md) ·
[Antarmuka](documentation/UI.md) ·
[Setup](documentation/SETUP.md) ·
[API](documentation/API.md) ·
[Kontribusi](documentation/CONTRIBUTING.md) ·
[Roadmap](documentation/ROADMAP.md)

---

## Daftar Isi

- [Dua Mode](#dua-mode)
- [Status Fitur](#status-fitur)
- [Teknologi](#teknologi)
- [Struktur Repo](#struktur-repo)
- [Menjalankan — Development](#menjalankan--development)
- [Menjalankan — Docker](#menjalankan--docker)
- [Environment Variables](#environment-variables)
- [Ringkasan API](#ringkasan-api)
- [Keamanan](#keamanan)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)

---

## Dua Mode

| | **Mode Standalone** | **Mode Private NAS** |
|---|---|---|
| **Butuh server** | Tidak | Ya (Go + PostgreSQL) |
| **Penyimpanan** | IndexedDB di browser | Disk server + PostgreSQL |
| **Kapasitas** | Terbatas kuota browser | Sebesar disk Anda |
| **Streaming video** | Terbatas | HTTP Range (206) penuh |
| **Deduplikasi** | — | SHA-256 content-addressed |
| **Berbagi ke keluarga** | — | Undangan + share link |
| **Biaya** | Rp 0 | Listrik server |

Kedua mode memakai frontend yang sama. Mode dipilih saat pertama membuka aplikasi.

---

## Status Fitur

### Sudah berjalan

- Registrasi, login, logout, dan validasi sesi (Argon2id + token sesi)
- User pertama yang mendaftar otomatis menjadi **owner**
- Rate limit login: 5 kegagalan per 15 menit
- Upload file ke NAS dengan deduplikasi SHA-256, plus opsi ganti file bernama sama
- File manager NAS: daftar file, navigasi folder, buat folder, hapus, unduh,
  pratinjau gambar/video, ganti nama, dan pindah folder
- Trash: item terhapus bisa dipulihkan ke folder asal atau dihapus permanen
  (objek yang tidak terpakai lagi ikut dibersihkan dari disk)
- Folder, soft delete, download, dan streaming video via HTTP 206
- Google Drive OAuth (kuota, jelajah folder, upload, download lewat server)
- Undangan anggota keluarga (token di-hash, status pending/accepted/revoked);
  penerima undangan membuat akun nyata dengan role & kuota dari undangan
- Kuota anggota ditegakkan saat upload (`413 QUOTA_EXCEEDED`), dihitung dari
  objek unik sehingga dedup tidak dihitung dua kali; pemakaian tampil di sidebar,
  dan owner/admin dapat mengubah kuota tiap anggota dari Family Hub
- Share link publik: password opsional, masa berlaku, halaman `/s/:token` yang
  benar-benar mengunduh dari server; share folder bisa diunduh sebagai satu
  arsip zip yang dialirkan langsung tanpa file sementara
- RBAC berbasis role: `member` hanya menyentuh berkasnya sendiri, `owner`/`admin`
  bisa melihat dan mengelola berkas semua anggota (ditandai di UI)
- PWA offline: service worker menyimpan shell aplikasi dan halaman `/offline`,
  profil terakhir di-cache agar aplikasi tetap terbuka tanpa jaringan
- Studio foto & dokumen yang berjalan penuh di perangkat: foto→PDF, gabung PDF,
  pasfoto 3×4/4×6, kompres foto, hapus latar belakang (model AI ±40 MB, diunduh
  sekali setelah pengguna memberi izin), dan peningkatan kualitas foto 2×.
  Foto tidak pernah diunggah ke server
- Migrasi database otomatis saat backend start (`schema_migrations`), termasuk
  baseline untuk database lama
- Hardening: CORS whitelist, admin key, batas ukuran upload, deteksi MIME dari isi file

---

## Teknologi

**Frontend**
- Next.js 16 (App Router), React 19, TypeScript strict
- Tailwind CSS 4 dengan token desain di `globals.css` (mode terang & gelap)
- lucide-react
- IndexedDB (`idb`) untuk mode standalone

**Backend**
- Go 1.27, Gin v1.12
- PostgreSQL 17, pgx/v5, sqlc v1.31.1 (typed SQL, tanpa ORM)
- Argon2id untuk password hashing
- `http.ServeContent` untuk streaming Range

**Infrastruktur**
- Docker Compose, systemd, atau Nginx reverse proxy
- Remote access disarankan lewat Tailscale / WireGuard

---

## Struktur Repo

```
.
├── backend/                 # API Go
│   ├── cmd/server/          # entry point, routing, CORS, graceful shutdown
│   ├── internal/auth/       # middleware sesi, admin key, Argon2id
│   ├── internal/handler/    # auth, files, shares, family, gdrive, invite
│   ├── internal/storage/    # penyimpanan disk (CAS + atomic rename)
│   ├── internal/store/      # persistensi JSON atomik
│   ├── internal/db/         # HASIL GENERATE sqlc — jangan diedit manual
│   ├── db/queries/          # sumber query sqlc (.sql)
│   └── Dockerfile
├── frontend/                # PWA Next.js
│   └── src/
│       ├── app/             # halaman utama, /invite, /s/[token]
│       ├── components/      # AuthGate, GoogleDrivePanel, InviteAccept
│       └── lib/api/         # klien backend (nas.ts, cloud.ts)
├── migrations/              # skema PostgreSQL (SQL statis)
├── documentation/           # arsitektur, setup, API, kontribusi, roadmap
├── deploy/
│   ├── docker/              # docker-compose.yml
│   ├── nginx/               # konfigurasi reverse proxy
│   └── systemd/             # unit service backend
└── scripts/                 # backup, restore, sinkronisasi offsite (3-2-1)
```

---

## Menjalankan — Development

### Prasyarat

| Tool | Versi |
|---|---|
| Go | 1.27+ |
| Node.js | 22+ |
| PostgreSQL | 17 |

### 1. Database

```bash
createdb nas_db
psql -d nas_db -f migrations/000001_init_schema.up.sql
```

Default koneksi: `postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable`.
Kalau berbeda, set `DATABASE_URL`.

### 2. Backend

```bash
cd backend
go run ./cmd/server
```

Berjalan di `http://localhost:8080`. Cek:

```bash
curl http://localhost:8080/health
# {"database":true,"status":"online","version":"1.0-mvp",...}
```

Jika `"database":false`, backend tetap hidup dalam **mode storage-only** — hanya
Google Drive dan undangan yang aktif. Backend **tidak** menyambung ulang otomatis;
restart setelah database siap.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:3000`, pilih **Private NAS**, lalu daftar. User pertama
menjadi owner.

> Alamat backend di-hardcode di `frontend/src/lib/api/cloud.ts` (`PORT`) dan
> `frontend/src/lib/api/nas.ts` (`DEFAULT_SERVER_URL`). Ubah di kedua tempat
> jika backend pindah host/port.

### 4. Google Drive (opsional)

Membutuhkan OAuth Client sendiri di Google Cloud Console: aktifkan Google Drive
API, tambahkan scope `https://www.googleapis.com/auth/drive`, daftarkan akun
sebagai test user, lalu isi Client ID/Secret lewat panel di aplikasi.

> App dalam mode **Testing** dibatasi 100 test user dan refresh token kedaluwarsa
> 7 hari. Scope `auth/drive` termasuk *restricted* — pemakaian publik jangka
> panjang memerlukan verifikasi Google (CASA).

---

## Menjalankan — Docker

```bash
cd deploy/docker
cp .env.example .env
```

Buka `.env` dan isi **`POSTGRES_PASSWORD`** — nilainya wajib, compose akan
menolak start jika kosong. Gunakan huruf dan angka saja, karena nilai ini
diambil sebagai bagian dari `DATABASE_URL`.

```bash
docker compose up -d --build
```

Migrasi otomatis dijalankan oleh backend saat start (`MIGRATIONS_DIR`), dengan
`migrations/` di-mount ke container backend — bukan ke initdb PostgreSQL.

> ⚠️ Sebelum produksi: jangan ekspos port `5432` ke publik (default sudah
> `127.0.0.1`), isi `NAS_ADMIN_KEY` (wajib di mode `release`), dan isi
> `ALLOWED_ORIGINS` dengan domain frontend Anda.
> File `.env` tidak boleh di-commit.

---

## Environment Variables

Semua opsional kecuali `NAS_ADMIN_KEY` saat `GIN_MODE=release`; default
bekerja untuk localhost.

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `8080` | Port HTTP backend |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable` | Koneksi PostgreSQL |
| `STORAGE_DIR` | `./data/storage` | Akar penyimpanan objek (CAS) |
| `TEMP_DIR` | `./data/tmp` | Temp upload sebelum dipindah atomik |
| `THUMBNAIL_DIR` | `./data/thumbnails` | Cache pratinjau gambar (`<sha256>_<sisi>.jpg`) |
| `DATA_DIR` | `./data` | Lokasi `gdrive.json` dan `invites.json` |
| `APP_URL` | `http://localhost:3000` | Base URL untuk redirect OAuth dan link undangan |
| `NAS_ADMIN_KEY` | *(kosong)* | Kunci `X-Admin-Key` untuk `/gdrive/*` dan `/invites/*`. Kosong = hanya boleh dari IP lokal/privat; **wajib** bila `GIN_MODE=release` |
| `ALLOWED_ORIGINS` | *(kosong)* | Origin CORS tambahan, dipisah koma |
| `MAX_UPLOAD_BYTES` | `10737418240` (10 GiB) | Batas ukuran satu upload |

> Khusus Docker Compose, `POSTGRES_PASSWORD` juga wajib diisi di
> `deploy/docker/.env` (lihat `deploy/docker/.env.example`). Nilai itu dipakai
> untuk merakit `DATABASE_URL` secara otomatis.

---

## Ringkasan API

Base URL: `http://localhost:8080/api/v1`

| Grup | Prefix | Autentikasi |
|---|---|---|
| Auth | `/auth/*` | Publik (kecuali `/auth/me`) |
| File manager | `/files/*` | Bearer token |
| Shares | `/shares/*` | Bearer token |
| Share publik | `/public/share/:token` | Publik |
| Family | `/family/*` | Bearer token |
| Google Drive | `/gdrive/*` | `X-Admin-Key` atau IP lokal |
| Undangan | `/invites/*` | `X-Admin-Key` atau IP lokal |
| Undangan publik | `/public/invites/:token` | Publik |

Format error konsisten:

```json
{ "error": { "code": "FILE_TOO_LARGE", "message": "..." } }
```

Contoh cepat:

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.c","username":"tester","password":"rahasia123"}'
```

---

## Keamanan

- Password di-hash dengan **Argon2id**.
- Token sesi disimpan sebagai hash; token share dan undangan juga hanya hash-nya yang masuk database.
- Semua endpoint file memfilter berdasarkan `owner_id` pemilik sesi.
- Path fisik file **tidak** dibentuk dari nama file kiriman pengguna (mencegah path traversal).
- MIME dideteksi dari isi file, bukan dari header klien.
- Upload dibatasi `MAX_UPLOAD_BYTES`; body dibaca lewat `http.MaxBytesReader`.
- Tidak ada kredensial hardcoded di repo: password database Docker diambil dari
  `.env` dan compose menolak start bila belum diisi.

**Jangan pernah commit:** `.env*`, `backend/data/gdrive.json`,
`backend/data/invites.json`, atau file berisi kredensial OAuth.

Jika menemukan celah keamanan, jangan buka issue publik — hubungi maintainer
secara langsung.

### Advisory dependensi yang diterima

`npm audit` di `frontend/` melaporkan 2 temuan **high** dari `zod` < 4.6.6
(GHSA-mrhx-c7xc-m3w5) di dalam `@imgly/background-removal`. Temuan ini sengaja
dibiarkan dan tidak ditutup dengan `overrides`: paket itu mengekspor tipe
`Config` memakai nama tipe zod 3, sehingga memaksa zod 4 membuat `Config`
menjadi `any` dan mematikan pemeriksaan `model`/`device`/`output`. Alasan
lengkapnya ada di
[CONTRIBUTING](documentation/CONTRIBUTING.md#dependensi-dengan-advisory-terbuka).

---

## Kontribusi

Kontribusi diterima, terutama untuk item di [Status Fitur](#status-fitur).

### Alur

1. **Fork** repo, lalu buat branch dari `main`:
   ```bash
   git checkout -b feat/file-manager-ui
   ```
2. Kerjakan satu hal per branch. Hindari mencampur refactor besar dengan fitur baru.
3. Jalankan pemeriksaan sebelum commit:
   ```bash
   cd backend  && go build ./... && go vet ./... && go test ./...
   cd frontend && npm run lint && npx tsc --noEmit && npm run build
   cd frontend && npm run test:e2e   # Playwright menyalakan servernya sendiri
   ```
4. Commit dengan pesan yang jelas:
   ```
   feat(files): muat daftar file NAS ke tampilan
   fix(auth): tangani token kedaluwarsa saat fetchMe
   docs(readme): tambah panduan docker
   ```
   Tipe yang dipakai: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
5. Buka Pull Request ke `main`. Jelaskan **apa** yang berubah, **kenapa**, dan
   **bagaimana** Anda mengujinya.

### Aturan teknis

- **Jangan edit `backend/internal/db/*.go`** — itu hasil generate sqlc. Ubah
  `backend/db/queries/*.sql`, lalu jalankan `sqlc generate`.
- Tambahkan migrasi baru sebagai `migrations/000002_*.up.sql`. **Jangan** mengubah
  migrasi yang sudah pernah dijalankan.
- Setiap endpoint baru yang menyentuh data pengguna wajib lewat `AuthMiddleware`
  dan memakai helper otorisasi di `backend/internal/handler/access.go`.
  Endpoint admin wajib lewat `AdminKeyMiddleware`.
- Jangan menambah dependensi baru tanpa alasan kuat. Stdlib dan fitur platform
  lebih diutamakan.
- Ikuti gaya kode di sekitarnya: komentar bahasa Indonesia, pesan error
  terstruktur, penanganan error eksplisit.

### Yang paling dibutuhkan sekarang

1. Memecah `frontend/src/app/page.tsx` (monolit ±3.900 baris) menjadi komponen
2. Migrasi otomatis saat server start
3. Antrean unggah saat offline

---

## Lisensi

Belum ditentukan. Sampai lisensi dipilih, anggap semua hak dilindungi —
hubungi maintainer sebelum menggunakan kode ini di luar keperluan kontribusi.

### Lisensi pihak ketiga

Alat **Hapus Latar** memakai [`@imgly/background-removal`](https://www.npmjs.com/package/@imgly/background-removal)
yang dilisensikan **AGPL-3.0**. Selama aplikasi ini hanya dipakai sendiri atau
di dalam keluarga, tidak ada kewajiban tambahan. Jika nanti aplikasi
didistribusikan atau dijalankan sebagai layanan publik, AGPL-3.0 mewajibkan
kode sumber versi yang dipakai ikut dibuka. Alat **Naikkan Kualitas** tidak
memakai dependensi pihak ketiga (hanya Canvas API), jadi tidak terpengaruh.
