# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Proyek ini apa

NAS pribadi/keluarga dengan **dua mode dari satu frontend**:

| Mode | Data | Butuh server |
|---|---|---|
| Standalone (PWA) | IndexedDB di browser | Tidak |
| Private NAS | PostgreSQL + disk server (Go API) | Ya |

Frontend: Next.js 16 (App Router), React 19, Tailwind 4, TypeScript strict.
Backend: Go 1.27 + Gin, PostgreSQL 17 + pgx/v5 + sqlc (tanpa ORM).

Dokumen rujukan: `README.md` (ringkasan), `documentation/ARCHITECTURE.md` (model
data & alur), `documentation/API.md`, `documentation/CONTRIBUTING.md`.
`docs/HANDOFF.md` berisi catatan operasional lokal tetapi **tidak di-commit**
(folder `docs/` ada di `.gitignore`).

## Perintah

### Database lokal

```bash
# Opsi A: PostgreSQL portable yang sudah ada di mesin ini
.tools/pgsql/bin/postgres.exe -D .pgdata -p 5432

# Opsi B: Docker (hanya PostgreSQL)
docker compose -f deploy/docker/docker-compose.dev.yml up -d
```

Koneksi default: `postgres://postgres:postgres@localhost:5432/nas_db?sslmode=disable`.
Skema **tidak** diimpor manual — backend menjalankan migrasi dari `migrations/`
saat start (`MIGRATIONS_DIR` / `internal/migrate`).

### Backend

```bash
cd backend && go run ./cmd/server     # http://localhost:8080
curl http://localhost:8080/health
```

### Frontend

```bash
cd frontend && npm install && npm run dev   # http://localhost:3000
```

`predev`/`prebuild` menyalin `pdf.worker.min.mjs` ke `public/` lewat
`scripts/sync-pdf-worker.mjs`.

### Pemeriksaan wajib sebelum commit/PR

```bash
cd backend  && gofmt -l . && go vet ./... && go build ./... && go test ./...
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

`go test ./...` menjalankan seluruh unit test Go. Test tunggal:
`go test ./internal/handler -run TestNamaTes -v`.

### E2E (Playwright)

```bash
cd frontend && npm run test:e2e          # butuh `npm run build` lebih dulu
cd frontend && npm run test:e2e:ui
```

Playwright menyalakan `npm run start` sendiri (port 3000) dan memakai ulang
server yang sudah hidup. Suite `nas-mode`, `offline-upload`, `public-share`
butuh backend + akun uji dan di-skip secara default; aktifkan dengan
`NAS_E2E_SERVER=1 NAS_E2E_EMAIL=... NAS_E2E_PASSWORD=... npm run test:e2e`.
Di CI hanya `e2e/smoke.spec.ts` yang dijalankan.

### sqlc

```bash
cd backend && sqlc generate   # setelah mengubah db/queries/*.sql
```

## Arsitektur

### Alur request backend

`cmd/server/main.go` hanya boot: konfigurasi → storage CAS → pool pgx →
migrasi otomatis → `newRouter` → server + graceful shutdown. Seluruh tabel
route ada di `cmd/server/routes.go` dalam satu grup `/api/v1`; sub-grup hanya
membedakan otentikasi (publik, admin, protected). Bila PostgreSQL tidak bisa
di-ping, server tetap hidup dalam **mode storage-only**: hanya route Google
Drive dan undangan (`data/*.json`) yang didaftarkan; route yang butuh DB
dilewati sama sekali. Server tidak menyambung ulang otomatis.

Tiga lapis otentikasi:
- `auth.AuthMiddleware` — Bearer token, cookie `nas_session`, atau `?token=`
  (dipakai `<img>`/`<video>`).
- `auth.AdminKeyMiddleware` — `X-Admin-Key` untuk `/gdrive/*` dan `/invites/*`;
  tanpa key hanya IP lokal/privat/Tailscale yang lolos. `NAS_ADMIN_KEY` wajib
  saat `GIN_MODE=release`.
- `handler/access.go` — otorisasi per node (`canAccessNode`): `member` hanya
  berkasnya sendiri, `owner`/`admin` boleh semua anggota.
- `handler/helpers.go` — `currentUser`, `requireNodeAccess`, `parseUUIDParam`:
  ketiganya mengirim respons error sendiri, pemanggil cukup `return`.
- `handler/errors.go` — `fail`/`failInternal` satu-satunya pembentuk envelope
  `{"error":{"code","message"}}`; jangan menulis `gin.H{"error": ...}` manual.

### Penyimpanan

- `internal/storage` — `StorageProvider` (`Put/Delete/GetPhysicalPath`),
  implementasi `LocalStorage` di disk.
- `internal/db` — **hasil generate sqlc**, jangan diedit. Sumbernya
  `db/queries/*.sql`, skema dari `migrations/`.
- `internal/store` — `FileStore` JSON atomik (tmp + rename) untuk
  `gdrive.json` dan `invites.json`; keduanya harus hidup walau DB mati.

Model data: `users` → `sessions`, `file_nodes` (pohon virtual, `parent_id`,
`deleted_at` untuk soft delete) → `file_objects` (konten fisik, `sha256` unik),
`shares` (hanya hash token). Satu objek CAS bisa dirujuk banyak node
(deduplikasi). Upload dialirkan ke `data/tmp` sambil menghitung SHA-256, MIME
dideteksi dari isi file, path disk tidak pernah dibentuk dari nama kiriman.

### Frontend

`src/app/page.tsx` (±2.200 baris) adalah aplikasi utama dan masih monolit —
pecah per komponen bila menyentuhnya, satu ekstraksi per perubahan, lalu
`npx tsc --noEmit`. Tab besar sudah diekstrak ke `src/components/`
(`FileExplorerTab`, `GalleryTab`, `TrashTab`, `FamilySharingTab`, `StudioTab`,
dst.).

Pemilihan sumber data terpusat di `src/lib/api/`:
- `nas.ts` — klien backend Go (token, server URL, media URL).
- `cloud.ts` — Google Drive, undangan, share link lewat backend (token Google
  tidak pernah ke browser).
- `src/lib/storage/indexeddb.ts` — mode standalone (`idb`, skema versi 2 dengan
  object store `upload_queue`).

Studio foto/PDF (`src/lib/studio/*`) berjalan penuh di perangkat (Canvas,
pdf-lib, pdfjs, `@imgly/background-removal`) dan tidak mengunggah foto ke server.

Service worker: `frontend/public/sw.js`, didaftarkan hanya di build produksi.
Naikkan `CACHE_VERSION` bila strategi cache berubah.

URL backend punya satu sumber: `getServerUrl()` di `src/lib/api/nas.ts`
(nilai tersimpan → host halaman + port 8080). `cloud.ts` memakainya lewat
`backendBase()` — jangan menambah sumber URL kedua.

## Aturan repo

- **Jangan edit `backend/internal/db/*.go`** (generate sqlc) dan **jangan ubah
  migrasi yang sudah dijalankan** — tambahkan `migrations/0000NN_*.up.sql` baru.
- Endpoint baru yang menyentuh data pengguna wajib lewat `AuthMiddleware` +
  helper di `handler/access.go`; endpoint admin lewat `AdminKeyMiddleware`.
  Jangan bentuk path disk dari input pengguna.
- Error API selalu `{"error":{"code":"...","message":"..."}}` dengan kode yang
  sudah ada; jangan bocorkan error internal mentah.
- Komentar dan pesan commit dalam bahasa Indonesia. Tipe commit: `feat`, `fix`,
  `refactor`, `docs`, `test`, `chore` — format `<tipe>(<area>): <ringkasan>`
  (`files`, `auth`, `shares`, `family`, `gdrive`, `deploy`, `readme`).
- Kerjakan di branch fitur, lalu PR ke `main`. Satu branch satu tujuan.
  Sertakan pembaruan dokumentasi terkait dalam commit yang sama.
- Jangan commit `.env*`, `docs/`, `.tools/`, `.pgdata/`, `backend/data/`,
  `backend/data/gdrive.json`, `backend/data/invites.json`.
- Hindari dependensi baru bila stdlib/fitur platform cukup.

## Jebakan yang sudah diketahui

- **Next.js 16 berbeda dari versi lama.** Sebelum menulis kode Next, baca guide
  di `frontend/node_modules/next/dist/docs/`. Blok `BEGIN:nextjs-agent-rules`
  di `frontend/AGENTS.md` ditulis ulang otomatis oleh `next dev`.
- `npm run build` tidak menangkap semua masalah tipe — jalankan `npx tsc --noEmit`.
- `npm audit` melaporkan advisory `zod` (via `@imgly/background-removal`) yang
  **sengaja dibiarkan**. Jangan tutup dengan `overrides`: itu mematikan
  pemeriksaan tipe `Config`. Alasannya di
  `documentation/CONTRIBUTING.md#dependensi-dengan-advisory-terbuka`.
- `.gitattributes` memaksa LF di Git dan working tree. Bila `gofmt -l` masih
  menandai file lama, hapus lalu checkout ulang file itu (`rm <file> && git
  checkout -- <file>`); checkout biasa tidak menulis ulang file yang dianggap
  tidak berubah.
- `.tools/pgsql/bin/pg_ctl start` pernah mati saat shell penutupnya ditutup —
  jalankan `postgres.exe` langsung bila itu terjadi.
- Frontend memanggil `localhost:8080` dari banyak efek; setiap efek yang
  memanggil server harus memeriksa `currentUser` agar mode standalone tidak
  memicu request yang gagal.
