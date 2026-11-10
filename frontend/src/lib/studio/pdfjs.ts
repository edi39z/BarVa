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

/**
 * Perender halaman PDF menjadi gambar kecil.
 *
 * Satu instance membuka dokumen sekali lalu melayani banyak halaman — membuka
 * dokumen per halaman akan membuat worker dan parser bekerja berulang kali.
 * Selalu panggil `destroy()` setelah selesai.
 */
export class PageRenderer {
  private constructor(private readonly opened: OpenedPdf) {}

  static async create(bytes: Uint8Array): Promise<PageRenderer> {
    // pdf.js memindahkan kepemilikan buffer ke worker, jadi kirim salinan.
    return new PageRenderer(await openPdf(new Uint8Array(bytes).buffer as ArrayBuffer));
  }

  /** Render satu halaman sebagai data URL JPEG selebar `targetWidth` piksel. */
  async renderToDataUrl(pageIndex: number, targetWidth: number): Promise<string> {
    const page = await this.opened.pdf.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, targetWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new StudioError("EXPORT_FAILED", "Kanvas tidak tersedia di peramban ini.");
    }

    // Latar putih eksplisit supaya halaman transparan tidak jadi hitam.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;

    const url = canvas.toDataURL("image/jpeg", 0.72);
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    return url;
  }

  async destroy(): Promise<void> {
    await this.opened.destroy().catch(() => {});
  }
}
