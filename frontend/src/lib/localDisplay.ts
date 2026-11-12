import type { DisplayItem } from "@/lib/displayItem";
import { formatBytes } from "@/lib/nasDisplay";
import type { StoredFile } from "@/lib/storage/indexeddb";

/**
 * Petakan record IndexedDB ke bentuk yang dipakai UI. Dipakai loader halaman,
 * unggahan, dan hasil Studio supaya ketiganya menampilkan item dengan bentuk
 * yang sama (termasuk `parentId` untuk navigasi folder).
 */
export function storedFileToDisplay(file: StoredFile, updatedAtLabel?: string): DisplayItem {
  const timestamp = file.updatedAt || file.createdAt;
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    sizeStr: file.isDirectory ? "Folder" : formatBytes(file.size),
    sizeBytes: file.size,
    updatedAt:
      updatedAtLabel ??
      new Date(timestamp).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    updatedAtISO: timestamp || undefined,
    parentId: file.parentId,
    sha256: file.sha256
      ? `${file.sha256.substring(0, 8)}...${file.sha256.substring(file.sha256.length - 8)}`
      : undefined,
    isFavorite: file.isFavorite,
    blob: file.blob,
  };
}
