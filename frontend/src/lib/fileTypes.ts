// Klasifikasi tipe berkas untuk UI.
//
// Backend hanya mengirim MIME + nama, sedangkan UI butuh satu dari lima
// kategori. Aturan di sini dipakai bersama oleh pemetaan node NAS, impor berkas
// lokal, dan halaman share publik supaya berkas yang sama tidak muncul dengan
// kategori berbeda di layar berbeda.

export type FileType = "folder" | "image" | "video" | "document" | "archive";

const ARCHIVE_MIME_PREFIXES = [
  "application/zip",
  "application/x-rar",
  "application/x-7z",
  "application/gzip",
];

const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".tar.gz"];

/**
 * Menentukan tipe tampilan dari metadata berkas.
 *
 * Audio ikut kategori "video" karena UI menampilkannya di pemutar media yang
 * sama. Nama berkas hanya dipakai sebagai cadangan ketika MIME tidak ada atau
 * `application/octet-stream` — mis. hasil unggahan browser lama.
 */
export function detectFileType(input: {
  mime?: string | null;
  name?: string | null;
  isDirectory?: boolean;
}): FileType {
  if (input.isDirectory) return "folder";

  const mime = (input.mime ?? "").toLowerCase();
  const name = (input.name ?? "").toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return "video";
  if (ARCHIVE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return "archive";
  if (ARCHIVE_EXTENSIONS.some((ext) => name.endsWith(ext))) return "archive";
  return "document";
}
