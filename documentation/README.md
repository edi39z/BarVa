# Dokumentasi Barva

Dokumentasi publik untuk Barva — private NAS dan cloud keluarga yang
berjalan di server sendiri.

| Dokumen | Isi |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Cara sistem bekerja: dual-mode, komponen, model data, alur request |
| [UI.md](UI.md) | Sistem desain: token warna, mode terang/gelap, navigasi, aksesibilitas |
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
pindah, hapus, unduh, pratinjau), Trash dengan pemulihan, Google Drive OAuth,
undangan keluarga, share link dengan password dan masa berlaku, streaming video,
serta PWA offline (service worker, halaman `/offline`, antrean unggah).

Belum: RBAC per berkas (saat ini baru per peran) dan unduh folder sebagai zip.
Pemecahan state `page.tsx` menjadi custom hook masih berjalan. Detail di
[ROADMAP.md](ROADMAP.md).

## Mulai cepat

```bash
createdb nas_db

cd backend  && go run ./cmd/server     # :8080
cd frontend && npm install && npm run dev   # :3000
```

Skema tidak perlu diimpor manual — backend menerapkan `migrations/` saat start.
Panduan lengkap di [SETUP.md](SETUP.md).
