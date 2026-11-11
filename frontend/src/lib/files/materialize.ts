/**
 * Mengubah item daftar berkas menjadi `File` yang bisa diproses alat Studio.
 *
 * Mode standalone memakai blob yang sudah ada di IndexedDB. Mode NAS mengunduh
 * isi berkas lebih dulu; ukurannya dibatasi supaya tab tidak kehabisan memori.
 */
import { getDownloadUrl } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/nasDisplay";

/** Batas aman berkas yang diproses di perangkat. */
export const MAX_PROCESS_BYTES = 200 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor() {
    super("Berkas terlalu besar untuk diproses di perangkat ini.");
    this.name = "FileTooLargeError";
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function guessMime(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export async function itemToFile(
  item: DisplayItem,
  mode: "standalone" | "nas"
): Promise<File> {
  if (item.blob) {
    return new File([item.blob], item.name, {
      type: item.blob.type || guessMime(item.name),
    });
  }

  if (mode !== "nas") {
    throw new Error("Isi berkas ini tidak tersedia di perangkat.");
  }

  const response = await fetch(getDownloadUrl(item.id));
  if (!response.ok) {
    throw new Error("Gagal mengunduh berkas dari server.");
  }

  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_PROCESS_BYTES) {
    throw new FileTooLargeError();
  }

  const blob = await response.blob();
  if (blob.size > MAX_PROCESS_BYTES) {
    throw new FileTooLargeError();
  }

  return new File([blob], item.name, {
    type: blob.type || guessMime(item.name),
  });
}
