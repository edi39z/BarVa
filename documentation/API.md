# Referensi API

Base URL pengembangan: `http://localhost:8080`. Semua endpoint di bawah
`/api/v1` kecuali `/health`.

---

## Konvensi

### Autentikasi

| Jenis | Cara | Dipakai oleh |
|---|---|---|
| Sesi pengguna | `Authorization: Bearer <token>` | `/auth/me`, `/files/*`, `/shares`, `/family/*` |
| Sesi lewat query | `?token=<token>` | `/files/:id/download`, `/files/:id/stream` (karena `<img>`/`<video>` tidak bisa mengirim header) |
| Admin key | `X-Admin-Key: <kunci>` | `/gdrive/*`, `/invites/*` |
| Tanpa autentikasi | — | `/health`, `/auth/register`, `/auth/login`, `/public/*`, `/gdrive/callback` |

Bila `NAS_ADMIN_KEY` tidak diset di server, endpoint admin hanya menerima
permintaan dari IP lokal/privat.

### Format error

Selalu berbentuk objek dengan `code` dan `message`:

```json
{ "error": { "code": "CONFLICT", "message": "File dengan nama tersebut sudah ada di folder ini." } }
```

### Kode status yang sering muncul

| Status | Arti |
|---|---|
| `400` | Input tidak valid (`VALIDATION_ERROR`, `INVALID_NAME`, `INVALID_PARENT`) |
| `401` | Token tidak ada/kedaluwarsa (`UNAUTHORIZED`, `INVALID_SESSION`) |
| `403` | Bukan pemilik atau bukan admin |
| `404` | Item tidak ditemukan |
| `409` | Nama bentrok di folder yang sama |
| `413` | Upload melebihi `MAX_UPLOAD_BYTES` |

---

## Health

```
GET /health
```

```json
{ "status": "online", "database": true, "version": "1.0-mvp", "time": "2026-11-10T00:00:00+07:00" }
```

`database: false` berarti backend berjalan dalam mode storage-only.

---

## Auth

### `POST /api/v1/auth/register`

```json
{ "email": "a@b.c", "username": "tester", "password": "rahasia123" }
```

`201` — **tidak** mengembalikan token. Pengguna pertama menjadi `owner`.

```json
{ "data": { "id": "uuid", "email": "a@b.c", "username": "tester", "role": "owner", "created_at": "..." } }
```

### `POST /api/v1/auth/login`

```json
{ "email": "a@b.c", "password": "rahasia123" }
```

```json
{ "data": { "token": "64-hex", "expires_at": "...", "user": { "id": "uuid", "email": "a@b.c", "username": "tester", "role": "owner" } } }
```

Dibatasi 5 kegagalan per 15 menit per kombinasi IP+email → `429 RATE_LIMITED`.

### `GET /api/v1/auth/me`

```json
{ "data": { "id": "uuid", "email": "a@b.c", "username": "tester", "role": "owner", "created_at": "..." } }
```

### `POST /api/v1/auth/logout`

```json
{ "data": { "message": "Berhasil logout." } }
```

---

## File manager

Semua endpoint membutuhkan sesi.

Otorisasi memakai **pemilik node + role**:

- `member` hanya bisa melihat dan mengelola berkas miliknya sendiri.
- `owner` dan `admin` bisa melihat, mengunduh, mengganti nama, menghapus, dan
  memulihkan berkas semua anggota.
- Membuat folder/unggah selalu di folder milik pemanggil, dan memindahkan item
  hanya di pohon milik pemilik item. Operasi lintas pemilik ditolak
  `400 INVALID_PARENT`.
- Node yang bukan milik pemanggil dan tidak boleh diakses mengembalikan
  `403 FORBIDDEN`. Node yang tidak ada mengembalikan `404 NOT_FOUND`.

### `GET /api/v1/files`

Query: `parent_id` (opsional). Tanpa parameter = isi akar.

```json
{
  "data": [
    {
      "ID": "uuid",
      "OwnerID": "uuid",
      "ParentID": null,
      "Name": "Dokumen",
      "IsDirectory": true,
      "ObjectID": null,
      "DeletedAt": null,
      "CreatedAt": "2026-11-10T00:00:00+07:00",
      "UpdatedAt": "2026-11-10T00:00:00+07:00",
      "SizeBytes": null,
      "MimeType": null
    }
  ]
}
```

Nama field memakai **PascalCase** karena struct Go tanpa json tag. Folder
diurutkan lebih dulu, lalu nama.

### `POST /api/v1/files/folder`

```json
{ "name": "Dokumen", "parent_id": null }
```

`201` dengan node yang dibuat. `409` bila nama sudah dipakai.

### `POST /api/v1/files/upload`

`multipart/form-data`:

| Field | Wajib | Keterangan |
|---|---|---|
| `file` | ya | Berkas yang diunggah |
| `parent_id` | tidak | Folder tujuan; kosong = akar |
| `overwrite` | tidak | `"true"` untuk mengganti berkas bernama sama |

`201`:

```json
{ "data": { "node": { "ID": "...", "Name": "foto.jpg", "...": "..." }, "object": { "sha256": "...", "size_bytes": 12345 } } }
```

`413 FILE_TOO_LARGE` bila melebihi batas.

### `PATCH /api/v1/files/:id`

```json
{ "name": "nama-baru.txt" }
```

```json
{ "data": { "ID": "uuid", "Name": "nama-baru.txt", "UpdatedAt": "..." } }
```

`400 INVALID_NAME` bila kosong, lebih dari 255 karakter, atau mengandung `/`
atau `\`. `409 CONFLICT` bila nama sudah dipakai.

### `POST /api/v1/files/:id/move`

```json
{ "parent_id": "uuid-folder-tujuan" }
```

`parent_id: null` atau `"root"` memindahkan ke akar.

```json
{ "data": { "ID": "uuid", "ParentID": "uuid-folder-tujuan", "UpdatedAt": "..." } }
```

`400 INVALID_TARGET` bila folder dipindahkan ke dirinya sendiri atau ke
turunannya.

### `DELETE /api/v1/files/:id`

Soft delete.

```json
{ "data": { "message": "File berhasil dipindahkan ke trash bin." } }
```

### `GET /api/v1/files/:id/download`

Mengirim berkas dengan `Content-Disposition: attachment`.

### `GET /api/v1/files/:id/stream`

Mendukung `Range` (`206 Partial Content`) untuk pemutar video.

### `GET /api/v1/files/:id/thumbnail?size=small|large`

Mengirim pratinjau JPEG dari berkas gambar. `size` default `small` (sisi
terpanjang 320 px); `large` 960 px. Hanya untuk berkas dengan MIME `image/*`.

- Respons memakai `ETag: "<sha256>-<sisi>"` dan
  `Cache-Control: private, max-age=31536000, immutable`. Kirim
  `If-None-Match` untuk mendapat `304 Not Modified`.
- Pratinjau dibuat sekali lalu disimpan di `THUMBNAIL_DIR`
  (`<sha256>_<sisi>.jpg`), jadi permintaan berikutnya tidak men-dekode ulang.
- Kode kesalahan: `400 IS_DIRECTORY`, `400 INVALID_SIZE`,
  `415 NOT_IMAGE` (MIME bukan gambar), `415 UNSUPPORTED_IMAGE` (isi tidak bisa
  didekode, mis. HEIC), `413 IMAGE_TOO_LARGE` (di atas 80 MP), `403 FORBIDDEN`.

---

## Trash

Penghapusan lewat `DELETE /api/v1/files/:id` bersifat *soft delete*: baris
node diberi `deleted_at` dan hilang dari daftar file, tetapi berkas fisik
masih ada. Endpoint di bawah ini mengelola isi trash. Semuanya butuh sesi;
`member` hanya melihat item miliknya, `owner`/`admin` melihat semua anggota.

### `GET /api/v1/trash`

Mengembalikan semua node terhapus, terbaru lebih dulu.

```json
{
  "data": [
    {
      "ID": "uuid",
      "OwnerID": "uuid",
      "ParentID": "uuid-folder-asal",
      "Name": "laporan.pdf",
      "IsDirectory": false,
      "ObjectID": "uuid",
      "DeletedAt": "2026-11-10T10:13:22+07:00",
      "CreatedAt": "2026-11-10T10:13:22+07:00",
      "UpdatedAt": "2026-11-10T10:13:22+07:00",
      "SizeBytes": 11,
      "MimeType": "application/pdf",
      "ParentName": "Dokumen"
    }
  ]
}
```

`ParentName` bernilai `null` bila item berada di akar. Daftar kosong
dikembalikan sebagai `[]`, bukan `null`.

### `POST /api/v1/trash/:id/restore`

Mengembalikan node ke folder asalnya (`deleted_at = NULL`).

```json
{ "data": { "ID": "uuid", "ParentID": "uuid", "Name": "laporan.pdf", "UpdatedAt": "..." } }
```

| Status | Kode | Arti |
|---|---|---|
| `404` | `NOT_FOUND` | Node tidak ada atau bukan milik pengguna |
| `409` | `NOT_TRASHED` | Node masih aktif, tidak perlu dipulihkan |
| `409` | `PARENT_IN_TRASH` | Folder induknya masih di trash — pulihkan induk dulu |
| `409` | `CONFLICT` | Sudah ada item bernama sama di folder tujuan |

### `DELETE /api/v1/trash/:id`

Menghapus permanen. Untuk folder, seluruh isinya ikut terhapus (cascade).
Objek CAS yang tidak lagi dipakai node mana pun ikut dihapus dari disk; objek
yang masih dipakai node lain dibiarkan karena deduplikasi.

```json
{ "data": { "message": "Item dihapus permanen." } }
```

`409 NOT_TRASHED` bila node belum dihapus, `404 NOT_FOUND` bila sudah tidak ada.

---

## Share link

### `POST /api/v1/shares`

```json
{ "node_id": "uuid", "permission": "viewer", "password": "opsional", "expires_in": "7d" }
```

`expires_in`: `"24h"`, `"7d"`, `"30d"`, atau dihilangkan untuk tanpa batas.
`permission`: `viewer` atau `uploader`.

```json
{
  "data": {
    "id": "uuid",
    "raw_token": "64-hex",
    "link_url": "/s/64-hex",
    "permission": "viewer",
    "expires_at": "2026-11-17T00:00:00+07:00",
    "created_at": "..."
  }
}
```

`raw_token` **hanya muncul sekali**. Database menyimpan hash-nya saja, jadi
tautan tidak bisa ditampilkan ulang.

### `GET /api/v1/shares`

```json
{
  "data": [
    {
      "ID": "uuid",
      "NodeID": "uuid",
      "Permission": "viewer",
      "ExpiresAt": null,
      "CreatedAt": "...",
      "HasPassword": true,
      "NodeName": "foto.jpg",
      "IsDirectory": false,
      "SizeBytes": 12345,
      "MimeType": "image/jpeg"
    }
  ]
}
```

### `DELETE /api/v1/shares/:id`

Mencabut tautan. Tautan langsung tidak berlaku.

### `GET /api/v1/public/share/:token`

```json
{
  "data": {
    "node_name": "foto.jpg",
    "is_directory": false,
    "size_bytes": 12345,
    "mime_type": "image/jpeg",
    "permission": "viewer",
    "expires_at": null,
    "has_password": true
  }
}
```

### `POST /api/v1/public/share/:token/verify`

Memvalidasi password tanpa menyentuh berkas. Dipakai halaman publik untuk
membuka share folder (yang tidak punya berkas tunggal untuk uji `Range`).

```json
{ "password": "rahasia" }
```

`200 {"data":{"valid":true}}` bila benar (atau share memang tanpa password),
`401 INVALID_PASSWORD` bila salah.

### `GET /api/v1/public/share/:token/download`

Mengunduh satu berkas. Bila `has_password`, kirim `X-Share-Password: <password>`
atau `?password=<password>`. Tanpa itu → `401 PASSWORD_REQUIRED`. Share yang
menunjuk folder mengembalikan `400 IS_DIRECTORY` — gunakan endpoint arsip.

Tips memverifikasi password tanpa mengunduh seluruh berkas:

```bash
curl -H "Range: bytes=0-0" -H "X-Share-Password: rahasia" \
  http://localhost:8080/api/v1/public/share/<token>/download
# 206 = password benar, 401 = salah
```

### `GET /api/v1/public/share/:token/archive`

Mengalirkan seluruh isi folder share sebagai satu arsip zip.

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="<nama-folder>.zip"`
- Tanpa `Content-Length` (streaming/chunked), jadi progres unduhan bergantung
  pada browser.
- Struktur di dalam zip mengikuti hierarki folder; folder kosong tetap dibuat
  sebagai entri `namafolder/`.
- Berkas yang hilang dari disk dilewati, bukan menggagalkan seluruh arsip.
- Share yang menunjuk berkas tunggal mengembalikan `400 NOT_DIRECTORY`.

Password (bila ada) dikirim lewat `?password=` atau `X-Share-Password`, sama
seperti endpoint download.

---

## Keluarga

### `GET /api/v1/family/members`

Daftar akun yang terdaftar di server. `member` hanya menerima datanya sendiri;
daftar lengkap (termasuk email anggota lain) hanya untuk `owner`/`admin`.

### `POST /api/v1/family/invite`

Hanya `owner`/`admin`.

```json
{ "name": "Budi", "email": "budi@contoh.id", "role": "member", "quota_gb": 100 }
```

---

## Undangan

### `GET /api/v1/invites` — admin key

Daftar undangan beserta ringkasan status.

### `POST /api/v1/invites` — admin key

```json
{ "name": "Budi", "email": "budi@contoh.id", "role": "member", "quota_gb": 100, "expires_in_hours": 168 }
```

Respons menyertakan `token` (sekali saja) dan `url` siap dibagikan.

### `DELETE /api/v1/invites/:id` — admin key

### `GET /api/v1/public/invites/:token`

```json
{ "valid": true, "status": "pending", "name": "Budi", "email": "budi@contoh.id", "role": "member", "quota_gb": 100, "expires_at": "..." }
```

### `POST /api/v1/public/invites/:token/accept`

Menandai undangan diterima dan mencatat anggota.

---

## Google Drive (admin key)

| Endpoint | Fungsi |
|---|---|
| `GET /gdrive/status` | `connected`, `has_client`, `email`, `scope`, `full_drive`, `token_valid` |
| `POST /gdrive/client` | Simpan `client_id`, `client_secret`, `redirect_uri` |
| `GET /gdrive/auth-url` | URL persetujuan Google |
| `GET /gdrive/callback` | Callback OAuth (publik, dipanggil browser) |
| `GET /gdrive/quota` | Kuota penyimpanan Drive |
| `GET /gdrive/files` | Query: `q`, `folder`, `limit` |
| `GET /gdrive/file/:id/download` | Unduh lewat server |
| `POST /gdrive/upload` | Unggah berkas ke Drive |
| `POST /gdrive/disconnect` | Hapus refresh token |

Contoh `GET /gdrive/status`:

```json
{
  "connected": true,
  "has_client": true,
  "email": "akun@contoh.id",
  "scope": "openid https://www.googleapis.com/auth/drive ...",
  "full_drive": true,
  "token_valid": true,
  "redirect_uri": "http://localhost:8080/api/v1/gdrive/callback",
  "expires_at": 1794244291,
  "server_time": "2026-11-10T00:00:00+07:00"
}
```
