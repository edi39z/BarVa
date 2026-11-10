"use client";

import React from "react";
import { ChevronRight, Folder, FolderInput, RefreshCw } from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";
import Modal from "@/components/Modal";

interface MoveItemModalProps {
  item: DisplayItem;
  crumbs: { id: string | null; name: string }[];
  folders: DisplayItem[];
  loading: boolean;
  busy: boolean;
  onNavigate: (id: string | null, name: string, crumbIndex?: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function MoveItemModal({
  item,
  crumbs,
  folders,
  loading,
  busy,
  onNavigate,
  onConfirm,
  onClose,
}: MoveItemModalProps) {
  return (
    <Modal
      title="Pindahkan item"
      description={`Pilih folder tujuan untuk “${item.name}”.`}
      icon={<FolderInput className="h-4 w-4" aria-hidden />}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Batal
          </button>
          <button onClick={onConfirm} disabled={busy} className="btn btn-primary">
            {busy ? "Memindahkan…" : "Pindahkan ke sini"}
          </button>
        </>
      }
    >
      <nav
        aria-label="Lokasi folder tujuan"
        className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[11.5px] text-muted"
      >
        {crumbs.map((c, i) => (
          <React.Fragment key={`${c.id ?? "root"}-${i}`}>
            {i > 0 && <ChevronRight className="h-3 w-3 text-subtle" aria-hidden />}
            <button
              onClick={() => onNavigate(c.id, c.name, i + 1)}
              className="rounded px-1 py-0.5 transition-colors hover:text-fg"
            >
              {c.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            Memuat folder…
          </div>
        ) : folders.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-subtle">Tidak ada subfolder di sini.</p>
        ) : (
          folders.map((f) => (
            <button
              key={f.id}
              onClick={() => onNavigate(f.id, f.name)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-brand-border hover:bg-brand-soft/50"
            >
              <Folder className="h-4 w-4 shrink-0 text-[var(--tile-blue-fg)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{f.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
