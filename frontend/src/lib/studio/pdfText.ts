// Ekstraksi teks PDF di perangkat, dipakai Studio (PDF → Word) dan indeks
// pencarian isi mode standalone. Dipisah dari pdfToWord agar pemanggil yang
// hanya butuh teks tidak ikut memuat modul penulis .docx.

import { openPdf } from "./pdfjs";

interface TextChunk {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
}

export interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface PdfTextOptions {
  /** Kata sandi untuk PDF terkunci. */
  password?: string;
  /** Batas halaman yang dibaca; berguna untuk indeks pencarian. */
  maxPages?: number;
}

/**
 * Ambil seluruh teks PDF, satu baris per baris visual. Halaman tanpa teks
 * (hasil pindai) menghasilkan string kosong.
 */
export async function extractPdfText(file: File, options: PdfTextOptions = {}): Promise<string> {
  const opened = await openPdf(await file.arrayBuffer(), options.password);
  const total = Math.min(opened.pdf.numPages, options.maxPages ?? opened.pdf.numPages);
  const pages: string[] = [];

  try {
    for (let index = 1; index <= total; index += 1) {
      const page = await opened.pdf.getPage(index);
      const lines = extractLines(await page.getTextContent());
      pages.push(lines.map((line) => line.text).join("\n"));
      page.cleanup();
    }
  } finally {
    void opened.destroy().catch(() => {});
  }

  return pages.join("\n\n");
}

/** Susun potongan teks menjadi baris, lalu baris menjadi paragraf. */
export function extractLines(content: { items: unknown[] }): TextLine[] {
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
