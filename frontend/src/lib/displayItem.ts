import type { FileType } from "./fileTypes";

// Bentuk item yang dipakai seluruh UI. Backend mengirim NasFileNode, sedangkan
// berkas lokal (IndexedDB) dipetakan ke bentuk yang sama supaya komponen tidak
// perlu tahu asal datanya.
export interface DisplayItem {
  id: string;
  name: string;
  type: FileType;
  sizeStr: string;
  sizeBytes: number;
  updatedAt: string;
  /** Waktu asli dalam ISO, dipakai untuk pengelompokan per bulan. */
  updatedAtISO?: string;
  parentId?: string | null;
  ownerId?: string | null;
  sha256?: string;
  isFavorite?: boolean;
  duration?: string;
  dimensions?: string;
  blob?: Blob;
  /** Sumber penyimpanan khusus untuk tindakan non-destruktif / penyalinan lintas penyimpanan. */
  source?: "local" | "gdrive" | "hdd";
  /** URL unduhan/streaming langsung (mis. dari HDD 500GB atau Google Drive). */
  downloadUrl?: string;
  /** URL pratinjau/thumbnail khusus (mis. dari Google Drive atau HDD 500GB). */
  previewUrl?: string;
  /** Menandakan berkas dikunci baca-saja (mis. HDD 500GB data lama). */
  readOnly?: boolean;
}

/**
 * Menggabungkan dua daftar item tanpa duplikat id. Item dari `primary` menang,
 * karena daftar itu yang sedang ditampilkan (mis. hasil server) sedangkan
 * `extra` hanya pelengkap (mis. berkas lokal di perangkat).
 */
export function mergeDisplayItems(primary: DisplayItem[], extra: DisplayItem[]): DisplayItem[] {
  const map = new Map<string, DisplayItem>();
  for (const item of primary) map.set(item.id, item);
  for (const item of extra) if (!map.has(item.id)) map.set(item.id, item);
  return Array.from(map.values());
}
