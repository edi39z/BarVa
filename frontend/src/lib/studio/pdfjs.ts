// Pembungkus pdf.js untuk Studio.
//
// pdf.js sengaja diimpor secara dinamis: modulnya menyentuh `DOMMatrix` dan
// `canvas` saat dimuat, sehingga tidak boleh ikut dievaluasi di server. Pola
// yang sama dipakai `lib/studio/ai.ts` untuk model hapus latar.

import type { PDFDocumentProxy } from "pdfjs-dist";
import { StudioError } from "./errors";

/** Berkas worker yang disalin `scripts/sync-pdf-worker.mjs` ke `public/`. */
const WORKER_URL = "/pdf.worker.min.mjs";

let workerConfigured = false;

/** Pegangan dokumen sekaligus cara melepas worker-nya. */
export interface OpenedPdf {
  pdf: PDFDocumentProxy;
  /** Hentikan worker pdf.js untuk dokumen ini. */
  destroy: () => Promise<void>;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    workerConfigured = true;
  }

  return pdfjs;
}

/**
 * Buka PDF dari isi berkas.
 *
 * `data` diserahkan ke worker sehingga ArrayBuffer-nya berpindah kepemilikan
 * dan tidak bisa dipakai lagi oleh pemanggil — kirim salinan bila isinya masih
 * dibutuhkan.
 *
 * Melempar `StudioError` berkode `PDF_PASSWORD` bila dokumen terkunci, sehingga
 * panel bisa menampilkan kolom kata sandi.
 */
export async function openPdf(data: ArrayBuffer, password?: string): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    password,
  });

  try {
    const pdf = await loadingTask.promise;
    // `PDFDocumentProxy` tidak punya `destroy()`; worker dilepas lewat tugas
    // muatnya, jadi keduanya dikembalikan sebagai satu pegangan.
    return { pdf, destroy: () => loadingTask.destroy() };
  } catch (error) {
    // Tugas muat yang gagal tetap memegang worker; tanpa ini worker-nya bocor.
    void loadingTask.destroy().catch(() => {});

    if (nameOf(error) === "PasswordException") {
      const code = (error as { code?: number }).code;
      throw code === 2
        ? new StudioError(
            "PDF_PASSWORD",
            "Kata sandi yang dimasukkan belum benar.",
            "Periksa huruf besar-kecilnya, lalu coba lagi."
          )
        : new StudioError(
            "PDF_PASSWORD",
            "Dokumen ini terkunci kata sandi.",
            "Masukkan kata sandi dokumen untuk membukanya."
          );
    }

    throw error;
  }
}

function nameOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

/** Apakah galat ini berarti pengguna perlu memasukkan kata sandi. */
export function isPdfPasswordError(error: unknown): boolean {
  return error instanceof StudioError && error.code === "PDF_PASSWORD";
}
