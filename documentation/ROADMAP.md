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
| **Thumbnail** | Pratinjau JPEG 320/960 px dibuat server, di-cache per sha256, dipakai galeri dan grid berkas |
| **PWA offline** | Service worker menyimpan shell aplikasi + halaman `/offline`, profil terakhir di-cache, banner status jaringan, dan antrean upload offline di IndexedDB yang terkirim otomatis saat online |
| **Migrasi otomatis** | Runner di backend menerapkan `migrations/*.up.sql` saat start, mencatat di `schema_migrations`, baseline untuk DB lama |
| **Deduplikasi** | SHA-256 per objek; berkas identik tidak menambah pemakaian disk |
| **Share link** | Token acak, password opsional, masa berlaku, halaman publik yang mengunduh dari server; folder bisa diunduh sebagai zip streaming |
| **Keluarga** | Undangan dengan token ter-hash, status undangan, penerima membuat akun nyata |
| **Google Drive** | OAuth 2.0, refresh token di server, kuota, jelajah folder, unggah, unduh lewat server |
| **Hardening** | CORS whitelist, admin key, batas ukuran unggah, MIME dari isi berkas, validasi folder induk |
| **Deploy** | Dockerfile multi-stage, docker-compose, unit systemd, konfigurasi Nginx |

---

## Berikutnya

### 1. Memecah state `page.tsx` menjadi hook

`page.tsx` sudah turun dari 4257 ke ~1510 baris setelah seluruh tab, sidebar,
header, dan modal diekstrak ke `src/components/*`. Sisa isinya adalah state,
efek, dan handler yang menyambungkan komponen-komponen tersebut. Langkah
berikutnya memindahkan kelompok state ke custom hook
(`useNasFiles`, `useTrash`, `useShares`, `useStudio`) supaya container hanya
mengurus komposisi.

---

## Ide jangka panjang

- Aplikasi pendamping untuk sinkronisasi otomatis kamera
- Transkode video di server (thumbnail gambar sudah ada)
- Dukungan penyimpanan sekunder (S3-compatible)
- Pencarian isi dokumen
- Pemrosesan gambar di server (resize, konversi) selain yang sudah ada di browser

---

## Tidak direncanakan

- Layanan cloud berbayar wajib — proyek ini dirancang agar biaya infrastruktur
  bisa nol
- Microservice atau message queue — satu proses Go cukup untuk skala rumah
  tangga
