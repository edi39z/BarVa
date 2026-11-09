# Dokumentasi NAS Project

Dokumentasi publik untuk NAS Project — private NAS dan cloud keluarga yang
berjalan di server sendiri.

| Dokumen | Isi |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Cara sistem bekerja: dual-mode, komponen, model data, alur request |
| [SETUP.md](SETUP.md) | Menjalankan dari nol: PostgreSQL, backend, frontend, Docker, Google Drive |
| [API.md](API.md) | Referensi endpoint: autentikasi, body, respons, kode error |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Alur kontribusi, standar kode, dan hal yang tidak boleh diubah |
| [ROADMAP.md](ROADMAP.md) | Apa yang sudah selesai dan apa yang direncanakan |

## Ringkasan produk

Dua mode dalam satu aplikasi web:

| | Standalone | Private NAS |
|---|---|---|
| Butuh server | Tidak | Ya |
| Penyimpanan | IndexedDB di browser | Disk server + PostgreSQL |
| Streaming video | Terbatas | HTTP Range penuh |
| Deduplikasi | — | SHA-256 content-addressed |
| Berbagi | — | Undangan keluarga + share link |

Pengguna memilih mode saat pertama membuka aplikasi. Frontend yang dipakai sama.

## Status singkat

Sudah berjalan: autentikasi, file manager lengkap (unggah, folder, ganti nama,
pindah, hapus, unduh, pratinjau), Google Drive OAuth, undangan keluarga,
share link dengan password dan masa berlaku, streaming video.

Belum: RBAC per berkas, service worker/offline, unduh folder sebagai zip,
UI Trash, dan pemecahan komponen frontend. Detail di [ROADMAP.md](ROADMAP.md).

## Mulai cepat

```bash
createdb nas_db
psql -d nas_db -f migrations/000001_init_schema.up.sql

cd backend  && go run ./cmd/server     # :8080
cd frontend && npm install && npm run dev   # :3000
```

Panduan lengkap di [SETUP.md](SETUP.md).
