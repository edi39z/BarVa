// Ekstraksi teks di browser untuk pencarian isi mode standalone.
//
// Format yang didukung sama dengan backend: PDF, DOCX, dan teks biasa. Hasil
// disimpan per berkas di IndexedDB agar pencarian tidak mengekstrak ulang.

import { extractPdfText } from "@/lib/studio/pdfText";
import { saveLocalText } from "@/lib/storage/indexeddb";
import { readZipEntry } from "@/lib/storage/zip";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 256 * 1024;
const MAX_PDF_PAGES = 300;

const PLAIN_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".log",
  ".json",
  ".xml",
  ".html",
  ".htm",
]);

export interface ExtractedText {
  text: string;
  supported: boolean;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Rapikan whitespace dan potong teks agar sama dengan aturan backend. */
export function normalizeExtractedText(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const kept: string[] = [];
  let blank = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      if (blank) continue;
      blank = true;
    } else {
      blank = false;
    }
    kept.push(line);
  }

  return kept.join("\n").trim().slice(0, MAX_TEXT_CHARS);
}

/** Ambil teks paragraf dari word/document.xml tanpa parser XML penuh. */
function docxXmlToText(xml: string): string {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((paragraph) => {
      const runs = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
      return runs
        .map((run) => run.replace(/^<w:t[^>]*>/, "").replace(/<\/w:t>$/, ""))
        .join("");
    })
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function extractFileText(file: File): Promise<ExtractedText> {
  if (file.size > MAX_SOURCE_BYTES) {
    return { text: "", supported: false };
  }

  const ext = extensionOf(file.name);
  try {
    if (ext === ".pdf") {
      const text = await extractPdfText(file, { maxPages: MAX_PDF_PAGES });
      return { text: normalizeExtractedText(text), supported: true };
    }

    if (ext === ".docx") {
      const xml = await readZipEntry(file, "word/document.xml", MAX_TEXT_CHARS * 4);
      if (xml === null) return { text: "", supported: false };
      return { text: normalizeExtractedText(docxXmlToText(xml)), supported: true };
    }

    if (PLAIN_EXTENSIONS.has(ext)) {
      const text = await file.slice(0, MAX_TEXT_CHARS).text();
      if (text.includes("\u0000")) return { text: "", supported: false };
      return { text: normalizeExtractedText(text), supported: true };
    }
  } catch {
    // Berkas rusak atau terenkripsi: perlakukan seperti format tak didukung.
    return { text: "", supported: false };
  }

  return { text: "", supported: false };
}

/** Ekstrak lalu simpan teks berkas lokal. Kegagalan tidak mengganggu upload. */
export async function indexLocalFileText(id: string, file: File): Promise<void> {
  const { text, supported } = await extractFileText(file);
  if (!supported) return;
  await saveLocalText(id, text);
}

/** Cari teks di seluruh indeks lokal; hasil diurutkan dari yang terbaru. */
export function matchLocalTexts(
  entries: { id: string; text: string }[],
  query: string
): Map<string, string> {
  const needle = query.toLowerCase();
  const matches = new Map<string, string>();

  for (const entry of entries) {
    const position = entry.text.toLowerCase().indexOf(needle);
    if (position < 0) continue;
    const start = Math.max(0, position - 60);
    matches.set(entry.id, entry.text.slice(start, start + 220));
  }

  return matches;
}
