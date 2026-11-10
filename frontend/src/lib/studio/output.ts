// Satu tempat untuk menyimpan dan mengunduh hasil olahan Studio.
//
// Sebelumnya blok `saveLocalFile` + `setLocalItems` + anchor unduhan disalin di
// empat tempat di page.tsx, dan tiap alat baru menambah salinan lagi.

import type { DisplayItem } from "@/lib/nasDisplay";
import { formatBytes } from "@/lib/nasDisplay";
import { saveLocalFile } from "@/lib/storage/indexeddb";

export type StudioOutputKind = "image" | "document";

export interface StudioOutput {
  blob: Blob;
  filename: string;
  kind: StudioOutputKind;
  mimeType: string;
  /** Keterangan ukuran untuk daftar berkas, mis. "354 × 472 px". */
  dimensions?: string;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function makeImageOutput(blob: Blob, filename: string, dimensions?: string): StudioOutput {
  return {
    blob,
    filename,
    kind: "image",
    mimeType: blob.type || "image/jpeg",
    dimensions,
  };
}

export function makePdfOutput(bytes: Uint8Array, filename: string): StudioOutput {
  return {
    // `Uint8Array` dari pdf-lib bertipe ArrayBufferLike, sedangkan BlobPart
    // menuntut ArrayBuffer; isinya sendiri tetap byte yang sama.
    blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    filename,
    kind: "document",
    mimeType: "application/pdf",
  };
}

/**
 * Simpan hasil Studio ke IndexedDB lalu kembalikan item untuk daftar tampilan.
 *
 * `id` sengaja diambil dari record yang dibuat `saveLocalFile`. Versi lama
 * membuat `crypto.randomUUID()` sendiri, sehingga id di daftar berbeda dengan
 * id di IndexedDB dan penghapusan berkas hasil Studio tidak menemukan
 * record-nya.
 */
export async function persistStudioOutput(
  output: StudioOutput,
  parentId: string | null
): Promise<DisplayItem> {
  const stored = await saveLocalFile(output.filename, output.blob, output.kind, output.mimeType);

  return {
    id: stored.id,
    name: stored.name,
    type: output.kind,
    sizeStr: formatBytes(output.blob.size),
    sizeBytes: output.blob.size,
    dimensions: output.dimensions,
    updatedAt: "Baru saja (Studio)",
    parentId,
    blob: output.blob,
  };
}
