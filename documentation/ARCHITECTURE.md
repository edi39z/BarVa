# Arsitektur

Dokumen ini menjelaskan bagaimana NAS Project disusun dan mengapa keputusan
tertentu diambil. Untuk perintah menjalankan, lihat [SETUP.md](SETUP.md).

---

## 1. Gambaran besar

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  Next.js PWA (App Router, React 19)                          │
│  ├── Mode Standalone  ──►  IndexedDB (idb)                   │
│  └── Mode Private NAS ──►  fetch ke backend Go               │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTP (localhost / LAN / Tailscale)
┌───────────────────────────────▼──────────────────────────────┐
│  Backend Go (Gin)                                            │
│  ├── internal/auth      sesi, Argon2id, admin key            │
│  ├── internal/handler   auth, files, shares, family, gdrive  │
│  ├── internal/storage   penyimpanan objek (CAS)              │
│  ├── internal/store     persistensi JSON atomik              │
│  └── internal/db        query typed hasil generate sqlc      │
└───────────────┬──────────────────────────┬───────────────────┘
                │                          │
        ┌───────▼────────┐        ┌────────▼─────────┐
        │  PostgreSQL 17 │        │  Disk server     │
        │  metadata      │        │  data/storage/   │
        └────────────────┘        └──────────────────┘
```

Prinsip yang dipegang:

1. **Database hanya menyimpan metadata.** Tidak ada BLOB di PostgreSQL.
2. **Frontend memilih sumber data, bukan menduplikasi logika.** Mode standalone
   dan NAS memakai komponen UI yang sama; yang berbeda hanya penyedia datanya.
3. **Backend tidak menyimpan token Google di browser.** Access token dan refresh
   token hanya hidup di server.
4. **Semua operasi berkas difilter `owner_id`.** Tidak ada endpoint yang
   mengembalikan berkas milik pengguna lain.

---

## 2. Model data

Lima tabel di `migrations/000001_init_schema.up.sql`.

```
users
  id, email (unik), username (unik), password_hash, role, created_at, updated_at
        │
        ├──< sessions      id, user_id, token_hash (unik), user_agent, client_ip,
        │                  expires_at, created_at
        │
        └──< file_nodes    id, owner_id, parent_id (self-ref), name, is_directory,
                           object_id, deleted_at, created_at, updated_at
                                  │
                                  └──► file_objects
                                         id, sha256 (unik), storage_path,
                                         size_bytes, mime_type, created_at
                                  │
                                  └──< shares
                                         id, node_id, created_by, share_token_hash,
                                         password_hash, permission, expires_at,
                                         created_at
```

Poin penting:

- **`file_nodes` adalah pohon virtual.** `parent_id` menunjuk ke folder induk;
  `NULL` berarti akar. Satu baris = satu nama yang terlihat pengguna.
- **`file_objects` adalah konten fisik.** Satu objek bisa dirujuk banyak node
  (deduplikasi). `sha256` unik.
- **`deleted_at` adalah soft delete.** Semua query publik menambahkan
  `deleted_at IS NULL`.
- **Nama unik per folder** dijaga unique index parsial
  `(owner_id, COALESCE(parent_id, ...), name) WHERE deleted_at IS NULL`.
  Karena itu upload, rename, dan move bisa mengembalikan `409 CONFLICT`.
- **`shares` menyimpan hash token**, bukan token asli. Token asli hanya
  dikembalikan sekali saat pembuatan.

---

## 3. Penyimpanan objek (Content-Addressable Storage)

```
data/storage/
├── objects/
│   ├── 3f/
│   │   └── 3f7a9c...  (nama file = sha256 penuh)
│   └── a1/
│       └── a10b4e...
└── tmp/               (berkas sementara saat upload)
```

- Nama objek adalah **SHA-256 dari isi berkas**, bukan nama kiriman pengguna.
  Ini sekaligus mencegah path traversal: tidak ada bagian path yang berasal
  dari input pengguna.
- Penulisan dilakukan ke `tmp/` lalu dipindahkan secara atomik, sehingga tidak
  ada objek setengah jadi bila koneksi terputus.
- `StorageProvider` (`internal/storage/storage.go`) adalah antarmuka:
  `Put`, `Get`, `Delete`, `Exists`, `Stat`, `GetPhysicalPath`. Implementasi saat
  ini hanya `LocalStorage`; antarmuka ada agar backend lain bisa ditambah tanpa
  mengubah handler.

---

## 4. Alur utama

### 4.1 Registrasi & login

```
POST /auth/register
  └─ Argon2id(password) → users
     └─ jika tabel users kosong → role = "owner", selain itu "member"

POST /auth/login
  └─ rate limit (5 gagal / 15 menit per IP+username)
     └─ verifikasi Argon2id
        └─ buat token acak → simpan SHA-256(token) di sessions
           └─ kembalikan token ke klien
```

Token dikirim kembali sebagai `Authorization: Bearer <token>`. `AuthMiddleware`
menerima tiga sumber, berurutan: header, cookie `nas_session`, lalu query
`?token=` (dipakai `<img>` dan `<video>` yang tidak bisa mengirim header).

### 4.2 Upload

```
POST /files/upload (multipart)
  1. Body dibatasi MAX_UPLOAD_BYTES (http.MaxBytesReader)
  2. Alirkan ke data/tmp sambil menghitung SHA-256 (tanpa menahan di RAM)
  3. storage.Put(hash, file) → objek masuk CAS
  4. Deteksi MIME dari 512 byte pertama (http.DetectContentType)
  5. INSERT file_objects (ON CONFLICT sha256 → pakai yang ada)
  6. Validasi parent_id: harus folder milik user
  7. INSERT file_nodes
```

Langkah 5 membuat berkas identik tidak menambah pemakaian disk.

### 4.3 Unduh & streaming

- `GET /files/:id/download` — `Content-Disposition: attachment`, dikirim lewat
  `c.File`.
- `GET /files/:id/stream` — `http.ServeContent` menangani `Range`, sehingga
  pemutar video bisa melakukan scrubbing dengan `206 Partial Content`.

### 4.4 Share link

```
POST /shares {node_id, permission, password?, expires_in?}
  ├─ token = 32 byte acak (hex)
  ├─ simpan SHA-256(token) + Argon2id(password) bila ada
  └─ kembalikan raw_token sekali saja

GET  /public/share/:token          → metadata (nama, ukuran, has_password)
GET  /public/share/:token/download → verifikasi password, lalu kirim berkas
```

Query `GetShareByTokenHash` sudah memfilter `expires_at > NOW()`, jadi link
kedaluwarsa otomatis tidak ditemukan.

### 4.5 Undangan keluarga

Undangan disimpan di `data/invites.json` (bukan PostgreSQL) karena harus tetap
bisa dibuat walau database belum siap. Isinya: hash token, nama, email, role,
kuota, status (`pending`/`accepted`/`revoked`), dan masa berlaku.

Penerima membuka `/invite/:token`, melihat ringkasan undangan, lalu mengisi
username dan password. Alur di klien:

```
register (email dari undangan) → login → accept
```

Dengan begitu penerima benar-benar punya akun dan bisa masuk.

### 4.6 Google Drive

```
POST /gdrive/client   → simpan client_id + client_secret ke data/gdrive.json
GET  /gdrive/auth-url → URL consent (scope auth/drive, access_type=offline)
GET  /gdrive/callback → tukar code → simpan refresh_token
GET  /gdrive/quota    → proxy ke Drive API
GET  /gdrive/files    → proxy listing
```

Access token diperbarui otomatis oleh server. Browser tidak pernah menerima
token Google.

---

## 5. Batasan otorisasi

Saat ini otorisasi berkas berbasis **kepemilikan** (`file_nodes.owner_id`),
bukan peran. Kolom `role` (`owner`/`admin`/`member`) sudah ada tetapi belum
dipakai untuk membatasi akses berkas. Ini tercatat di [ROADMAP.md](ROADMAP.md)
sebagai pekerjaan berikutnya.

---

## 6. Keputusan teknis yang perlu diketahui

| Keputusan | Alasan |
|---|---|
| sqlc, bukan ORM | Query tetap SQL, tipe dijamin compiler. `internal/db/*.go` adalah hasil generate — ubah `db/queries/*.sql` lalu `sqlc generate` |
| UUID sebagai PK | Aman dibuat di klien/server tanpa urutan yang bisa ditebak |
| Argon2id | Standar password hashing modern, tahan GPU |
| Hash untuk token | Bocornya database tidak langsung memberi sesi atau link aktif |
| CAS + SHA-256 | Deduplikasi alami, integritas isi bisa diverifikasi |
| Soft delete | Menghindari kehilangan data karena salah hapus; membuka jalan ke Trash |
| Metadata JSON untuk Drive & undangan | Keduanya harus hidup walau PostgreSQL mati |
