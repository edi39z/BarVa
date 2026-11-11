"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countQueuedUploads,
  enqueueUpload,
  saveLocalFile,
  saveLocalText,
} from "@/lib/storage/indexeddb";
import { flushUploadQueue } from "@/lib/uploadQueue";
import { extractFileText, indexLocalFileText } from "@/lib/storage/textIndex";
import { fetchMe, uploadToNas, type NasUser } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import { detectFileType } from "@/lib/fileTypes";
import { formatBytes } from "@/lib/nasDisplay";
import type { ConnectionMode } from "@/lib/types";

const PLAIN_TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".log", ".json", ".xml", ".html", ".htm"]);

interface UseUploadsOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
  currentFolderId: string | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<NasUser | null>>;
  setLocalItems: React.Dispatch<React.SetStateAction<DisplayItem[]>>;
  /** Dipanggil setelah unggahan masuk supaya daftar folder ikut disegarkan. */
  onUploaded: () => void | Promise<void>;
}

/**
 * Unggahan berkas dua mode beserta antrean offline.
 *
 * Mode NAS mengalirkan berkas ke server; bila jaringan putus atau server tidak
 * terjangkau, berkas disimpan di antrean IndexedDB dan dikirim otomatis saat
 * koneksi kembali. Mode standalone langsung menyimpan ke IndexedDB.
 */
export function useUploads({
  connectionMode,
  currentUser,
  currentFolderId,
  setCurrentUser,
  setLocalItems,
  onUploaded,
}: UseUploadsOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [pendingUploads, setPendingUploads] = useState(0);
  const [flushingQueue, setFlushingQueue] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Callback disimpan di ref supaya efek antrean tidak dijalankan ulang hanya
  // karena pemanggil mengirim arrow function baru setiap render.
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  /**
   * Unggah hasil olahan tanpa menimpa berkas lain. Bila nama sudah dipakai,
   * coba lagi dengan akhiran " (2)", " (3)", dan seterusnya.
   */
  const uploadWithUniqueName = useCallback(async (file: File, parentId: string | null) => {
    try {
      return await uploadToNas(file, parentId, undefined, false);
    } catch (err) {
      if (!/sudah ada/i.test((err as Error).message)) throw err;

      const dot = file.name.lastIndexOf(".");
      const base = dot > 0 ? file.name.slice(0, dot) : file.name;
      const extension = dot > 0 ? file.name.slice(dot) : "";

      for (let attempt = 2; attempt <= 20; attempt += 1) {
        const candidate = new File([file], `${base} (${attempt})${extension}`, { type: file.type });
        try {
          return await uploadToNas(candidate, parentId, undefined, false);
        } catch (nextError) {
          if (!/sudah ada/i.test((nextError as Error).message)) throw nextError;
        }
      }

      throw new Error("Nama berkas hasil bentrok. Ganti nama berkas lalu coba lagi.");
    }
  }, []);

  /** Simpan berkas ke antrean IndexedDB saat server tidak terjangkau. */
  const queueOfflineUpload = useCallback(
    async (file: File) => {
      try {
        await enqueueUpload(file.name, file, currentFolderId, false, file.type);
        setPendingUploads(await countQueuedUploads());
        alert(
          `"${file.name}" disimpan di antrean dan akan diunggah otomatis saat koneksi ke server kembali.`
        );
      } catch (err) {
        alert(`Gagal menyimpan ke antrean offline: ${(err as Error).message}`);
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [currentFolderId]
  );

  /** Kirim seluruh antrean offline secara manual dari panel folder. */
  const flushQueue = useCallback(async () => {
    setFlushingQueue(true);
    try {
      const result = await flushUploadQueue();
      setPendingUploads(result.pending);
      if (result.uploaded > 0) await onUploadedRef.current();
    } finally {
      setFlushingQueue(false);
    }
  }, []);

  const uploadSingleFile = useCallback(
    async (file: File) => {
      setUploadFileName(file.name);
      setIsUploading(true);
      setUploadProgress(10);

      try {
        const type = detectFileType({ mime: file.type, name: file.name });

        // Mode NAS: unggah ke server, lalu ambil ulang daftar dari server
        // supaya yang tampil adalah data nyata, bukan salinan lokal.
        if (connectionMode === "nas") {
          if (!navigator.onLine) {
            await queueOfflineUpload(file);
            return;
          }

          const report = (percent: number) => setUploadProgress(Math.max(10, percent));
          try {
            await uploadToNas(file, currentFolderId, report);
          } catch (err) {
            const msg = (err as Error).message || "";
            // Server tidak terjangkau (bukan penolakan validasi): antrekan.
            if (!/sudah ada/i.test(msg) && (err instanceof TypeError || /fetch|network|jaringan/i.test(msg))) {
              await queueOfflineUpload(file);
              return;
            }
            // Backend menolak nama duplikat; tawarkan ganti, jangan langsung gagal.
            if (!/sudah ada/i.test(msg)) throw err;
            if (!confirm(`"${file.name}" sudah ada di folder ini. Ganti dengan versi baru?`)) {
              setIsUploading(false);
              return;
            }
            await uploadToNas(file, currentFolderId, report, true);
          }
          setUploadProgress(100);
          await onUploadedRef.current();
          // Segarkan pemakaian kuota yang tampil di sidebar.
          try {
            const me = await fetchMe();
            if (me) setCurrentUser(me);
          } catch {
            // Diabaikan: angka kuota boleh tertinggal, unggahan sudah berhasil.
          }
          setTimeout(() => {
            setIsUploading(false);
          }, 400);
          return;
        }

        // Mode standalone: simpan di IndexedDB browser.
        setUploadProgress(85);
        const saved = await saveLocalFile(file.name, file, type, file.type);
        setUploadProgress(100);

        const newItem: DisplayItem = {
          id: saved.id,
          name: saved.name,
          type: saved.type,
          sizeStr: formatBytes(saved.size),
          sizeBytes: saved.size,
          updatedAt: "Baru saja",
          updatedAtISO: saved.updatedAt,
          parentId: currentFolderId,
          sha256: saved.sha256 ? `${saved.sha256.substring(0, 8)}...${saved.sha256.substring(saved.sha256.length - 8)}` : undefined,
          isFavorite: false,
          blob: file,
        };

        setLocalItems((prev) => [newItem, ...prev]);

        // Indeks teks untuk pencarian isi. Teks biasa diekstrak sekarang agar
        // hasilnya langsung tersedia; PDF/DOCX di latar belakang.
        const ext = saved.name.slice(saved.name.lastIndexOf(".")).toLowerCase();
        if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
          const { text, supported } = await extractFileText(file);
          if (supported) await saveLocalText(saved.id, text);
        } else {
          void indexLocalFileText(saved.id, file);
        }

        setTimeout(() => {
          setIsUploading(false);
        }, 400);
      } catch (err) {
        console.error("Upload error:", err);
        alert(`Gagal menyimpan file: ${(err as Error).message}`);
        setIsUploading(false);
      }
    },
    [connectionMode, currentFolderId, queueOfflineUpload, setCurrentUser, setLocalItems]
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
      for (const file of arr) {
        await uploadSingleFile(file);
      }
    },
    [uploadSingleFile]
  );

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files;
      if (!picked || picked.length === 0) return;
      try {
        await uploadFiles(picked);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [uploadFiles]
  );

  // Kirim antrean upload begitu koneksi kembali, dan segarkan jumlah antrean.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;

    let alive = true;
    const syncCount = () =>
      countQueuedUploads()
        .then((n) => {
          if (alive) setPendingUploads(n);
        })
        .catch(() => undefined);

    const run = async () => {
      if (!navigator.onLine) {
        syncCount();
        return;
      }
      const result = await flushUploadQueue();
      if (!alive) return;
      setPendingUploads(result.pending);
      if (result.uploaded > 0) await onUploadedRef.current();
    };

    syncCount();
    run();
    window.addEventListener("online", run);
    return () => {
      alive = false;
      window.removeEventListener("online", run);
    };
  }, [connectionMode, currentUser]);

  return useMemo(
    () => ({
      isUploading,
      uploadProgress,
      uploadFileName,
      pendingUploads,
      flushingQueue,
      fileInputRef,
      uploadWithUniqueName,
      flushQueue,
      uploadFiles,
      handleFileInputChange,
    }),
    [
      isUploading,
      uploadProgress,
      uploadFileName,
      pendingUploads,
      flushingQueue,
      uploadWithUniqueName,
      flushQueue,
      uploadFiles,
      handleFileInputChange,
    ]
  );
}
