"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  BG_MODEL_READY_KEY,
  enhancePhoto,
  removeImageBackground,
  type BgProgress,
  type EnhanceResult,
} from "@/lib/studio/ai";
import { compressAndResizeImage, type CompressionResult } from "@/lib/studio/image";
import { describeStudioError, type StudioErrorInfo } from "@/lib/studio/errors";
import { imagesToPDF, mergePDFs } from "@/lib/studio/pdf";
import {
  downloadBlob,
  makeImageOutput,
  makePdfOutput,
  persistStudioOutput,
  type StudioOutput,
} from "@/lib/studio/output";
import { PANEL_TOOLS, type StudioToolId } from "@/lib/studio/tools";
import type { DisplayItem } from "@/lib/displayItem";
import { FileTooLargeError, MAX_PROCESS_BYTES, itemToFile } from "@/lib/files/materialize";
import { formatBytes } from "@/lib/nasDisplay";
import type { AppTab, ConnectionMode } from "@/lib/types";

interface UseStudioOptions {
  connectionMode: ConnectionMode;
  currentFolderId: string | null;
  localItems: DisplayItem[];
  setLocalItems: React.Dispatch<React.SetStateAction<DisplayItem[]>>;
  /** Menyegarkan daftar folder/galeri/trash setelah hasil disimpan. */
  refreshLibrary: () => Promise<void>;
  /** Unggah hasil olahan tanpa menimpa berkas lain. */
  uploadWithUniqueName: (file: File, parentId: string | null) => Promise<unknown>;
  setActiveTab: (tab: AppTab) => void;
}

/**
 * State dan aksi Studio: alat aktif, status pemrosesan, hasil kompresi/AI,
 * pemilih berkas, serta penyimpanan hasil olahan.
 *
 * Seluruh pemrosesan berjalan di perangkat. Hasil hanya menyentuh server saat
 * `commitStudioOutput` menyimpannya ke pustaka aktif (NAS atau IndexedDB).
 */
export function useStudio({
  connectionMode,
  currentFolderId,
  localItems,
  setLocalItems,
  refreshLibrary,
  uploadWithUniqueName,
  setActiveTab,
}: UseStudioOptions) {
  const [activeTool, setActiveTool] = useState<StudioToolId>("img2pdf");
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState<StudioErrorInfo | null>(null);
  // Berkas dari Storage Picker yang menunggu diolah panel alatnya sendiri.
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  // Pemilih berkas lokal untuk alat Studio.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTool, setPickerTool] = useState<StudioToolId>("img2pdf");
  const [selectedStorageIds, setSelectedStorageIds] = useState<string[]>([]);

  const [compressQuality, setCompressQuality] = useState<number>(0.75);
  const [lastCompressResult, setLastCompressResult] = useState<CompressionResult | null>(null);

  // Alat AI: hapus latar belakang (model diunduh sekali) + peningkatan foto.
  const [bgModelJustDownloaded, setBgModelJustDownloaded] = useState(false);
  const [bgConsentGranted, setBgConsentGranted] = useState(false);
  const [bgProgress, setBgProgress] = useState<BgProgress | null>(null);
  const [bgTolerance, setBgTolerance] = useState(15);
  const [bgDropShadow, setBgDropShadow] = useState(true);
  const [lastEnhanceResult, setLastEnhanceResult] = useState<EnhanceResult | null>(null);

  // Model hapus latar belakang cukup diunduh sekali per perangkat.
  const bgModelStored = React.useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return window.localStorage.getItem(BG_MODEL_READY_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );
  const bgModelReady = bgModelStored || bgModelJustDownloaded;

  const img2PdfRef = useRef<HTMLInputElement>(null);
  const mergePdfRef = useRef<HTMLInputElement>(null);
  const compressRef = useRef<HTMLInputElement>(null);
  const removeBgRef = useRef<HTMLInputElement>(null);
  const enhanceRef = useRef<HTMLInputElement>(null);

  /**
   * Unduh hasil olahan lalu simpan ke pustaka yang sedang aktif.
   *
   * Mode NAS: hasil diunggah balik ke folder asal. Mode standalone: disimpan ke
   * IndexedDB. Unduhan dilakukan lebih dulu supaya berkas tetap sampai ke
   * pengguna walau penyimpanan gagal.
   */
  const commitStudioOutput = useCallback(
    async (
      output: StudioOutput,
      options: { download?: boolean; parentId?: string | null } = {}
    ): Promise<{ saved: boolean }> => {
      const download = options.download ?? true;
      const parentId = options.parentId ?? currentFolderId;

      if (download) downloadBlob(output.blob, output.filename);

      try {
        if (connectionMode === "nas") {
          const file = new File([output.blob], output.filename, {
            type: output.mimeType || "application/octet-stream",
          });
          await uploadWithUniqueName(file, parentId);
          await refreshLibrary();
        } else {
          const item = await persistStudioOutput(output, parentId);
          setLocalItems((prev) => [item, ...prev]);
        }
        return { saved: true };
      } catch (err) {
        setError(describeStudioError(err));
        return { saved: false };
      }
    },
    [currentFolderId, connectionMode, refreshLibrary, uploadWithUniqueName, setLocalItems]
  );

  // Model hapus latar sudah ada di perangkat: simpan penandanya supaya kartu
  // persetujuan unduhan tidak muncul lagi setelah halaman dimuat ulang.
  const markBgModelReady = useCallback(() => {
    try {
      window.localStorage.setItem(BG_MODEL_READY_KEY, "1");
    } catch {
      // abaikan: penanda ini hanya untuk kenyamanan antarmuka
    }
    setBgModelJustDownloaded(true);
  }, []);

  // Beberapa alat menolak berkas yang jumlahnya kurang. Pesannya sama polanya,
  // jadi disusun di satu tempat agar tidak muncul sebagai `alert()` terpisah.
  const notifyIncompleteInput = useCallback((message: string, hint?: string) => {
    setError({ code: "INPUT_INCOMPLETE", title: "Berkas belum cukup", message, hint, tone: "warn" });
  }, []);

  const openStoragePicker = useCallback((tool: StudioToolId) => {
    setPickerTool(tool);
    setSelectedStorageIds([]);
    setPickerOpen(true);
  }, []);

  /**
   * Jalankan satu alat Studio atas berkas yang sudah ada di memori.
   * Alat berpanel hanya dipindahkan ke tab Studio; alat one-shot langsung
   * menghasilkan berkas lalu menyimpannya lewat `commitStudioOutput`.
   */
  const runTool = async (
    tool: StudioToolId,
    files: File[],
    options: { download?: boolean; parentId?: string | null } = {}
  ) => {
    const parentId = options.parentId ?? currentFolderId;
    const download = options.download ?? true;

    if (PANEL_TOOLS.includes(tool)) {
      setPickedFile(files[0]);
      setActiveTool(tool);
      setActiveTab("studio");
      return;
    }

    if (tool === "img2pdf") {
      const pdfBytes = await imagesToPDF(files);
      const filename = `Foto_Dokumen_${Date.now()}.pdf`;
      await commitStudioOutput(makePdfOutput(pdfBytes, filename), { parentId, download });
      setSuccessMsg(`Berhasil! ${files.length} foto digabung menjadi ${filename}.`);
      return;
    }

    if (tool === "mergepdf") {
      if (files.length < 2) {
        notifyIncompleteInput(
          "Penggabungan butuh dua berkas PDF atau lebih.",
          "Pilih minimal dua berkas PDF."
        );
        return;
      }
      const mergedBytes = await mergePDFs(files);
      const filename = `Merged_Document_${Date.now()}.pdf`;
      await commitStudioOutput(makePdfOutput(mergedBytes, filename), { parentId, download });
      setSuccessMsg(`Berhasil! ${files.length} berkas PDF digabung menjadi ${filename}.`);
      return;
    }

    if (tool === "compress") {
      const result = await compressAndResizeImage(files[0], 1920, compressQuality, "image/jpeg");
      setLastCompressResult(result);
      const filename = `Compressed_${files[0].name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`),
        { parentId, download }
      );
      setSuccessMsg(
        `Kompresi selesai! Ukuran berkurang ${result.savingsPercent}% (dari ${formatBytes(result.originalSize)} menjadi ${formatBytes(result.compressedSize)}).`
      );
      return;
    }

    if (tool === "removebg") {
      const result = await removeImageBackground(files[0], setBgProgress, {
        tolerance: bgTolerance,
        dropShadow: bgDropShadow,
      });
      const filename = `TanpaLatar_${files[0].name.replace(/\.[^/.]+$/, "")}.png`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`),
        { parentId, download }
      );
      markBgModelReady();
      setSuccessMsg(`Latar belakang ${files[0].name} berhasil dihapus sebagai ${filename}.`);
      return;
    }

    if (tool === "enhance") {
      const result = await enhancePhoto(files[0]);
      setLastEnhanceResult(result);
      const filename = `Diperjelas_${files[0].name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`),
        { parentId, download }
      );
      setSuccessMsg(`Foto diperjelas menjadi ${result.width} × ${result.height} px.`);
      return;
    }

    throw new Error("Alat Studio tidak dikenal.");
  };

  const executeStorageSelection = async () => {
    if (selectedStorageIds.length === 0) {
      notifyIncompleteInput("Pilih minimal satu berkas dari penyimpanan.");
      return;
    }

    setProcessing(true);
    setSuccessMsg("");
    setError(null);
    setPickerOpen(false);

    try {
      const selectedItems = localItems.filter((i) => selectedStorageIds.includes(i.id));
      const files: File[] = [];

      for (const item of selectedItems) {
        if (item.blob) {
          files.push(new File([item.blob], item.name, { type: item.blob.type || "application/octet-stream" }));
        }
      }

      if (files.length === 0) {
        setError({
          code: "IMAGE_INVALID",
          title: "Berkas tidak bisa dibaca",
          message: "Isi berkas ini belum tersedia di memori perangkat.",
          hint: "Buka berkasnya sekali dari daftar utama, lalu ulangi.",
          tone: "danger",
        });
        return;
      }

      await runTool(pickerTool, files);
    } catch (err) {
      console.error(err);
      setError(describeStudioError(err));
    } finally {
      setProcessing(false);
      setBgProgress(null);
    }
  };

  // Studio: Images to PDF
  const imagesToPdfHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setProcessing(true);
    setSuccessMsg("");
    setError(null);
    try {
      const pdfBytes = await imagesToPDF(Array.from(files));
      const filename = `Foto_Dokumen_${Date.now()}.pdf`;

      await commitStudioOutput(makePdfOutput(pdfBytes, filename));

      setSuccessMsg(`Berhasil! ${files.length} foto digabung menjadi ${filename} dan tersimpan di penyimpanan lokal.`);
    } catch (err) {
      console.error(err);
      setError(describeStudioError(err));
    } finally {
      setProcessing(false);
      if (img2PdfRef.current) img2PdfRef.current.value = "";
    }
  };

  // Studio: Merge PDFs
  const mergePdfsHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length < 2) {
      notifyIncompleteInput(
        "Penggabungan butuh dua berkas PDF atau lebih.",
        "Tahan Ctrl (Windows) atau Shift saat memilih agar beberapa berkas ikut terpilih."
      );
      if (mergePdfRef.current) mergePdfRef.current.value = "";
      return;
    }

    setProcessing(true);
    setSuccessMsg("");
    setError(null);
    try {
      const mergedBytes = await mergePDFs(Array.from(files));
      const filename = `Merged_Document_${Date.now()}.pdf`;

      await commitStudioOutput(makePdfOutput(mergedBytes, filename));

      setSuccessMsg(`Berhasil! ${files.length} dokumen PDF telah digabung menjadi ${filename}.`);
    } catch (err) {
      console.error(err);
      setError(describeStudioError(err));
    } finally {
      setProcessing(false);
      if (mergePdfRef.current) mergePdfRef.current.value = "";
    }
  };

  // Studio: Compress Image
  const compressImageHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setProcessing(true);
    setSuccessMsg("");
    setError(null);
    try {
      const file = files[0];
      const result = await compressAndResizeImage(file, 1920, compressQuality, "image/jpeg");
      setLastCompressResult(result);

      const filename = `Compressed_${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`)
      );

      setSuccessMsg(`Kompresi selesai! Ukuran berkurang ${result.savingsPercent}% (dari ${formatBytes(result.originalSize)} menjadi ${formatBytes(result.compressedSize)}).`);
    } catch (err) {
      console.error(err);
      setError(describeStudioError(err));
    } finally {
      setProcessing(false);
      if (compressRef.current) compressRef.current.value = "";
    }
  };

  // Studio: Hapus latar belakang (model ISNet, berjalan di perangkat)
  const removeBackgroundHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setProcessing(true);
    setSuccessMsg("");
    setError(null);
    setBgProgress({ phase: "download", percent: 0 });

    try {
      const file = files[0];
      const result = await removeImageBackground(file, setBgProgress, {
        tolerance: bgTolerance,
        dropShadow: bgDropShadow,
      });
      const filename = `TanpaLatar_${file.name.replace(/\.[^/.]+$/, "")}.png`;

      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`)
      );

      markBgModelReady();
      setSuccessMsg(`Latar belakang berhasil dihapus. Hasil disimpan sebagai ${filename}.`);
    } catch (err) {
      console.error(err);
      setError(describeStudioError(err));
    } finally {
      setBgProgress(null);
      setProcessing(false);
      if (removeBgRef.current) removeBgRef.current.value = "";
    }
  };

  // Studio: Naikkan kualitas foto (perbesar 2x + penajaman, tanpa model)
  const enhancePhotoHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setProcessing(true);
    setSuccessMsg("");
    setError(null);

    try {
      const file = files[0];
      const result = await enhancePhoto(file);
      setLastEnhanceResult(result);

      const filename = `Diperjelas_${file.name.replace(/\.[^/.]+$/, "")}.jpg`;
      await commitStudioOutput(
        makeImageOutput(result.blob, filename, `${result.width} × ${result.height}`)
      );

      setSuccessMsg(
        `Foto diperjelas menjadi ${result.width} × ${result.height} px (sebelumnya ${result.originalWidth} × ${result.originalHeight} px).`
      );
    } catch (err) {
      console.error(err);
      setError(describeStudioError(err));
    } finally {
      setProcessing(false);
      if (enhanceRef.current) enhanceRef.current.value = "";
    }
  };

  /** Jalankan alat Studio untuk item yang mungkin masih di server. */
  const processItemsWithTool = async (
    tool: StudioToolId,
    items: DisplayItem[],
    options: { download?: boolean; parentId?: string | null } = {}
  ): Promise<boolean> => {
    setProcessing(true);
    setSuccessMsg("");
    setError(null);

    try {
      const files: File[] = [];
      for (const item of items) {
        files.push(await itemToFile(item, connectionMode));
      }
      await runTool(tool, files, options);
      return true;
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        setError({
          code: "UNKNOWN",
          title: "Berkas terlalu besar",
          message: `Batas pemrosesan di perangkat ini ${formatBytes(MAX_PROCESS_BYTES)} per berkas.`,
          hint: "Kompres atau pecah berkasnya lebih dulu, lalu coba lagi.",
          tone: "danger",
        });
      } else {
        const info = describeStudioError(err);
        setError(
          info.code === "UNKNOWN" && err instanceof Error
            ? { ...info, message: err.message }
            : info
        );
      }
      return false;
    } finally {
      setProcessing(false);
      setBgProgress(null);
    }
  };

  return {
    activeTool,
    setActiveTool,
    processing,
    successMsg,
    setSuccessMsg,
    error,
    setError,
    pickedFile,
    setPickedFile,
    pickerOpen,
    pickerTool,
    selectedStorageIds,
    setSelectedStorageIds,
    compressQuality,
    setCompressQuality,
    lastCompressResult,
    bgModelReady,
    bgConsentGranted,
    setBgConsentGranted,
    bgProgress,
    bgTolerance,
    setBgTolerance,
    bgDropShadow,
    setBgDropShadow,
    lastEnhanceResult,
    img2PdfRef,
    mergePdfRef,
    compressRef,
    removeBgRef,
    enhanceRef,
    commitStudioOutput,
    markBgModelReady,
    openStoragePicker,
    executeStorageSelection,
    onImagesToPDF: imagesToPdfHandler,
    onMergePDFs: mergePdfsHandler,
    onCompressImage: compressImageHandler,
    onRemoveBackground: removeBackgroundHandler,
    onEnhancePhoto: enhancePhotoHandler,
    processItemsWithTool,
    closeStoragePicker: () => setPickerOpen(false),
  };
}
