"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listNasFiles, listNasMedia, type NasUser } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import { nasNodeToDisplay } from "@/lib/nasDisplay";
import type { AppTab, ConnectionMode } from "@/lib/types";

export interface FolderCrumb {
  id: string | null;
  name: string;
}

interface UseNasFilesOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
  activeTab: AppTab;
}

const ROOT_CRUMB: FolderCrumb = { id: null, name: "Semua File" };

/**
 * Daftar berkas NAS untuk folder yang sedang dibuka, media lintas folder untuk
 * galeri, dan navigasi folder (breadcrumb, masuk, kembali).
 *
 * `items` hanya berisi isi folder aktif; `mediaItems` sengaja terpisah karena
 * galeri menampilkan seluruh media tanpa memuat pohon berkas.
 */
export function useNasFiles({ connectionMode, currentUser, activeTab }: UseNasFilesOptions) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mediaItems, setMediaItems] = useState<DisplayItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderCrumb[]>([ROOT_CRUMB]);

  const reload = useCallback(
    async (parentId: string | null = currentFolderId) => {
      setLoading(true);
      setError("");
      try {
        const nodes = await listNasFiles(parentId);
        setItems(nodes.map(nasNodeToDisplay));
      } catch (err) {
        setItems([]);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [currentFolderId]
  );

  const reloadMedia = useCallback(async () => {
    try {
      setMediaItems((await listNasMedia()).map(nasNodeToDisplay));
    } catch {
      // Biarkan daftar lama; galeri memuat ulang saat tabnya dibuka lagi.
    }
  }, []);

  // Di luar mode NAS, `items` yang tersisa tidak pernah dirender karena
  // `activeItems` memilih `localItems`. Jadi tidak perlu direset lewat setState.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;
    // Pemuat menyalakan indikator loading secara sinkron supaya UI langsung
    // bereaksi; itu bagian dari efek samping fetch, bukan state turunan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [connectionMode, currentUser, reload]);

  // Galeri memuat media lintas folder setiap kali tabnya dibuka, supaya
  // unggahan/hapus terbaru langsung terlihat tanpa memuat seluruh pohon berkas.
  useEffect(() => {
    if (connectionMode !== "nas" || !currentUser) return;
    if (activeTab !== "gallery") return;

    let cancelled = false;
    listNasMedia()
      .then((nodes) => {
        if (!cancelled) setMediaItems(nodes.map(nasNodeToDisplay));
      })
      .catch(() => {
        if (!cancelled) setMediaItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [connectionMode, currentUser, activeTab]);

  const openFolder = useCallback((folder: DisplayItem) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  }, []);

  const navigateBreadcrumb = useCallback((targetId: string | null, index: number) => {
    setCurrentFolderId(targetId);
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  }, []);

  const goBack = useCallback(() => {
    if (breadcrumbs.length <= 1) return;
    const next = breadcrumbs.slice(0, -1);
    setBreadcrumbs(next);
    setCurrentFolderId(next[next.length - 1].id);
  }, [breadcrumbs]);

  /** Kembali ke akar. Dipakai saat berganti mode atau folder aktif menghilang. */
  const resetNavigation = useCallback(() => {
    setCurrentFolderId(null);
    setBreadcrumbs([ROOT_CRUMB]);
  }, []);

  /** Buang item dari daftar folder dan galeri tanpa memuat ulang server. */
  const removeLocally = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setMediaItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return useMemo(
    () => ({
      items,
      loading,
      error,
      mediaItems,
      currentFolderId,
      breadcrumbs,
      reload,
      reloadMedia,
      openFolder,
      navigateBreadcrumb,
      goBack,
      resetNavigation,
      removeLocally,
    }),
    [
      items,
      loading,
      error,
      mediaItems,
      currentFolderId,
      breadcrumbs,
      reload,
      reloadMedia,
      openFolder,
      navigateBreadcrumb,
      goBack,
      resetNavigation,
      removeLocally,
    ]
  );
}
