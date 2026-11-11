# Panduan Antarmuka (UI/UX)

Dokumen ini menjelaskan sistem desain frontend: token warna, mode terang/gelap,
aturan tipografi, navigasi, dan keputusan aksesibilitas. Tujuannya agar
perubahan berikutnya tetap konsisten tanpa menulis ulang gaya dari nol.

---

## 1. Prinsip

Antarmuka dipakai satu keluarga dengan rentang usia dan kemampuan teknis yang
lebar, sehingga aturannya:

1. **Satu bahasa untuk hal yang sama.** Unggah, folder, berkas, dan sampah
   memakai istilah yang sama di seluruh layar.
2. **Tombol utama selalu terlihat.** Aksi utama (Unggah Berkas) ada di header,
   bukan disembunyikan di menu.
3. **Umpan balik langsung.** Setiap proses panjang punya status: progres unggah,
   pesan berhasil, atau pesan gagal yang menjelaskan langkah berikutnya.
4. **Kesalahan dicegah, bukan hanya dilaporkan.** Aksi merusak (hapus permanen)
   memakai konfirmasi dan dijelaskan konsekuensinya.
5. **Detail teknis jadi informasi sekunder.** Istilah seperti SHA-256,
   IndexedDB, atau WASM tidak dipakai sebagai label utama; hanya sebagai
   keterangan tambahan.
6. **Tidak ada teks di bawah 11 px**, dan teks utama 13–15 px.

---

## 2. Token warna

Semua warna didefinisikan di `frontend/src/app/globals.css` sebagai variabel
CSS, lalu dipetakan ke utilitas Tailwind lewat `@theme inline`. Komponen
**tidak boleh** memakai warna mentah (`bg-zinc-900`, `text-gray-400`) karena
akan rusak di salah satu mode.

| Token | Peran | Terang | Gelap |
|---|---|---|---|
| `--canvas` | latar aplikasi | `#f2f6fc` | `#0a1120` |
| `--surface` | kartu, panel, header | `#ffffff` | `#121c2f` |
| `--surface-2` | area dalam kartu | `#f7f9fd` | `#0e1728` |
| `--surface-3` | hover / pilihan | `#eef3fa` | `#1a2740` |
| `--line` | garis pemisah | `#e2e9f3` | `#22304a` |
| `--line-strong` | batas input | `#ccd7e8` | `#31415f` |
| `--fg` | teks utama | `#0f1b31` | `#edf3fb` |
| `--fg-muted` | teks sekunder | `#55657f` | `#a7b6cd` |
| `--fg-subtle` | keterangan kecil | `#5f6d84` | `#7f8ea8` |
| `--brand` | teks & ikon aksen | `#1d5fd8` | `#7aabff` |
| `--brand-solid` | latar tombol utama | `#2563eb` | `#2563eb` |
| `--brand-soft` | latar pilihan aktif | `#eaf1ff` | `#16243d` |
| `--success` / `--warn` / `--danger` | status | hijau/oranye/merah | versi lebih terang |

Nama utilitas yang dihasilkan: `bg-surface`, `bg-surface-2`, `border-line`,
`text-fg`, `text-muted`, `text-subtle`, `bg-brand-soft`, `text-brand`, dst.

Warna tile ikon kategori memakai token tersendiri (`--tile-blue`,
`--tile-purple`, `--tile-green`, `--tile-amber`, `--tile-rose`, `--tile-teal`,
`--tile-indigo`, `--tile-slate`) agar kartu pintasan tetap berwarna di kedua
mode.

### Kontras

Semua pasangan teks/latar memenuhi WCAG AA (≥ 4.5:1) untuk teks kecil:

| Pasangan | Rasio |
|---|---|
| `--fg` di `--surface` (terang) | 17.2 |
| `--fg-muted` di `--surface` | 5.9 |
| `--fg-subtle` di `--surface` | 5.2 |
| `--fg-subtle` di `--canvas` | 4.8 |
| putih di `--brand-solid` | 5.2 |
| `--brand` di `--brand-soft` | 5.0 |
| `--fg-subtle` di `--surface` (gelap) | 5.1 |

Saat mengubah token, hitung ulang kontrasnya sebelum commit.

---

## 3. Mode terang & gelap

- Pilihan disimpan di `localStorage` dengan kunci `nas-theme` (`light`/`dark`).
- Bila pengguna belum memilih, aplikasi mengikuti `prefers-color-scheme`.
- Kelas `dark` dipasang pada `<html>` oleh skrip kecil di `layout.tsx`
  **sebelum React hidrasi**, sehingga tidak ada kedipan putih saat memuat.
- `ThemeProvider` (`components/ThemeProvider.tsx`) membaca keadaan dari DOM
  lewat `useSyncExternalStore`; `useTheme()` menyediakan `theme`, `setTheme`,
  dan `toggleTheme`.
- Tombol: `components/ThemeToggle.tsx`. Versi ikon dipakai di header, versi
  berlabel dipakai di panel menu HP.

Menambah mode baru cukup dengan menambah satu blok variabel (mis. `.sepia`)
dan opsi di `ThemeProvider`; komponen tidak perlu diubah.

---

## 4. Kelas komponen bersama

Didefinisikan di `@layer components` pada `globals.css`:

| Kelas | Kegunaan |
|---|---|
| `.card` | permukaan putih + garis + bayangan lembut, radius 16 px |
| `.card-hover` | kartu yang bisa diklik (naik 2 px saat hover) |
| `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` | tombol; tinggi minimum 40 px |
| `.btn-lg` / `.btn-sm` | varian ukuran tombol |
| `.icon-btn` | tombol ikon 36×36 px dengan area sentuh memadai |
| `.input` / `.select` / `.label` | kontrol formulir dengan fokus jelas |
| `.chip` + `.chip-brand` / `.chip-success` / `.chip-warn` / `.chip-danger` / `.chip-neutral` | label status |
| `.scroll-area` | area gulir dengan scrollbar stabil |

Aturan praktis:

- Kartu konten → `.card`; jangan menulis `bg-... border-... rounded-...` lagi.
- Aksi utama → `.btn .btn-primary`; aksi sekunder → `.btn .btn-secondary`.
- Jangan membuat tombol dengan tinggi di bawah 40 px, termasuk tombol ikon.

---

## 5. Tipografi

- Font sistem (`system-ui`, Segoe UI, Roboto) agar terasa familiar dan cepat.
- Teks dasar 15 px; teks sekunder 12–13 px; keterangan kecil 11 px (minimum).
- Judul halaman 17 px tebal; judul kartu 14 px tebal; angka memakai
  `tabular-nums` agar tidak bergeser.
- Tidak memakai huruf kapital penuh untuk kalimat panjang; hanya untuk label
  bagian yang sangat pendek.

---

## 6. Navigasi

**Desktop (≥ 1024 px)**

- Sidebar 260 px: identitas aplikasi + status server, menu utama, grup
  "Lainnya", tombol pasang PWA, ringkasan penyimpanan, dan akun.
- Header: pencarian (Ctrl/⌘ + K), status server, tombol tema, Folder Baru,
  Unggah Berkas.
- Tab Berkas punya dua cakupan pencarian di baris filter: **Nama** menyaring
  folder yang sedang dibuka, **Isi** menampilkan hasil pencarian teks dokumen
  lintas folder (kartu menampilkan potongan kalimat dan chip folder asal).
  Mode hasil menyembunyikan tombol Pilih dan breadcrumb, diganti ringkasan
  "Hasil pencarian isi".

**HP (< 1024 px)**

- Sidebar disembunyikan; diganti bilah navigasi bawah 5 tujuan: Beranda,
  Berkas, Galeri, Studio, Lainnya.
- "Lainnya" membuka panel bawah berisi Berbagi Keluarga, Google Drive, Sampah,
  Pengaturan Server, Pasang di HP, tombol tema berlabel, dan Keluar.
- Konten memakai padding bawah `pb-24` agar tidak tertutup bilah navigasi.

Semua tombol ikon memiliki `aria-label`, dan menu aktif ditandai
`aria-current="page"`.

---

## 7. Aksesibilitas

Checklist yang sudah diterapkan:

- Fokus keyboard terlihat (`:focus-visible` 2 px warna brand) dan tautan
  "Lewati ke konten utama" tersedia.
- Dialog memakai `role="dialog"`, `aria-modal`, judul terhubung lewat
  `aria-labelledby`, fokus awal di panel, dan bisa ditutup dengan `Escape`
  (lihat `components/Modal.tsx`).
- Status penting memakai `role="status"` / `aria-live`, galat memakai
  `role="alert"`.
- Semua input memiliki `<label>` eksplisit; ikon dekoratif memakai
  `aria-hidden`.
- Bilah progres kuota/penyimpanan memakai `role="progressbar"` dengan nilai.
- Animasi dimatikan otomatis saat `prefers-reduced-motion: reduce`.
- Target sentuh utama ≥ 40 px; navigasi bawah ≥ 52 px.

Saat menambah layar baru, periksa: kontras, label, urutan fokus, dan keadaan
kosong (empty state) yang menjelaskan langkah berikutnya.

---

## 8. Struktur berkas terkait

```
frontend/src/
├── app/globals.css          # token, base style, kelas komponen
├── app/layout.tsx           # skrip anti-kedip + ThemeProvider
└── components/
    ├── ThemeProvider.tsx    # sumber kebenaran tema
    ├── ThemeToggle.tsx      # tombol ganti mode
    ├── Modal.tsx            # kerangka dialog bersama
    ├── Sidebar.tsx          # navigasi desktop
    ├── WorkspaceHeader.tsx  # pencarian + aksi utama
    ├── MobileNav.tsx        # navigasi bawah + panel "Lainnya"
    └── ...                  # layar dan modal lain
```
