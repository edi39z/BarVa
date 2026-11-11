"use client";

import { useCallback, useMemo, useState } from "react";

export interface SelectModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/**
 * State seleksi banyak item untuk daftar berkas dan galeri.
 *
 * `anchorId` dipakai untuk Shift+klik: rentang dihitung dari item terakhir yang
 * diklik tanpa Shift sampai item yang diklik dengan Shift.
 */
export function useFileSelection() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState(false);
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const start = useCallback(() => setMode(true), []);

  const clear = useCallback(() => {
    setSelectedIds([]);
    setAnchorId(null);
    setMode(false);
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setAnchorId(id);
    setMode(true);
  }, []);

  const selectRange = useCallback((orderedIds: string[], fromId: string, toId: string) => {
    const from = orderedIds.indexOf(fromId);
    const to = orderedIds.indexOf(toId);
    if (from < 0 || to < 0) {
      setSelectedIds([toId]);
      setAnchorId(toId);
      return;
    }

    const [startIndex, endIndex] = from <= to ? [from, to] : [to, from];
    setSelectedIds(orderedIds.slice(startIndex, endIndex + 1));
    setMode(true);
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    setMode(true);
  }, []);

  const replace = useCallback((ids: string[]) => setSelectedIds(ids), []);

  return {
    selectedIds,
    selected,
    mode,
    anchorId,
    isSelected,
    start,
    clear,
    toggle,
    selectRange,
    selectAll,
    replace,
    count: selectedIds.length,
  };
}

export type FileSelection = ReturnType<typeof useFileSelection>;
