"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listNasTrash,
  purgeNasFile,
  restoreNasFile,
  type NasUser,
  type TrashedNode,
} from "@/lib/api/nas";
import type { ConnectionMode } from "@/lib/types";

interface UseTrashOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
  /** Dipanggil setelah item dipulihkan supaya daftar folder ikut disegarkan. */
  onRestored: () => void | Promise<void>;
}

/**
 * State Trash NAS: daftar item terhapus, pemulihan, dan hapus permanen.
 *
 * Pemulihan mengembalikan item ke folder asalnya, jadi daftar folder perlu
 * dimuat ulang lewat `onRestored` — hook ini tidak tahu folder mana yang
 * sedang dibuka.
 */
export function useTrash({ connectionMode, currentUser, onRestored }: UseTrashOptions) {
  const [items, setItems] = useState<TrashedNode[]>([]);
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
    if (connectionMode !== "nas" || !currentUser) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setItems(await listNasTrash());
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
    async (node: TrashedNode) => {
      setBusyId(node.ID);
      try {
        await restoreNasFile(node.ID);
        await Promise.all([reload(), onRestoredRef.current()]);
      } catch (err) {
        alert(`Gagal memulihkan: ${(err as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  /** Hapus permanen. Tidak ada undo, jadi minta konfirmasi eksplisit. */
  const purge = useCallback(
    async (node: TrashedNode) => {
      const kind = node.IsDirectory ? "folder ini beserta seluruh isinya" : `"${node.Name}"`;
      if (!confirm(`Hapus permanen ${kind}?\n\nTindakan ini tidak bisa dibatalkan.`)) return;

      setBusyId(node.ID);
      try {
        await purgeNasFile(node.ID);
        await reload();
      } catch (err) {
        alert(`Gagal menghapus permanen: ${(err as Error).message}`);
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  return useMemo(
    () => ({ items, loading, error, busyId, reload, restore, purge }),
    [items, loading, error, busyId, reload, restore, purge]
  );
}
