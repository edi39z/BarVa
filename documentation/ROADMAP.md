# Roadmap

Status per **11 November 2026**. Urutan di bawah mencerminkan prioritas, bukan
janji tanggal.

---

## Sudah selesai

| Area | Cakupan |
|---|---|
| **Fondasi** | Skema PostgreSQL, Content-Addressable Storage, abstraksi `StorageProvider`, streaming HTTP Range |
| **Autentikasi** | Register, login, logout, sesi, Argon2id, rate limit login, user pertama menjadi owner |
| **File manager** | Daftar, navigasi folder, unggah, buat folder, ganti nama, pindah, hapus, unduh, pratinjau gambar/video |
| **Trash** | Daftar item terhapus, pulihkan ke folder asal, hapus permanen dengan pembersihan objek CAS yang tidak terpakai |
| **RBAC** | `member` hanya berkasnya sendiri; `owner`/`admin` menjangkau semua berkas. Pindah lintas pemilik dan pembuatan node di pohon orang lain ditolak |
| **Thumbnail** | Pratinjau JPEG 320/960 px dibuat server, di-cache per sha256, dipakai galeri dan grid berkas |
| **PWA offline** | Service worker menyimpan shell aplikasi + halaman `/offline`, profil terakhir di-cache, banner status jaringan, dan antrean upload offline di IndexedDB yang terkirim otomatis saat online |
| **Migrasi otomatis** | Runner di backend menerapkan `migrations/*.up.sql` saat start, mencatat di `schema_migrations`, baseline untuk DB lama |
| **Deduplikasi** | SHA-256 per objek; berkas identik tidak menambah pemakaian disk |
| **Share link** | Token acak, password opsional, masa berlaku, halaman publik yang mengunduh dari server; folder bisa diunduh sebagai zip streaming |
| **Pencarian isi** | Ekstraksi teks PDF/DOCX/teks biasa di server (`internal/textextract`), indeks `file_texts` + GIN `pg_trgm`, endpoint `GET /search` lintas folder dengan snippet dan folder asal (min. 3 karakter), backfill 15 menit untuk berkas lama, serta indeks teks IndexedDB untuk mode standalone |
| **Keluarga** | Undangan dengan token ter-hash, status undangan, penerima membuat akun nyata dengan role & kuota dari undangan |
| **Kuota** | `users.quota_bytes` ditegakkan saat upload (`413 QUOTA_EXCEEDED`), dihitung per objek unik, dedup tidak dihitung dua kali; pemakaian tampil di sidebar; owner/admin dapat mengubah kuota anggota dari Family Hub (`PATCH /family/members/:id/quota`) dengan penjagaan `409 QUOTA_BELOW_USAGE`; rincian per jenis berkas dan per folder tersedia di modal pengaturan akun (`GET /auth/me/usage`) |
| **Google Drive** | OAuth 2.0, refresh token di server, kuota, jelajah folder, unggah, unduh lewat server |
| **Hardening** | CORS whitelist, admin key wajib di mode release, batas ukuran unggah, MIME dari isi berkas, validasi folder induk, rate limit login & password share |
| **Deploy** | Dockerfile multi-stage, docker-compose, unit systemd, konfigurasi Nginx |
| **Struktur frontend** | Seluruh tab, sidebar, header, dan modal ada di `src/components/*`; kelompok state besar di `src/hooks/*` (`useNasSession`, `useNasFiles`, `useTrash`, `useShares`, `useStudio`, `useUploads`, `useFamily`, `useBulkActions`, `useContentSearch`, `useFileSelection`) sehingga `page.tsx` tinggal komposisi (±1.000 baris) |

---

## Berikutnya

### 1. Penyimpanan sekunder (S3-compatible)

Disk lokal adalah satu-satunya `StorageProvider`. Menambah backend S3-compatible
memungkinkan objek CAS dipindah atau dicadangkan ke bucket tanpa mengubah
handler.

---

## Ide jangka panjang

- Aplikasi pendamping untuk sinkronisasi otomatis kamera
- Transkode video di server (thumbnail gambar sudah ada)
- Dukungan penyimpanan sekunder (S3-compatible)
- Pemrosesan gambar di server (resize, konversi) selain yang sudah ada di browser

---

## Tidak direncanakan

- Layanan cloud berbayar wajib — proyek ini dirancang agar biaya infrastruktur
  bisa nol
- Microservice atau message queue — satu proses Go cukup untuk skala rumah
  tangga
