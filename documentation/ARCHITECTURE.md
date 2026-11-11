# Arsitektur

Dokumen ini menjelaskan bagaimana Barva disusun dan mengapa keputusan
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
4. **Otorisasi berkas berbasis pemilik + role.** `member` hanya menyentuh
   berkasnya sendiri; `owner` dan `admin` boleh membaca dan mengelola berkas
   semua anggota. Aturannya ada di `internal/handler/access.go`.
5. **Efek jaringan menunggu mode dan sesi yang pasti.** `connectionMode` awalnya
   `"nas"` karena gerbang autentikasi yang dirender saat prerender, jadi setiap
   efek yang memanggil server juga wajib memeriksa `currentUser`. Tanpa itu,
   sebelum pengguna memilih mode mandiri ada lima request yang tetap jalan ke
   `localhost:8080` dan gagal — health, dua kali status Drive, undangan, dan
   daftar anggota. Dijaga oleh tes e2e "mode mandiri tanpa backend".

---

## 2. Model data

Lima tabel di `migrations/000001_init_schema.up.sql`, plus kolom
`users.quota_bytes` dari `000002_user_quota.up.sql`.

```
users
  id, email (unik), username (unik), password_hash, role, quota_bytes,
  created_at, updated_at
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
- **`deleted_at` adalah soft delete.** Semua query daftar menambahkan
  `deleted_at IS NULL`; hanya endpoint `/trash` yang membacanya. Hapus
  permanen (`DELETE /trash/:id`) menghapus baris node, lalu membuang objek
  CAS yang tidak lagi dirujuk node lain.
- **Nama unik per folder** dijaga unique index parsial
  `(owner_id, COALESCE(parent_id, ...), name) WHERE deleted_at IS NULL`.
  Karena itu upload, rename, dan move bisa mengembalikan `409 CONFLICT`.
- **`shares` menyimpan hash token**, bukan token asli. Token asli hanya
  dikembalikan sekali saat pembuatan. Pembuatan dan hashing token sesi, share
  link, undangan, dan state OAuth semuanya lewat `internal/auth/token.go`
  (`NewToken`, `NewURLToken`, `HashToken`) — jangan menulis `rand.Read` +
  `sha256` sendiri di handler.
- **`users.quota_bytes` = 0 berarti tanpa batas.** Pemakaian dihitung dari
  `DISTINCT object_id` milik akun, sehingga dedup CAS tidak dihitung dua kali.
  Upload melewati batas ditolak `413 QUOTA_EXCEEDED`; owner/admin dapat
  mengubahnya lewat `PATCH /family/members/:id/quota`, dan kuota baru tidak
  boleh lebih kecil dari pemakaian saat ini (`409 QUOTA_BELOW_USAGE`).

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
  `Put`, `Delete`, `GetPhysicalPath`. Implementasi saat ini hanya
  `LocalStorage`; antarmuka ada agar backend lain bisa ditambah tanpa
  mengubah handler. Pembacaan isi berkas memakai path fisik itu langsung,
  sehingga tidak perlu metode `Get`/`Stat` terpisah.

---

## 4. Alur utama

### 4.1 Registrasi & login

```
POST /auth/register
  └─ Argon2id(password) → users
     ├─ invite_token valid → role & quota_bytes dari undangan
     │                        (role undangan hanya admin/member)
     └─ jika tabel users kosong → role = "owner", quota_bytes = 0

POST /auth/login
  └─ rate limit (5 gagal / 15 menit per IP+email)
     └─ verifikasi Argon2id
        └─ buat token acak → simpan SHA-256(token) di sessions
           └─ kembalikan token ke klien
```

Token dikirim kembali sebagai `Authorization: Bearer <token>`. `AuthMiddleware`
menerima tiga sumber, berurutan: header, cookie `nas_session`, lalu query
`?token=` (dipakai `<img>` dan `<video>` yang tidak bisa mengirim header).

Middleware hanya menolak token yang sudah lewat `expires_at`; barisnya tidak
dihapus. Karena itu backend menjalankan `DeleteExpiredSessions` sekali saat
start lalu setiap 24 jam, supaya tabel `sessions` tidak tumbuh tanpa batas.

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

### 4.7 Thumbnail gambar

Galeri dan grid berkas tidak lagi memuat foto asli. Browser meminta
`GET /files/:id/thumbnail?size=small` (320 px) atau `large` (960 px), dan server
mengirim JPEG kecil.

```
node → cek izin (canAccessNode) → cek MIME image/*
     → cache hit? kirim file <sha256>_<sisi>.jpg
     → cache miss: buka objek CAS → DecodeConfig (tolak > 80 MP)
                   → image.Decode → CatmullRom.Scale → JPEG q=82
                   → tulis cache (tmp + rename) → kirim
```

Keputusan penting:

- Daftar media galeri diambil dari `GET /media`, satu query datar atas seluruh
  pohon berkas (bukan traversal folder satu per satu). Tanpa ini galeri hanya
  menampilkan isi folder yang sedang dibuka, padahal labelnya "media keluarga".
- Cache memakai `sha256` objek, bukan id node. Objek CAS immutable, jadi satu
  pratinjau dipakai ulang oleh semua node yang menunjuk isi sama.
- `ETag` = `<sha256>-<sisi>` dan `Cache-Control: immutable`, sehingga browser
  tidak meminta ulang. `If-None-Match` yang cocok dijawab `304`.
- Transparansi PNG/GIF dikomposit ke latar putih karena keluaran berupa JPEG.
- Decoder: JPEG/PNG/GIF dari stdlib, WebP dari `golang.org/x/image/webp`.
  Format lain (mis. HEIC) dijawab `415 UNSUPPORTED_IMAGE`.
- Video belum punya poster; UI menampilkan ikon play.

---

## 5. Otorisasi berkas

Setiap node punya `owner_id`. Akses ditentukan oleh pemilik node dan role
pemanggil, bukan oleh folder tempat node berada.

| Operasi | `member` | `owner` / `admin` |
|---|---|---|
| Daftar file & trash | hanya miliknya | semua anggota |
| Unduh, stream, ganti nama, hapus, restore, purge | hanya miliknya | semua anggota |
| Buat folder & unggah | hanya di folder miliknya | hanya di folder miliknya |
| Pindah item | hanya di pohon miliknya | hanya di pohon pemilik item |
| Buat share link | hanya untuk berkasnya | hanya untuk berkasnya |
| `GET /family/members` | hanya dirinya | semua anggota |

Aturan yang perlu diingat:

- **Node baru selalu milik pembuatnya.** Admin yang mengunggah ke folder
  anggota lain akan menghasilkan pohon campur pemilik yang tidak terlihat oleh
  pemilik folder, jadi operasi itu ditolak.
- **Pindah lintas pemilik ditolak** (`400 INVALID_PARENT`) dengan alasan yang
  sama: item akan hilang dari pandangan pemiliknya.
- **Share link tetap milik pemilik berkas.** Admin bisa mengelola berkas
  anggota, tetapi tidak bisa membuat link berbagi atas namanya.
- Pemeriksaan dilakukan setelah node dimuat, sehingga 404 (tidak ada) bisa
  dibedakan dari 403 (ada, tapi bukan hak pemanggil).

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
| Service worker tanpa library | Tidak menambah dependensi; strategi cache ditulis manual di `public/sw.js` |

---

## 7. PWA & mode offline

Service worker ada di `frontend/public/sw.js` dan didaftarkan oleh
`ServiceWorkerRegistrar` hanya pada build produksi. Di mode dev, cache service
worker akan menyajikan bundel lama, jadi registrasi sengaja dimatikan.

Strategi cache:

| Jenis request | Strategi | Alasan |
|---|---|---|
| Navigasi (`request.mode === "navigate"`) | network-first, fallback cache `/` lalu `/offline` | Selalu dapat versi terbaru saat online, tetap bisa dibuka saat offline |
| `/_next/static/*` dan aset statis | stale-while-revalidate | Nama berkas ber-hash, aman disajikan dari cache |
| Request ke origin lain (backend NAS, Google) | tidak disentuh | Data pengguna dan token tidak boleh tersimpan di cache browser |
| `/api/*` same-origin | tidak disentuh | Tidak ada API same-origin; jaga-jaga bila nanti ada |

Yang di-precache saat install: `/`, `/offline`, `/manifest.json`, dan kedua
ikon. HTML hanya di-cache untuk path `/` supaya halaman bertoken (`/s/...`,
`/invite/...`) tidak ikut tersimpan.

Saat offline, `fetchMe()` gagal dan aplikasi memakai profil terakhir dari
`localStorage` (`nas_auth_user`). Profil itu hanya berisi id, email, username,
dan role — bukan kredensial. Tanpa fallback ini, membuka ulang aplikasi offline
akan berakhir di layar login yang tidak bisa dipakai.

Naikkan `CACHE_VERSION` di `sw.js` bila strategi cache berubah; cache lama
dihapus pada tahap `activate`.

### 7.1 Antrean upload offline

Upload yang gagal karena tidak ada koneksi tidak dibuang. Berkas disimpan utuh
sebagai `Blob` di IndexedDB (`nas_local_storage`, object store `upload_queue`,
skema versi 2) lalu dikirim ulang otomatis ketika koneksi kembali.

| Tahap | Fungsi | Perilaku |
|---|---|---|
| Masuk antrean | `enqueueUpload()` (`lib/storage/indexeddb.ts`) | Dipanggil dari `handleRealFileUpload` bila `navigator.onLine === false` atau error jaringan |
| Kirim ulang | `flushUploadQueue()` (`lib/uploadQueue.ts`) | Iterasi antrean; sukses → hapus item; gagal → simpan `lastError` dan hentikan loop bila offline/401 |
| Pemicu | `useEffect` di `page.tsx` | Saat mount, saat event `online`, dan tombol "Unggah sekarang" pada banner |

Detail penting:

- Item antrean menyimpan `parentId` asal, jadi berkas kembali ke folder tempat
  ia diunggah meskipun pengguna sudah berpindah folder.
- Loop berhenti pada kegagalan sesi (`401`/pesan "sesi berakhir") supaya tidak
  menandai seluruh antrean gagal berulang kali.
- `flushUploadQueue` mengembalikan `{uploaded, failed, pending}`; UI memakai
  `pending` untuk banner dan menyegarkan daftar berkas bila `uploaded > 0`.
- Antrean tidak dihapus saat logout. Ini disengaja: berkas milik pengguna tetap
  ada di perangkat dan akan dikirim setelah login lagi.

---

## 8. Struktur frontend

`src/app/page.tsx` adalah container: ia memegang state, efek, dan handler, lalu
menyusun komponen. Semua tampilan besar sudah dipisah ke `src/components/`.
Kelompok state yang berdiri sendiri dipindah ke `src/hooks/` supaya container
tinggal menyusun:

| Hook | Tanggung jawab |
|---|---|
| `useNasSession` | Mode koneksi, URL/admin key, pengguna yang masuk, kesehatan server, status jaringan, status Google Drive |
| `useNasFiles` | Daftar berkas folder aktif, media galeri, navigasi folder (breadcrumb, masuk, kembali) |
| `useFamily` | Anggota keluarga, undangan (buat/cabut), perubahan kuota, formulir tambah anggota |
| `useTrash` | Daftar item terhapus, pemulihan (memanggil ulang daftar folder), hapus permanen |
| `useShares` | Modal link berbagi, opsi masa berlaku/password/izin, daftar link aktif |
| `useStudio` | Alat Studio aktif, status proses, hasil kompresi/AI, pemilih berkas, penyimpanan hasil olahan |
| `useUploads` | Unggahan dua mode, progres, nama berkas yang sedang diunggah, antrean offline (jumlah dan pengiriman ulang) |
| `useFileSelection` | Seleksi banyak item, rentang Shift+klik |
| `useLongPress` | Tekan lama untuk menyalakan mode pilih |

| Komponen | Tanggung jawab |
|---|---|
| `Sidebar` | Indikator mode/server, navigasi tab, penghitung item, ringkasan penyimpanan, kartu pengguna, logout |
| `WorkspaceHeader` | Pencarian, aksi unggah/folder baru, banner offline dan progres unggah |
| `HomeDashboard` | Hero, pintasan kategori, memori, aksi cepat, berkas terbaru, ringkasan penyimpanan, feed status |
| `FileExplorerTab` | Breadcrumb, daftar folder, grid/list berkas, aksi per item, menu klik kanan/long-press, mode pilih, banner antrean offline |
| `TrashTab` | Tabel item terhapus, pulihkan, hapus permanen |
| `GalleryTab` | Filter kategori, grid media, menu aksi, dan mode pilih |
| `FileActionMenu` | Popover aksi di desktop dan bottom sheet di layar sentuh |
| `FileSelectionBar` | Bar melayang untuk aksi banyak item saat mode pilih aktif |
| `SmartFolderModal` | Pratinjau pengelompokan otomatis per tipe atau per bulan |
| `StudioTab` | Delapan alat client-side (hapus latar, naikkan kualitas, kompres, pasfoto, foto→PDF, gabung PDF, PDF→Word, editor PDF) |
| `FamilySharingTab` | Anggota, undangan pending, tautan publik, akses jarak jauh |
| `MediaLightbox` | Pratinjau media dan metadata |
| `ShareLinkModal`, `MoveItemModal` | Pembuatan link berbagi dan pemindahan item |
| `ServerSettingsModal`, `AddMemberModal`, `StoragePickerModal` | Konfigurasi server, undangan anggota, pemilih berkas untuk Studio |

Aturan yang dipegang:

- Komponen tab **tidak** memanggil API sendiri; semua data dan aksi masuk lewat
  props. Ini menjaga container sebagai satu-satunya pemilik state.
- Tipe bersama (`DisplayItem`, `FamilyMember`, `ActiveShare`, `formatBytes`,
  `nasNodeToDisplay`) ada di `lib/nasDisplay.ts`, bukan di `page.tsx`.
- Tipe domain lintas komponen (`AppTab`, `StudioTool`, `ConnectionMode`) ada di
  `lib/types.ts`; komponen tidak mengimpor tipe dari komponen lain.
- `StudioToolId` ada di `lib/studio/tools.ts` dan dipakai `StudioTab`,
  `StoragePickerModal`, serta `page.tsx` — menambah alat baru cukup diubah di
  satu tempat itu.

### 8.1 Menu aksi berkas

Berkas dan media di galeri memakai satu menu aksi yang sama:

- **Pemicu menu:** klik kanan (desktop) atau tombol ⋮. Klik sekali tetap membuka
  pratinjau. Saat mode pilih aktif, klik menandai item.
- **Pemicu seleksi:** tekan lama 450 ms — jari, pena, atau tahan klik kiri mouse —
  langsung menyalakan mode pilih dan menandai item itu, sama seperti galeri
  ponsel. Menekan lama item yang sudah terpilih tidak mengubah apa pun; untuk
  membatalkan pilihan ketuk sekali.
- **Definisi aksi:** `lib/files/actions.ts` — `actionsForItem` untuk satu item dan
  `actionsForSelection` untuk banyak item. Aksi tipe-spesifik hanya muncul bila
  semua item sejenis dan tidak ada folder di pilihan.
- **Seleksi:** `hooks/useFileSelection.ts` menyimpan `selectedIds`, `anchorId`,
  dan `mode`; Shift+klik memilih rentang, Ctrl/Cmd+klik menandai tanpa membuka.
- **Tekan lama:** `hooks/useLongPress.ts` membatalkan timer bila penunjuk bergerak
  lebih dari 10 px, mengabaikan klik selain tombol kiri, dan mengabaikan pointer
  yang dimulai dari kontrol di dalam kartu (tombol ⋮, kotak pilih, favorit).
  Setelah terpicu, klik berikutnya ditekan agar item tidak ikut terbuka. Aksi
  yang dijalankan adalah menandai item, bukan membuka menu.
- **Berkas NAS:** `lib/files/materialize.ts` mengunduh isi berkas lewat
  `getDownloadUrl` dengan batas 200 MB (`MAX_PROCESS_BYTES`). Hasil olahan
  diunggah balik ke folder asal memakai `uploadWithUniqueName` yang menambah
  akhiran ` (2)`, ` (3)`, … bila nama bentrok.
- **Hasil:** mode NAS diunggah ke server; mode standalone disimpan ke IndexedDB
  lewat `persistStudioOutput`. Aksi tunggal tetap mengunduh hasilnya, aksi banyak
  tidak (hanya menyimpan dan menampilkan ringkasan).
- **Smart foldering:** `groupItems` mengelompokkan per tipe (Foto, Video, PDF,
  Dokumen, Arsip) atau per bulan dari `updatedAtISO`. Folder dengan nama sama di
  lokasi tujuan dipakai ulang, bukan dibuat ganda.

### 8.2 Modul Studio

| Berkas | Isi |
|---|---|
| `lib/studio/pdf.ts` | `imagesToPDF`, `mergePDFs` (pdf-lib) |
| `lib/studio/pdfjs.ts` | `openPdf` — pemuatan pdf.js, worker, dan galat kata sandi |
| `lib/studio/pdfToWord.ts` | `pdfToWord` — ekstraksi teks per halaman lalu penyusunan `.docx` |
| `lib/studio/pdfEditor.ts` | `readPdfSource`, `buildEditedPdf` — model halaman dan penyusunan ulang PDF |
| `lib/studio/image.ts` | `compressAndResizeImage` (Canvas 2D) |
| `lib/studio/idphoto.ts` | Ukuran resmi pasfoto, warna latar, `composeIdPhoto` |
| `lib/studio/ai.ts` | `removeImageBackground` (ONNX di peramban), `enhancePhoto` (Canvas 2D) |
| `lib/studio/output.ts` | `StudioOutput`, `downloadBlob`, `persistStudioOutput` — satu jalur simpan + unduh |
| `lib/studio/errors.ts` | `StudioError` + `describeStudioError` — pemetaan galat ke pesan yang bisa ditindaklanjuti |
| `lib/studio/tools.ts` | `StudioToolId`, pengelompokan alat (foto/PDF), dan `PANEL_TOOLS` |
| `components/studio/` | Panel alat beropsi: `IdPhotoPanel`, `PdfToWordPanel`, `PdfEditorPanel`, `StudioAlert`, `StudioProgress` |

**Hapus Latar Belakang.** Satu alur untuk foto maupun logo, memakai
`@imgly/background-removal` dengan model `isnet_fp16` (±80 MB) dan
`device: "gpu"` — WebGPU dipakai bila tersedia, dengan fallback otomatis ke
WASM. Model diunduh dari CDN IMG.LY pada pemakaian pertama lalu disimpan di
cache peramban; gambar sendiri tidak pernah keluar dari perangkat.

Setelah model menghasilkan mask, `refineAlpha` merapikannya:

- sisa warna latar dibersihkan hanya di area dekat tepi (radius 3 px) memakai
  warna yang diambil dari cincin piksel terluar gambar asli, sehingga warna
  objek di bagian dalam tidak ikut terhapus;
- bayangan abu-abu netral di tepi objek dapat dibuang lewat opsi terpisah;
- alpha direntangkan supaya tepi lebih tegas, dihaluskan 1 px, lalu bintik
  kecil yang terpisah dihapus.

Kekuatan pembersihan diatur slider 0–50 (0 = nonaktif) dan ditampilkan sebagai
label awam: Nonaktif, Ringan, Sedang, Kuat, Maksimal. Karena unduhan model
besar, UI menampilkan kartu izin lebih dulu dan baru mengaktifkan pemilih berkas
setelah pengguna menyetujuinya. Penanda `localStorage` `nas-bg-model-ready`
mencegah pertanyaan berulang. Modul ini diimpor secara dinamis agar tidak
membebani bundel awal.

**Naikkan Kualitas Foto.** Tanpa model: `createImageBitmap` → perbesaran
bertahap 2× (interpolasi `imageSmoothingQuality: "high"`) → satu lintasan piksel
untuk unsharp mask + koreksi kontras/saturasi → JPEG kualitas 0.92. Ukuran
keluaran dibatasi 8 MP / 4000 px agar canvas tidak kehabisan memori di ponsel.

**Pasfoto.** Ukuran latar yang benar-benar terlihat hanya bisa dibuat kalau
subjek sudah terpisah dari latar aslinya, jadi alurnya memakai
`removeImageBackground` lebih dulu lalu menempelkan subjek di atas warna
pilihan. Implementasi lama menggambar foto dengan mode *cover* sehingga warna
latar tertutup seluruhnya; `composeIdPhoto` memakai
`min(widthPx / subjectWidth, heightPx / subjectHeight) * zoom` agar seluruh
subjek muat dan latar tetap terlihat.

Ukuran tersedia sebagai preset (2×3, 3×4, 4×6, paspor 35×50 mm, 2×2 inci) atau
kustom dengan satuan cm/mm/px dan DPI 300/600. Warna latar dipilih dari enam
swatch, pemilih warna bebas, atau kode `#RRGGBB` yang divalidasi
(`normalizeHexColor`). Pratinjau disusun ulang setiap ukuran/warna/skala
berubah dengan jeda 80 ms, dan model AI tidak dipanggil ulang — hanya komposit
kanvas.

**Simpan hasil.** Semua alat memakai satu pembungkus `commitStudioOutput` di
`page.tsx`: unduh berkas lebih dulu, baru simpan ke IndexedDB. Urutan itu
disengaja — kalau kuota penyimpanan penuh, berkas tetap sampai ke pengguna dan
muncul peringatan `STORAGE_FULL`. `persistStudioOutput` memakai `id` dari record
`saveLocalFile`, bukan `crypto.randomUUID()` sendiri; versi lama membuat id di
daftar berbeda dari id di IndexedDB sehingga hasil Studio tidak bisa dihapus.

**PDF ke Word.** Memakai `pdfjs-dist` untuk membaca PDF dan `docx` untuk menyusun
berkas Word, keduanya di perangkat pengguna. Setiap halaman menghasilkan paragraf
dari teks yang diekstrak; halaman yang tidak punya teks sama sekali (hasil
pindai) dirender ke kanvas lalu dimasukkan sebagai gambar, supaya isinya tidak
hilang. Batasnya 24 karakter — di bawah itu halaman dianggap pindai.

Baris disusun dari posisi `transform` setiap potongan teks (y menurun, x
menaik), lalu digabung menjadi paragraf bila jarak vertikalnya masih wajar.
Paragraf baru dimulai saat jarak baris melonjak, ukuran huruf berubah lebih dari
1,25×, atau baris diawali nomor/tanda daftar. Tata letak rumit (kolom ganda,
tabel, kotak teks) tidak direproduksi — teks tetap lengkap dan berurutan.

pdf.js berjalan di Web Worker yang berkasnya harus satu origin. `scripts/sync-pdf-worker.mjs`
menyalin `pdf.worker.min.mjs` dari `node_modules` ke `public/` pada `predev` dan
`prebuild`; aset itu tidak masuk repo. Modul pdf.js diimpor dinamis karena
menyentuh `DOMMatrix` saat dimuat, sama seperti modul AI.

PDF terkunci dikenali dari `PasswordException`: galatnya dipetakan ke
`StudioError("PDF_PASSWORD")` dan panel menampilkan kolom kata sandi, bukan
pesan umum.

**Editor PDF.** Menyusun ulang halaman tanpa mengubah berkas asli. State-nya
bukan halaman PDF, melainkan daftar rujukan `{ sourceId, pageIndex, rotation }`:
satu dokumen bisa memuat halaman dari beberapa berkas, dan halaman yang sama
boleh muncul lebih dari sekali. Berkas asli disimpan apa adanya di memori;
`buildEditedPdf` baru menyalin halaman lewat `copyPages` saat pengguna menyimpan,
lalu menggabungkan rotasi tambahan dengan rotasi bawaan halaman.

Operasi yang tersedia: hapus halaman, geser urutan (tombol kiri/kanan untuk
keyboard dan layar sentuh, atau seret kartu di desktop), putar 90°, dan
sisipkan PDF lain pada posisi pilihan. Setiap perubahan menyimpan versi
sebelumnya di tumpukan undo (maksimal 30 langkah). Halaman terakhir tidak bisa
dihapus supaya dokumen tidak pernah kosong.

Pratinjau memakai `PageRenderer` dari `pdfjs.ts`: satu dokumen pdf.js dibuka per
berkas sumber, lalu halaman dirender berurutan selebar 200 px sebagai data URL
JPEG. Render berjalan progresif — kartu tampil lebih dulu dengan indikator
memuat — dan sesi lama dihentikan lewat penanda sesi saat berkas diganti.
