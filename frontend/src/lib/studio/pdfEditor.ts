// Model data editor PDF.
//
// Satu dokumen bisa berasal dari beberapa berkas: berkas utama plus PDF yang
// disisipkan. Yang disusun ulang bukan halamannya, melainkan daftar rujukan
// `{ sourceId, pageIndex }` — halaman asli tidak pernah dimodifikasi sampai
// pengguna menyimpan.

import { degrees, PDFDocument } from "pdf-lib";
import { StudioError } from "./errors";

/** Rotasi tambahan yang boleh diterapkan pengguna. */
export type PageRotation = 0 | 90 | 180 | 270;

export interface EditorSource {
  id: string;
  name: string;
  /** Isi berkas asli, dipakai saat menyusun PDF hasil. */
  bytes: Uint8Array;
  pageCount: number;
}

export interface EditorPage {
  /** Identitas unik halaman di daftar; satu halaman sumber bisa muncul dua kali. */
  id: string;
  sourceId: string;
  /** Indeks halaman di berkas asal, mulai 0. */
  pageIndex: number;
  rotation: PageRotation;
}

export interface LoadedSource {
  source: EditorSource;
  pages: EditorPage[];
}

/** Baca PDF menjadi sumber editor beserta daftar halaman awalnya. */
export async function readPdfSource(file: File): Promise<LoadedSource> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let pageCount: number;
  try {
    const document = await PDFDocument.load(bytes);
    pageCount = document.getPageCount();
  } catch (error) {
    // `EncryptedPDFError` dari pdf-lib sudah dipetakan `describeStudioError`.
    if (nameOf(error) === "EncryptedPDFError") {
      throw new StudioError(
        "PDF_ENCRYPTED",
        "PDF terkunci kata sandi tidak bisa diedit.",
        "Simpan salinan tanpa kata sandi dari aplikasi pembuatnya, lalu coba lagi."
      );
    }
    throw error;
  }

  if (pageCount === 0) {
    throw new StudioError("PDF_INVALID", "PDF ini tidak berisi halaman.", "Periksa berkasnya lalu coba lagi.");
  }

  const source: EditorSource = {
    id: crypto.randomUUID(),
    name: file.name,
    bytes,
    pageCount,
  };

  return { source, pages: pagesForSource(source) };
}

/** Halaman awal sebuah sumber, dipakai saat berkas disisipkan. */
export function pagesForSource(source: EditorSource): EditorPage[] {
  return Array.from({ length: source.pageCount }, (_, pageIndex) => ({
    id: crypto.randomUUID(),
    sourceId: source.id,
    pageIndex,
    rotation: 0,
  }));
}

/**
 * Susun PDF hasil dari daftar halaman.
 *
 * Halaman disalin lewat `copyPages` sehingga berkas asli tetap utuh; rotasi
 * tambahan digabung dengan rotasi bawaan halaman.
 */
export async function buildEditedPdf(
  sources: Map<string, EditorSource>,
  pages: EditorPage[]
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new StudioError(
      "EXPORT_FAILED",
      "Tidak ada halaman yang tersisa.",
      "Sisakan minimal satu halaman sebelum menyimpan."
    );
  }

  const output = await PDFDocument.create();
  const loaded = new Map<string, PDFDocument>();

  for (const page of pages) {
    const source = sources.get(page.sourceId);
    if (!source) {
      throw new StudioError("EXPORT_FAILED", "Berkas asal halaman tidak ditemukan.");
    }

    let document = loaded.get(source.id);
    if (!document) {
      document = await PDFDocument.load(source.bytes);
      loaded.set(source.id, document);
    }

    const [copied] = await output.copyPages(document, [page.pageIndex]);
    if (page.rotation !== 0) {
      const current = copied.getRotation().angle;
      copied.setRotation(degrees((current + page.rotation) % 360));
    }
    output.addPage(copied);
  }

  return output.save();
}

function nameOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}
