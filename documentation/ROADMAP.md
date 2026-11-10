# Roadmap

Status per **10 November 2026**. Urutan di bawah mencerminkan prioritas, bukan
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
| **PWA offline** | Service worker menyimpan shell aplikasi + halaman `/offline`, profil terakhir di-cache, banner status jaringan |
| **Migrasi otomatis** | Runner di backend menerapkan `migrations/*.up.sql` saat start, mencatat di `schema_migrations`, baseline untuk DB lama |
| **Deduplikasi** | SHA-256 per objek; berkas identik tidak menambah pemakaian disk |
| **Share link** | Token acak, password opsional, masa berlaku, halaman publik yang mengunduh dari server; folder bisa diunduh sebagai zip streaming |
| **Keluarga** | Undangan dengan token ter-hash, status undangan, penerima membuat akun nyata |
| **Google Drive** | OAuth 2.0, refresh token di server, kuota, jelajah folder, unggah, unduh lewat server |
| **Hardening** | CORS whitelist, admin key, batas ukuran unggah, MIME dari isi berkas, validasi folder induk |
| **Deploy** | Dockerfile multi-stage, docker-compose, unit systemd, konfigurasi Nginx |

---

## Berikutnya

### 1. Memecah `page.tsx`

Berkas utama frontend masih monolit. Rencana: pecah menjadi komponen per tab
(`FileManager`, `Gallery`, `Studio`, `Family`, `Dashboard`) dengan state yang
jelas.

---

## Ide jangka panjang

- Aplikasi pendamping untuk sinkronisasi otomatis kamera
- Thumbnail dan transkode video di server
- Dukungan penyimpanan sekunder (S3-compatible)
- Pencarian isi dokumen
- Pemrosesan gambar di server (resize, konversi) selain yang sudah ada di browser

---

## Tidak direncanakan

- Layanan cloud berbayar wajib — proyek ini dirancang agar biaya infrastruktur
  bisa nol
- Microservice atau message queue — satu proses Go cukup untuk skala rumah
  tangga
