# Kontribusi

Terima kasih sudah tertarik. Dokumen ini menjelaskan cara berkontribusi agar
perubahan Anda mudah ditinjau dan tidak merusak bagian lain.

---

## Sebelum mulai

1. Baca [ARCHITECTURE.md](ARCHITECTURE.md) — terutama model data dan alur upload.
2. Jalankan proyek secara lokal sesuai [SETUP.md](SETUP.md).
3. Lihat [ROADMAP.md](ROADMAP.md) untuk pekerjaan yang paling dibutuhkan.

---

## Alur kerja

```bash
git checkout -b feat/nama-fitur
# ... kerjakan ...
git commit -m "feat(files): deskripsi singkat"
git push origin feat/nama-fitur
```

Lalu buka Pull Request ke `main`.

**Satu branch, satu tujuan.** Jangan mencampur refactor besar dengan fitur baru;
PR seperti itu sulit ditinjau dan rawan konflik.

### Format pesan commit

```
<tipe>(<area>): <ringkasan dalam bahasa Indonesia>

<penjelasan opsional: apa dan mengapa>
```

Tipe: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
Area: `files`, `auth`, `shares`, `family`, `gdrive`, `deploy`, `readme`.

Contoh:

```
feat(files): tambah pratinjau PDF di file manager
fix(auth): tangani token kedaluwarsa saat fetchMe
```

---

## Pemeriksaan wajib

Jalankan sebelum membuka PR:

```bash
cd backend  && go build ./... && go vet ./... && go test ./...
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

`next build` saja tidak cukup untuk menangkap semua masalah tipe — jalankan
`tsc --noEmit` juga. `npm run lint` menjaga aturan React 19 (`react-hooks`)
yang tidak diperiksa oleh build.

Sertakan di deskripsi PR: **apa** yang berubah, **kenapa**, dan **bagaimana**
Anda mengujinya.

### Test e2e frontend

```bash
cd frontend && npm run test:e2e
```

Suite tanpa backend berjalan di mode standalone. Playwright menyalakan dan
mematikan `npm run start` sendiri di `http://localhost:3000`, jadi jalankan
`npm run build` lebih dulu. Bila sudah ada server yang hidup di port itu
(mis. `npm run dev`), server tersebut dipakai ulang. Bila frontend berjalan di
port lain, set `NAS_E2E_BASE_URL`.

Test yang membutuhkan backend dan akun uji di-skip secara default. Untuk
menjalankannya:

```bash
NAS_E2E_SERVER=1 \
NAS_E2E_EMAIL=akun@uji.local \
NAS_E2E_PASSWORD=rahasia123 \
npm run test:e2e
```

Playwright memakai Chromium yang sudah terpasang di mesin. Bila tidak ada,
jalankan `npx playwright install chromium` atau set `PLAYWRIGHT_CHROMIUM_PATH`
ke executable Chrome/Chromium lain.

### Apa yang dijalankan CI

`.github/workflows/ci.yml` berjalan pada push ke `main` dan Pull Request, tetapi
hanya bila yang berubah salah satu dari: `backend/**`, `frontend/**`, atau
`.github/workflows/**`. Tiga job paralel di runner `ubuntu-24.04`:

| Job | Isi |
|---|---|
| `Backend (Go)` | `go vet ./...`, cek `gofmt -l`, `go build ./...`, lalu `go test ./...` |
| `Frontend (Next.js)` | `npm run lint`, `tsc --noEmit`, lalu `npm run build` |
| `E2E (Playwright)` | `npm run build` lalu `e2e/smoke.spec.ts` di Chromium |

Suite e2e lain (`nas-mode`, `offline-upload`, `public-share`) tidak dijalankan
di CI karena butuh backend hidup dan akun uji.

**PR yang hanya mengubah dokumentasi tidak memicu CI sama sekali**, jadi
tab Checks-nya akan kosong dan tertulis "no checks reported" — itu wajar, bukan
tanda CI rusak. Daftar pemicunya sengaja berupa whitelist: kalau suatu saat ada
direktori kode baru di root, tambahkan ke `paths` di `ci.yml` atau CI-nya tidak
akan pernah jalan untuk perubahan di sana.

Setiap job diberi `timeout-minutes: 15` supaya proses yang menggantung tidak
memakan kuota bawaan GitHub (360 menit).

Backend dijaga `go vet` dan `gofmt -l` selain build dan test. Sebelum commit,
jalankan `gofmt -w .` di folder `backend` bila ada berkas yang belum rapi.

Catatan untuk pengguna Windows: `.gitattributes` memaksa semua berkas teks
memakai LF, baik di Git maupun di working tree, jadi `gofmt -l` tidak lagi
menandai berkas yang sebenarnya rapi. Berkas yang sudah terlanjur di-checkout
dengan CRLF sebelum `.gitattributes` ada perlu ditulis ulang sekali:

```bash
git checkout-index -a -f
```

---

## Aturan teknis

### Jangan mengedit kode hasil generate

`backend/internal/db/*.go` dihasilkan oleh sqlc. Untuk mengubah query:

```bash
# 1. edit backend/db/queries/*.sql
# 2. regenerate
cd backend && sqlc generate
```

### Migrasi

- Tambahkan file baru `migrations/000002_*.up.sql` (dan `.down.sql`).
- **Jangan** mengubah migrasi yang sudah pernah dijalankan di server mana pun.

### Keamanan endpoint

- Setiap endpoint baru yang menyentuh data pengguna wajib lewat
  `auth.AuthMiddleware` dan memfilter `owner_id`.
- Endpoint administratif (Google Drive, undangan) wajib lewat
  `auth.AdminKeyMiddleware`.
- Jangan pernah membentuk path disk dari input pengguna. Gunakan
  `StorageProvider`.
- Jangan mengembalikan pesan error internal mentah ke klien; petakan ke kode
  error yang sudah ada.

### Gaya kode

- **Go:** `gofmt`, error ditangani eksplisit, komentar bahasa Indonesia untuk
  bagian yang tidak jelas dari kodenya sendiri.
- **TypeScript:** strict mode, tanpa `any` bila bisa dihindari, komponen
  fungsional.
- **Dependensi baru:** hindari bila stdlib atau fitur platform sudah cukup.
  Jelaskan alasannya di PR.

### Dependensi dengan advisory terbuka

`npm audit` di `frontend/` masih melaporkan 2 temuan **high** dari `zod` < 4.6.6
(GHSA-mrhx-c7xc-m3w5: habisnya memori saat memvalidasi koleksi berbatas yang
sangat besar). Sumbernya `@imgly/background-removal`, yang mencantumkan
`zod: ^3.23.8`; versi terbarunya (1.7.0) belum naik dan zod tidak merilis patch
untuk jalur 3.x.

**Jangan "perbaiki" dengan `overrides`.** Sudah dicoba dan gagal: paket itu
mengekspor `Config` lewat `dist/src/schema.d.ts` yang memakai nama tipe zod 3
(`z.ZodEffects`, `z.ZodDefault`, `z.ZodObject`). Dengan zod 4 tipe itu tidak
resolve, `Config` jatuh menjadi `any`, dan `model`, `device`, serta
`output.format` tidak diperiksa lagi — sementara `progress` kehilangan tipe
parameternya. Diuji dua arah: dengan zod 3 ketiga nilai salah ditolak `tsc`,
dengan zod 4 semuanya lolos.

Risiko ini diterima karena dua hal:

1. Zod **ikut ter-bundel** ke `dist/index.mjs` dan `dist/index.cjs` library
   (3.24.2 di-inline, 0 `import`/`require` eksternal). Menghapus salinan di
   `node_modules` hanya menghilangkan laporan audit; kode yang benar-benar
   jalan di peramban tidak berubah.
2. `ConfigSchema` tidak memakai batas koleksi dan hanya memvalidasi objek
   konfigurasi yang aplikasi kirim sendiri lewat `removeImageBackground()`,
   bukan input pengguna. Jalur yang disorot advisory tidak tercapai.

Tinjau ulang saat `@imgly/background-removal` naik ke zod 4 — waktu itu override
tidak lagi diperlukan dan tipe `Config` kembali berfungsi.

8 temuan **moderate** yang tersisa berasal dari `minimatch` lewat
`eslint-config-next`. Perbaikannya butuh downgrade breaking
(`eslint-config-next` → 15.5.29), jadi juga sengaja tidak disentuh.

### Frontend

`frontend/src/app/page.tsx` masih berupa satu berkas besar. Saat menyentuhnya:

- Ekstrak satu komponen per perubahan, jangan refactor menyeluruh sekaligus.
- Jalankan `npx tsc --noEmit` setelah setiap ekstraksi.

---

## Yang paling dibutuhkan

1. **Memecah `page.tsx`** menjadi komponen.

---

## Melaporkan masalah

Sertakan:

- langkah reproduksi
- hasil yang diharapkan vs yang terjadi
- versi Go/Node/PostgreSQL
- potongan log backend bila ada

Untuk masalah keamanan, jangan buka issue publik — hubungi maintainer langsung.
