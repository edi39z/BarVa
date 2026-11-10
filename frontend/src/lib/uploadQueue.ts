"use client";

import { uploadToNas } from "@/lib/api/nas";
import {
  deleteQueuedUpload,
  listQueuedUploads,
  markQueuedUploadFailed,
} from "@/lib/storage/indexeddb";

export interface FlushResult {
  uploaded: number;
  failed: number;
  pending: number;
}

/**
 * Mengirim semua upload yang tertunda. Item yang berhasil dihapus dari
 * antrean; yang gagal tetap disimpan beserta pesan error terakhir agar bisa
 * dicoba lagi. Berhenti lebih awal bila koneksi putus di tengah jalan.
 */
export async function flushUploadQueue(): Promise<FlushResult> {
  const queued = await listQueuedUploads();

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { uploaded: 0, failed: 0, pending: queued.length };
  }

  let uploaded = 0;
  let failed = 0;

  for (const item of queued) {
    if (typeof navigator !== "undefined" && !navigator.onLine) break;

    try {
      const file = new File([item.blob], item.name, {
        type: item.mimeType || item.blob.type || "application/octet-stream",
      });
      await uploadToNas(file, item.parentId, undefined, item.overwrite);
      await deleteQueuedUpload(item.id);
      uploaded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengunggah";
      await markQueuedUploadFailed(item.id, message);
      failed += 1;

      // Sesi tidak valid: percuma mencoba item berikutnya.
      if (/sesi berakhir|401/i.test(message)) break;
    }
  }

  const pending = (await listQueuedUploads()).length;
  return { uploaded, failed, pending };
}
