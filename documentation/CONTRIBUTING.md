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
cd backend  && go build ./... && go test ./...
cd frontend && npx tsc --noEmit && npm run build
```

`next build` saja tidak cukup untuk menangkap semua masalah tipe — jalankan
`tsc --noEmit` juga.

Sertakan di deskripsi PR: **apa** yang berubah, **kenapa**, dan **bagaimana**
Anda mengujinya.

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

### Frontend

`frontend/src/app/page.tsx` masih berupa satu berkas besar. Saat menyentuhnya:

- Ekstrak satu komponen per perubahan, jangan refactor menyeluruh sekaligus.
- Jalankan `npx tsc --noEmit` setelah setiap ekstraksi.

---

## Yang paling dibutuhkan

1. **Unduh folder sebagai zip** pada share link.
2. **Memecah `page.tsx`** menjadi komponen.

---

## Melaporkan masalah

Sertakan:

- langkah reproduksi
- hasil yang diharapkan vs yang terjadi
- versi Go/Node/PostgreSQL
- potongan log backend bila ada

Untuk masalah keamanan, jangan buka issue publik — hubungi maintainer langsung.
