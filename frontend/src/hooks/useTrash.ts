"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listNasTrash, purgeNasFile, restoreNasFile, type NasUser } from "@/lib/api/nas";
import { getAllLocalFiles, purgeLocalNode, restoreLocalNode } from "@/lib/storage/indexeddb";
import { trashedLocalFiles } from "@/lib/storage/localTree";
import { localTrashToItem, nasTrashToItem, type TrashItem } from "@/lib/trash";
import type { ConnectionMode } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmProvider";

interface UseTrashOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
  /** Dipanggil setelah item dipulihkan supaya daftar folder ikut disegarkan. */
  onRestored: () => void | Promise<void>;
}

/**
 * State Sampah untuk kedua mode: daftar item terhapus, pemulihan, dan hapus
 * permanen. Mode NAS memakai endpoint `/trash`; mode standalone membaca record
 * `deletedAt` dari IndexedDB.
 *
 * Pemulihan mengembalikan item ke folder asalnya, jadi daftar folder perlu
 * dimuat ulang lewat `onRestored` — hook ini tidak tahu folder mana yang
 * sedang dibuka.
 */
export function useTrash({ connectionMode, currentUser, onRestored }: UseTrashOptions) {
  const { confirm, notify } = useConfirm();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Callback disimpan di ref supaya identitas `restore` tidak berubah hanya
  // karena pemanggil mengirim arrow function baru setiap render.
  const onRestoredRef = useRef(onRestored);
  useEffect(() => {
    onRestoredRef.current = onRestored;
  }, [onRestored]);

  const reload = useCallback(async () => {
    if (connectionMode === "nas" && !currentUser) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (connectionMode === "nas") {
        setItems((await listNasTrash()).map(nasTrashToItem));
        return;
      }

      const all = await getAllLocalFiles();
      const names = new Map(all.map((file) => [file.id, file.name]));
      setItems(
        trashedLocalFiles(all)
          .map((file) =>
            localTrashToItem(file, file.parentId ? names.get(file.parentId) ?? null : null)
          )
          .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
      );
    } catch (err) {
      setItems([]);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [connectionMode, currentUser]);

  useEffect(() => {
    // Indikator loading dinyalakan sinkron oleh `reload`; itu bagian dari efek
    // samping fetch, bukan state turunan yang bisa dipakai di render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  /** Pulihkan item yang salah terhapus ke folder asalnya. */
  const restore = useCallback(
    async (item: TrashItem) => {
      setBusyId(item.id);
      try {
        if (connectionMode === "nas") {
          await restoreNasFile(item.id);
        } else {
          const { movedToRoot } = await restoreLocalNode(item.id);
          if (movedToRoot) {
            await notify({
              title: "Dipulihkan ke Semua File",
              message: `Folder asal untuk "${item.name}" tidak ditemukan, jadi item dipulihkan ke akar.`,
              tone: "info",
            });
          }
        }
        await Promise.all([reload(), onRestoredRef.current()]);
      } catch (err) {
        await notify({
          title: "Gagal memulihkan",
          message: (err as Error).message,
          tone: "danger",
        });
      } finally {
        setBusyId(null);
      }
    },
    [connectionMode, reload, notify]
  );

  /** Hapus permanen. Tidak ada undo, jadi minta konfirmasi eksplisit. */
  const purge = useCallback(
    async (item: TrashItem) => {
      const kind = item.isDirectory ? "folder ini beserta seluruh isinya" : `"${item.name}"`;
      const lanjut = await confirm({
        title: "Hapus permanen?",
        message: `Hapus permanen ${kind}?\n\nTindakan ini tidak bisa dibatalkan.`,
        tone: "danger",
        confirmLabel: "Hapus permanen",
      });
      if (!lanjut) return;

      setBusyId(item.id);
      try {
        if (connectionMode === "nas") {
          await purgeNasFile(item.id);
        } else {
          await purgeLocalNode(item.id);
        }
        await reload();
      } catch (err) {
        await notify({
          title: "Gagal menghapus permanen",
          message: (err as Error).message,
          tone: "danger",
        });
      } finally {
        setBusyId(null);
      }
    },
    [connectionMode, reload, confirm, notify]
  );

  return useMemo(
    () => ({ items, loading, error, busyId, reload, restore, purge }),
    [items, loading, error, busyId, reload, restore, purge]
  );
}
