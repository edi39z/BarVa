"use client";

import React from "react";
import { ChevronRight, Folder, FolderInput, RefreshCw, X } from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";

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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <FolderInput className="h-4 w-4 text-amber-400" />
            <span>Pindahkan Item</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          Pilih folder tujuan untuk <span className="text-zinc-200 font-medium">{item.name}</span>.
        </p>

        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 flex-wrap bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
          {crumbs.map((c, i) => (
            <React.Fragment key={`${c.id}-${i}`}>
              {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-600" />}
              <button
                onClick={() => onNavigate(c.id, c.name, i + 1)}
                className="hover:text-white cursor-pointer"
              >
                {c.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1.5">
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-zinc-400 text-xs">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Memuat folder...</span>
            </div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">Tidak ada subfolder di sini.</p>
          ) : (
            folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onNavigate(f.id, f.name)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-left cursor-pointer"
              >
                <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="text-xs text-zinc-200 truncate">{f.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-600 ml-auto" />
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {busy ? "Memindahkan..." : "Pindahkan ke Sini"}
          </button>
        </div>
      </div>
    </div>
  );
}
