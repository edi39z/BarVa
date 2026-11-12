"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  searchNasContent,
  type NasUser,
} from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import { nasNodeToDisplay } from "@/lib/nasDisplay";
import {
  getAllLocalFiles,
  getAllLocalTexts,
  saveLocalText,
} from "@/lib/storage/indexeddb";
import { extractFileText, matchLocalTexts } from "@/lib/storage/textIndex";
import { visibleLocalFiles } from "@/lib/storage/localTree";
import type { ConnectionMode } from "@/lib/types";

export type SearchScope = "name" | "content";

/** Minimal tiga karakter: indeks trigram baru efektif pada panjang itu. */
export const MIN_CONTENT_QUERY = 3;

const DEBOUNCE_MS = 300;
const LOCAL_BACKFILL_LIMIT = 50;

export interface ContentSearchResult {
  item: DisplayItem;
  snippet: string;
  /** Nama folder asal; "Semua File" bila berkas ada di akar. */
  folderName: string;
}

interface UseContentSearchOptions {
  connectionMode: ConnectionMode;
  currentUser: NasUser | null;
  query: string;
  scope: SearchScope;
  localItems: DisplayItem[];
}

/**
 * Pencarian isi dokumen lintas folder.
 *
 * Mode NAS memakai endpoint `/search`; mode standalone memakai indeks teks di
 * IndexedDB. Hook tidak melakukan apa pun selama scope bukan "content",
 * sehingga mode mandiri tidak pernah memanggil server.
 */
export function useContentSearch({
  connectionMode,
  currentUser,
  query,
  scope,
  localItems,
}: UseContentSearchOptions) {
  const [results, setResults] = useState<ContentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false);

  const backfillStartedRef = useRef(false);

  const trimmed = query.trim();
  const active = scope === "content" && trimmed.length >= MIN_CONTENT_QUERY;
  const isNas = connectionMode === "nas" && Boolean(currentUser);

  /** Indeks berkas lokal lama sekali per sesi, maksimal 50 berkas. */
  const ensureLocalIndex = useCallback(async () => {
    if (backfillStartedRef.current) return;
    backfillStartedRef.current = true;

    // Hanya berkas yang terlihat: isi Sampah (dan keturunan folder yang
    // dihapus) tidak boleh muncul di hasil pencarian.
    const files = visibleLocalFiles(await getAllLocalFiles());
    const existing = await getAllLocalTexts();
    const indexed = new Set(existing.map((entry) => entry.id));
    const missing = files
      .filter((file) => file.blob && !indexed.has(file.id))
      .slice(0, LOCAL_BACKFILL_LIMIT);

    if (missing.length === 0) return;

    setIndexing(true);
    try {
      for (const stored of missing) {
        if (!stored.blob) continue;
        const file = new File([stored.blob], stored.name, { type: stored.mimeType });
        const { text, supported } = await extractFileText(file);
        if (supported) await saveLocalText(stored.id, text);
      }
    } finally {
      setIndexing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    if (isNas) {
      const controller = new AbortController();
      const timer = setTimeout(async () => {
        setSearching(true);
        setError("");
        try {
          const rows = await searchNasContent(trimmed, controller.signal);
          if (controller.signal.aborted) return;
          setResults(
            rows.map((row) => ({
              item: nasNodeToDisplay(row),
              snippet: row.Snippet,
              folderName: row.ParentName || "Semua File",
            }))
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          setError((err as Error).message);
          setResults([]);
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      }, DEBOUNCE_MS);

      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }

    let alive = true;
    void (async () => {
      setSearching(true);
      try {
        await ensureLocalIndex();
        if (!alive) return;

        // Dibaca ulang tiap pencarian: unggahan baru menambah teks ke indeks,
        // sedangkan backfill hanya berjalan sekali per sesi.
        const texts = await getAllLocalTexts();
        if (!alive) return;

        const matches = matchLocalTexts(
          texts.map((entry) => ({ id: entry.id, text: entry.text })),
          trimmed
        );
        const byId = new Map(localItems.map((item) => [item.id, item]));
        const folderNames = new Map(
          localItems.filter((item) => item.type === "folder").map((item) => [item.id, item.name])
        );

        const found: ContentSearchResult[] = [];
        for (const [id, snippet] of matches) {
          const item = byId.get(id);
          if (!item) continue;
          found.push({
            item,
            snippet,
            folderName: (item.parentId && folderNames.get(item.parentId)) || "Semua File",
          });
        }
        found.sort((a, b) => (b.item.updatedAtISO ?? "").localeCompare(a.item.updatedAtISO ?? ""));

        setResults(found);
        setError("");
      } catch (err) {
        if (!alive) return;
        setError((err as Error).message);
        setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [active, isNas, trimmed, localItems, ensureLocalIndex]);

  return useMemo(
    () => ({
      // Hasil lama tidak boleh tampil saat kueri terlalu pendek.
      results: active ? results : [],
      searching: active ? searching : false,
      error: active ? error : "",
      indexing,
      minQuery: MIN_CONTENT_QUERY,
    }),
    [active, results, searching, error, indexing]
  );
}
