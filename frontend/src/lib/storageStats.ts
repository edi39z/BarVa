import type { DisplayItem } from "./displayItem";

// Perhitungan pemakaian penyimpanan yang dipakai beberapa komponen. Sebelumnya
// Sidebar dan Beranda menghitung sendiri dengan cakupan data berbeda, sehingga
// angka "Ruang terpakai" tidak cocok dengan total di Beranda.

export interface StorageStats {
  totalBytes: number;
  imageBytes: number;
  videoBytes: number;
  documentBytes: number;
  /** Jumlah berkas (folder tidak dihitung). */
  fileCount: number;
  imageCount: number;
  videoCount: number;
}

/** Menghitung ringkasan pemakaian dari satu daftar item. */
export function computeStorageStats(items: DisplayItem[]): StorageStats {
  const stats: StorageStats = {
    totalBytes: 0,
    imageBytes: 0,
    videoBytes: 0,
    documentBytes: 0,
    fileCount: 0,
    imageCount: 0,
    videoCount: 0,
  };

  for (const item of items) {
    if (item.type === "folder") continue;
    const size = item.sizeBytes || 0;
    stats.totalBytes += size;
    stats.fileCount += 1;

    if (item.type === "image") {
      stats.imageBytes += size;
      stats.imageCount += 1;
    } else if (item.type === "video") {
      stats.videoBytes += size;
      stats.videoCount += 1;
    } else {
      stats.documentBytes += size;
    }
  }

  return stats;
}

/**
 * Persentase pemakaian 0–100. Kuota 0 atau negatif berarti belum dibatasi,
 * sehingga bar tidak menampilkan proporsi apa pun.
 */
export function usagePercent(usedBytes: number, quotaBytes: number): number {
  if (quotaBytes <= 0) return 0;
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
}
