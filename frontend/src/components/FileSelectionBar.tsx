"use client";

import React from "react";
import {
  Download,
  FileText,
  FolderInput,
  FolderPlus,
  FolderTree,
  Layers,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import type { FileAction, FileActionId } from "@/lib/files/actions";

const ACTION_ICONS: Partial<Record<FileActionId, React.ElementType>> = {
  download: Download,
  move: FolderInput,
  delete: Trash2,
  removebg: Wand2,
  compress: Sparkles,
  enhance: Zap,
  img2pdf: Layers,
  mergepdf: FileText,
  newfolder: FolderPlus,
  "group-type": FolderTree,
  "group-month": FolderTree,
};

interface FileSelectionBarProps {
  count: number;
  actions: FileAction[];
  busy: boolean;
  onAction: (action: FileAction) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export default function FileSelectionBar({
  count,
  actions,
  busy,
  onAction,
  onSelectAll,
  onClear,
}: FileSelectionBarProps) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-3 lg:bottom-6">
      <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-pop">
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-[12.5px] font-semibold text-fg">{count} item dipilih</p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onSelectAll} disabled={busy} className="btn btn-ghost btn-sm">
              Pilih semua
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              className="icon-btn h-8 w-8"
              aria-label="Batal memilih"
              title="Batal memilih"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action.id];
            return (
              <button
                key={action.id}
                type="button"
                disabled={busy}
                onClick={() => onAction(action)}
                className={`btn btn-sm shrink-0 ${action.destructive ? "btn-danger" : "btn-secondary"}`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
