// PDF → Word di perangkat pengguna.
//
// Pendekatannya sengaja sederhana dan dapat diprediksi: setiap halaman
// menghasilkan teks yang bisa diedit, kecuali halaman yang tidak punya teks
// sama sekali (hasil pindai/gambar) — halaman seperti itu dimasukkan sebagai
// gambar agar isinya tidak hilang. Tata letak rumit (kolom ganda, tabel,
// kotak teks) tidak direproduksi; teks tetap lengkap dan berurutan.

import {
  AlignmentType,
  Document,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { PDFPageProxy } from "pdfjs-dist";
import { StudioError } from "./errors";
import { openPdf } from "./pdfjs";

/** Di bawah jumlah karakter ini, halaman dianggap hasil pindai. */
const MIN_TEXT_CHARS = 24;

/** Lebar render halaman gambar: ±150 DPI untuk halaman A4. */
const RENDER_TARGET_WIDTH = 1240;

/** Lebar isi halaman Word (A4 dikurangi margin bawaan) dalam piksel 96 DPI. */
const CONTENT_WIDTH_PX = 600;

/** Batas ukuran huruf yang masuk akal untuk dokumen Word. */
const MIN_FONT_PT = 8;
const MAX_FONT_PT = 48;

/**
 * Baris yang diawali nomor atau tanda daftar selalu jadi paragraf sendiri.
 *
 * Tanpa ini, butir daftar yang jarak barisnya rapat akan tergabung menjadi satu
 * paragraf panjang dan penomorannya hilang di Word.
 */
const LIST_ITEM_START = /^(\d+[.)]\s|[-•▪◦*]\s)/;

export interface PdfToWordProgress {
  /** Halaman yang sedang diproses, mulai dari 1. */
  page: number;
  total: number;
}

export interface PdfToWordResult {
  blob: Blob;
  /** Jumlah halaman di dokumen sumber. */
  pages: number;
  /** Halaman yang teksnya berhasil diekstrak. */
  textPages: number;
  /** Halaman tanpa teks yang dimasukkan sebagai gambar. */
  imagePages: number;
}

export interface PdfToWordOptions {
  /** Kata sandi untuk PDF terkunci. */
  password?: string;
  onProgress?: (progress: PdfToWordProgress) => void;
}

interface TextChunk {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
}

interface TextBlock {
  text: string;
  size: number;
}

/**
 * Ubah PDF menjadi dokumen Word (.docx).
 *
 * Melempar `StudioError` berkode `PDF_PASSWORD` bila dokumen terkunci dan
 * `password` belum diisi atau salah.
 */
export async function pdfToWord(
  file: File,
  { password, onProgress }: PdfToWordOptions = {}
): Promise<PdfToWordResult> {
  // Salinan dibuat karena pdf.js memindahkan kepemilikan buffer ke worker.
  const opened = await openPdf(await file.arrayBuffer(), password);
  const pdf = opened.pdf;

  try {
    const total = pdf.numPages;
    const children: Paragraph[] = [];
    let textPages = 0;
    let imagePages = 0;

    for (let index = 1; index <= total; index += 1) {
      onProgress?.({ page: index, total });

      const page = await pdf.getPage(index);
      const lines = extractLines(await page.getTextContent());
      const textLength = lines.reduce((sum, line) => sum + line.text.trim().length, 0);

      // Setiap halaman PDF dimulai di halaman Word baru.
      if (index > 1) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      if (textLength >= MIN_TEXT_CHARS) {
        textPages += 1;
        children.push(...blocksToParagraphs(groupBlocks(lines)));
      } else {
        imagePages += 1;
        children.push(await pageImageParagraph(page));
      }

      page.cleanup();
    }

    const document = new Document({
      creator: "NAS Studio",
      title: file.name,
      sections: [{ children }],
    });

    return { blob: await Packer.toBlob(document), pages: total, textPages, imagePages };
  } finally {
    void opened.destroy().catch(() => {});
  }
}

/** Susun potongan teks menjadi baris, lalu baris menjadi paragraf. */
function extractLines(content: { items: unknown[] }): TextLine[] {
  const chunks = toChunks(content.items);
  if (chunks.length === 0) return [];

  // PDF menaruh y tumbuh ke atas, jadi urutan baca adalah y menurun.
  chunks.sort((a, b) => (Math.abs(a.y - b.y) > 1 ? b.y - a.y : a.x - b.x));

  const lines: TextLine[] = [];
  let current: TextChunk[] = [];

  for (const chunk of chunks) {
    const line = current[0];
    const tolerance = line ? Math.max(1, line.size * 0.5) : 0;

    if (line && Math.abs(chunk.y - line.y) <= tolerance) {
      current.push(chunk);
    } else {
      if (current.length > 0) lines.push(joinChunks(current));
      current = [chunk];
    }
  }
  if (current.length > 0) lines.push(joinChunks(current));

  return lines;
}

function toChunks(items: unknown[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const item of items) {
    const candidate = item as {
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    };
    if (typeof candidate.str !== "string" || !candidate.str.trim()) continue;

    const transform = candidate.transform ?? [];
    const x = Number(transform[4]);
    const y = Number(transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    // `height` adalah tinggi glyph di ruang perangkat; `transform[3]` adalah
    // skala vertikal matriks teks. Salah satunya cukup untuk memperkirakan
    // ukuran huruf.
    const size = Math.abs(candidate.height || 0) || Math.abs(Number(transform[3]) || 0) || 10;

    chunks.push({
      text: candidate.str,
      x,
      y,
      width: Math.abs(candidate.width || 0),
      size,
    });
  }

  return chunks;
}

function joinChunks(chunks: TextChunk[]): TextLine {
  const ordered = [...chunks].sort((a, b) => a.x - b.x);
  const size = Math.max(...ordered.map((chunk) => chunk.size));

  let text = "";
  let previousEnd: number | null = null;

  for (const chunk of ordered) {
    // Jarak antar potongan yang cukup lebar menandakan spasi yang tidak
    // disertakan PDF, mis. pada kolom tabel.
    if (previousEnd !== null && chunk.x - previousEnd > size * 0.28 && !text.endsWith(" ")) {
      text += " ";
    }
    text += chunk.text;
    previousEnd = chunk.x + chunk.width;
  }

  return {
    text: text.replace(/\s+/g, " ").trim(),
    x: ordered[0].x,
    y: ordered[0].y,
    size,
  };
}

/**
 * Gabungkan baris menjadi paragraf berdasarkan jarak vertikal.
 *
 * Baris yang berdekatan dianggap satu paragraf; lompatan yang lebih besar dari
 * 1,6× jarak baris biasa dianggap paragraf baru.
 */
function groupBlocks(lines: TextLine[]): TextBlock[] {
  const usable = lines.filter((line) => line.text.length > 0);
  if (usable.length === 0) return [];

  const gaps: number[] = [];
  for (let i = 1; i < usable.length; i += 1) {
    const gap = usable[i - 1].y - usable[i].y;
    if (gap > 0) gaps.push(gap);
  }
  const typicalGap = median(gaps) || median(usable.map((line) => line.size)) * 1.2;

  const blocks: TextBlock[] = [];
  let text = usable[0].text;
  let size = usable[0].size;

  for (let i = 1; i < usable.length; i += 1) {
    const gap = usable[i - 1].y - usable[i].y;
    const previousSize = usable[i - 1].size;
    const currentSize = usable[i].size;
    // Judul dan badan teks sering berjarak baris biasa, jadi perubahan ukuran
    // huruf dipakai sebagai penanda paragraf baru.
    const sizeChanged = currentSize > previousSize * 1.25 || previousSize > currentSize * 1.25;
    const startsListItem = LIST_ITEM_START.test(usable[i].text);

    if (startsListItem || sizeChanged || gap > typicalGap * 1.6) {
      blocks.push({ text, size });
      text = usable[i].text;
      size = usable[i].size;
      continue;
    }

    text += ` ${usable[i].text}`;
    size = Math.max(size, usable[i].size);
  }
  blocks.push({ text, size });

  return blocks;
}

function blocksToParagraphs(blocks: TextBlock[]): Paragraph[] {
  return blocks.map(
    (block) =>
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: block.text,
            size: Math.round(clamp(block.size, MIN_FONT_PT, MAX_FONT_PT) * 2),
          }),
        ],
      })
  );
}

async function pageImageParagraph(page: PDFPageProxy): Promise<Paragraph> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2, RENDER_TARGET_WIDTH / base.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new StudioError("EXPORT_FAILED", "Kanvas tidak tersedia di peramban ini.");
  }

  // Latar putih eksplisit: halaman tanpa latar akan transparan dan tampak
  // hitam saat dibuka di Word.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, viewport }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) {
    throw new StudioError("EXPORT_FAILED", "Halaman gambar gagal disusun.");
  }

  const width = Math.min(CONTENT_WIDTH_PX, Math.round((base.width * 96) / 72));
  const height = Math.round(width * (base.height / base.width));

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "png",
        data: new Uint8Array(await blob.arrayBuffer()),
        transformation: { width, height },
      }),
    ],
  });
}

/** Jumlah halaman tanpa membuka seluruh isi dokumen. */
export async function countPdfPages(file: File, password?: string): Promise<number> {
  const opened = await openPdf(await file.arrayBuffer(), password);
  const total = opened.pdf.numPages;
  void opened.destroy().catch(() => {});
  return total;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}
