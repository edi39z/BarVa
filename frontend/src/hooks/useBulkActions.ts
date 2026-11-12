"use client";

import { useCallback, useMemo, useState } from "react";
import { createNasFolder, deleteNasFile, moveNasFile } from "@/lib/api/nas";
import {
  createLocalFolder,
  moveLocalNode,
  trashLocalNode,
} from "@/lib/storage/indexeddb";
import { hasLocalNameConflict } from "@/lib/storage/localTree";
import { groupItems, type FileAction, type GroupMode } from "@/lib/files/actions";
import type { DisplayItem } from "@/lib/displayItem";
import type { StudioToolId } from "@/lib/studio/tools";
import type { ConnectionMode } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmProvider";

interface UseBulkActionsOptions {
  connectionMode: ConnectionMode;
  currentFolderId: string | null;
  /** Item yang sedang tampil, dipakai untuk mencari folder tujuan yang sudah ada. */
  activeItems: DisplayItem[];
  /** Sumber seleksi: daftar folder aktif atau media galeri. */
  selectionSource: DisplayItem[];
  selectedIds: string[];
  clearSelection: () => void;
  refreshLibrary: () => Promise<void>;
  downloadItem: (item: DisplayItem) => void;
  /** Buka dialog pindah untuk satu atau banyak item. */
  requestMove: (items: DisplayItem[]) => void;
  /** Salin berkas ke penyimpanan tujuan tanpa menghapus aslinya. */
  copyItemsToStorage?: (items: DisplayItem[], target: "local" | "gdrive") => Promise<void>;
  /** Penulis notifikasi hasil operasi; state-nya dipegang pemanggil. */
  setLibraryNotice: (notice: string) => void;
  processItemsWithTool: (
    tool: StudioToolId,
    items: DisplayItem[],
    options?: { download?: boolean; parentId?: string | null }
  ) => Promise<boolean>;
}

/**
 * Menu aksi per berkas dan operasi massal: hapus, pindah, unduh, buat folder
 * dari seleksi, pengelompokan otomatis (smart folder), serta menjalankan alat
 * Studio untuk banyak berkas sekaligus.
 *
 * Hook ini tidak memegang data berkas; ia bekerja pada seleksi yang diberikan
 * pemanggil dan meminta penyegaran lewat `refreshLibrary`.
 */
export function useBulkActions({
  connectionMode,
  currentFolderId,
  activeItems,
  selectionSource,
  selectedIds,
  clearSelection,
  refreshLibrary,
  downloadItem,
  requestMove,
  copyItemsToStorage,
  setLibraryNotice,
  processItemsWithTool,
}: UseBulkActionsOptions) {
  const { confirm, notify, ask } = useConfirm();
  // Menu aksi satu berkas (klik kanan / tombol titik tiga).
  const [actionMenuItem, setActionMenuItem] = useState<DisplayItem | null>(null);
  const [actionMenuAnchor, setActionMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  // Status operasi massal dan panel pengelompokan otomatis.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [smartFolderOpen, setSmartFolderOpen] = useState(false);
  const [smartFolderMode, setSmartFolderMode] = useState<GroupMode>("type");

  const selectedItems = useMemo(
    () => selectionSource.filter((item) => selectedIds.includes(item.id)),
    [selectionSource, selectedIds]
  );

  const openFileActionMenu = useCallback((item: DisplayItem, anchor: { x: number; y: number }) => {
    setActionMenuItem(item);
    setActionMenuAnchor(anchor);
  }, []);

  const closeFileActionMenu = useCallback(() => {
    setActionMenuItem(null);
    setActionMenuAnchor(null);
  }, []);

  const bulkDelete = useCallback(
    async (items: DisplayItem[]) => {
      const lanjut = await confirm({
        title: "Pindahkan ke Trash?",
        message: `${items.length} item akan dipindahkan ke Trash. Kamu masih bisa memulihkannya nanti.`,
        tone: "warning",
        confirmLabel: "Pindahkan",
      });
      if (!lanjut) return;

      setBulkBusy(true);
      let failed = 0;
      try {
        for (const item of items) {
          try {
            if (connectionMode === "nas") {
              await deleteNasFile(item.id);
            } else {
              await trashLocalNode(item.id);
            }
          } catch {
            failed += 1;
          }
        }
        clearSelection();
        await refreshLibrary();
        setLibraryNotice(
          failed > 0
            ? `${items.length - failed} item dihapus, ${failed} gagal.`
            : `${items.length} item dihapus.`
        );
      } finally {
        setBulkBusy(false);
      }
    },
    [connectionMode, clearSelection, refreshLibrary, setLibraryNotice, confirm]
  );

  const createFolderFromSelection = useCallback(
    async (items: DisplayItem[]) => {
      const name = await ask({
        title: "Folder baru",
        message: `${items.length} item terpilih akan dipindahkan ke folder ini.`,
        label: "Nama folder",
        placeholder: "mis. Arsip Keluarga",
        confirmLabel: "Buat dan pindahkan",
      });
      if (!name) return;
      const folderName = name.trim();
      if (!folderName) return;

      setBulkBusy(true);
      try {
        if (connectionMode === "nas") {
          const folder = await createNasFolder(folderName, currentFolderId);
          for (const item of items) {
            await moveNasFile(item.id, folder.ID);
          }
        } else {
          if (hasLocalNameConflict(activeItems, currentFolderId, folderName)) {
            throw new Error(`Sudah ada item bernama "${folderName}" di folder ini.`);
          }
          const folder = await createLocalFolder(folderName, currentFolderId);
          for (const item of items) {
            await moveLocalNode(item.id, folder.id);
          }
        }
        await refreshLibrary();
        clearSelection();
        setLibraryNotice(`Folder “${folderName}” dibuat dan ${items.length} item dipindahkan.`);
      } catch (err) {
        await notify({
          title: "Gagal membuat folder",
          message: (err as Error).message,
          tone: "danger",
        });
      } finally {
        setBulkBusy(false);
      }
    },
    [
      connectionMode,
      currentFolderId,
      activeItems,
      clearSelection,
      refreshLibrary,
      setLibraryNotice,
      notify,
      ask,
    ]
  );

  const confirmAutoGroup = useCallback(async () => {
    const items = selectedItems;
    if (items.length === 0) return;

    const groups = groupItems(items, smartFolderMode);
    setBulkBusy(true);

    try {
      if (connectionMode === "nas") {
        for (const group of groups) {
          const existing = activeItems.find(
            (item) =>
              item.type === "folder" &&
              (item.parentId || null) === currentFolderId &&
              item.name === group.name
          );
          const folderId = existing ? existing.id : (await createNasFolder(group.name, currentFolderId)).ID;
          for (const item of group.items) {
            await moveNasFile(item.id, folderId);
          }
        }
      } else {
        for (const group of groups) {
          const existing = activeItems.find(
            (item) =>
              item.type === "folder" &&
              (item.parentId ?? null) === currentFolderId &&
              item.name === group.name
          );
          const folderId = existing
            ? existing.id
            : (await createLocalFolder(group.name, currentFolderId)).id;
          for (const item of group.items) {
            await moveLocalNode(item.id, folderId);
          }
        }
      }
      await refreshLibrary();

      setSmartFolderOpen(false);
      clearSelection();
      setLibraryNotice(`${items.length} item dikelompokkan ke ${groups.length} folder.`);
    } catch (err) {
      await notify({
        title: "Gagal mengelompokkan",
        message: (err as Error).message,
        tone: "danger",
      });
    } finally {
      setBulkBusy(false);
    }
  }, [
    activeItems,
    clearSelection,
    connectionMode,
    currentFolderId,
    refreshLibrary,
    selectedItems,
    setLibraryNotice,
    smartFolderMode,
    notify,
  ]);

  const bulkAction = useCallback(
    async (action: FileAction) => {
      const items = selectedItems;
      if (items.length === 0) return;

      if (action.id === "delete") {
        await bulkDelete(items);
        return;
      }
      if (action.id === "move") {
        requestMove(items);
        return;
      }
      if (action.id === "download") {
        items.forEach((item) => downloadItem(item));
        clearSelection();
        return;
      }
      if ((action.id === "copy-local" || action.id === "copy-gdrive") && copyItemsToStorage) {
        const target = action.id === "copy-local" ? "local" : "gdrive";
        await copyItemsToStorage(items, target);
        clearSelection();
        return;
      }
      if (action.id === "newfolder") {
        await createFolderFromSelection(items);
        return;
      }
      if (action.id === "group-type") {
        setSmartFolderMode("type");
        setSmartFolderOpen(true);
        return;
      }
      if (action.id === "group-month") {
        setSmartFolderMode("month");
        setSmartFolderOpen(true);
        return;
      }

      if (!action.tool) return;

      setBulkBusy(true);
      setLibraryNotice("");
      try {
        if (action.tool === "img2pdf" || action.tool === "mergepdf") {
          setBulkProgress({ current: 1, total: 1, label: action.label });
          await processItemsWithTool(action.tool, items, {
            download: false,
            parentId: currentFolderId,
          });
        } else {
          let failed = 0;
          for (let index = 0; index < items.length; index += 1) {
            setBulkProgress({ current: index + 1, total: items.length, label: action.label });
            const ok = await processItemsWithTool(action.tool, [items[index]], {
              download: false,
              parentId: items[index].parentId ?? currentFolderId,
            });
            if (!ok) failed += 1;
          }
          if (failed > 0) {
            setLibraryNotice(`${items.length - failed} berhasil, ${failed} gagal.`);
          } else {
            setLibraryNotice(`${items.length} berkas selesai diproses.`);
          }
        }
        clearSelection();
      } finally {
        setBulkBusy(false);
        setBulkProgress(null);
      }
    },
    [
      bulkDelete,
      clearSelection,
      copyItemsToStorage,
      createFolderFromSelection,
      currentFolderId,
      downloadItem,
      processItemsWithTool,
      requestMove,
      selectedItems,
      setLibraryNotice,
    ]
  );

  return useMemo(
    () => ({
      actionMenuItem,
      actionMenuAnchor,
      openFileActionMenu,
      closeFileActionMenu,
      bulkBusy,
      bulkProgress,
      smartFolderOpen,
      setSmartFolderOpen,
      smartFolderMode,
      setSmartFolderMode,
      selectedItems,
      bulkDelete,
      createFolderFromSelection,
      confirmAutoGroup,
      bulkAction,
    }),
    [
      actionMenuItem,
      actionMenuAnchor,
      openFileActionMenu,
      closeFileActionMenu,
      bulkBusy,
      bulkProgress,
      smartFolderOpen,
      smartFolderMode,
      selectedItems,
      bulkDelete,
      createFolderFromSelection,
      confirmAutoGroup,
      bulkAction,
    ]
  );
}
