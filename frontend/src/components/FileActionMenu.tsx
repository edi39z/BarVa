"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileArchive,
  FileText,
  FileType2,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Layers,
  PanelsTopLeft,
  Pencil,
  Scissors,
  Share2,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import type { DisplayItem } from "@/lib/displayItem";
import type { FileAction, FileActionId } from "@/lib/files/actions";
import Modal from "@/components/Modal";

const ACTION_ICONS: Record<FileActionId, React.ElementType> = {
  open: FolderOpen,
  download: Download,
  archive: FileArchive,
  rename: Pencil,
  move: FolderInput,
  share: Share2,
  delete: Trash2,
  removebg: Wand2,
  compress: Sparkles,
  enhance: Zap,
  idphoto: Scissors,
  img2pdf: Layers,
  pdf2word: FileType2,
  pdfedit: PanelsTopLeft,
  mergepdf: FileText,
  newfolder: FolderPlus,
  "group-type": FolderTree,
  "group-month": FolderTree,
};

interface FileActionMenuProps {
  item: DisplayItem;
  actions: FileAction[];
  /** Posisi klik/tombol; dipakai untuk popover di desktop. */
  anchor: { x: number; y: number };
  onAction: (action: FileAction) => void;
  onClose: () => void;
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return coarse;
}

function ActionList({
  actions,
  onAction,
  autoFocus,
}: {
  actions: FileAction[];
  onAction: (action: FileAction) => void;
  autoFocus?: boolean;
}) {
  const smart = actions.filter((action) => action.group === "smart");
  const manage = actions.filter((action) => action.group === "manage");

  const renderGroup = (items: FileAction[], label: string) => {
    if (items.length === 0) return null;
    return (
      <div key={label}>
        <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">
          {label}
        </p>
        {items.map((action, index) => {
          const Icon = ACTION_ICONS[action.id] ?? Eye;
          return (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              data-menu-item
              autoFocus={autoFocus && label === "Alat pintar" && index === 0}
              onClick={() => onAction(action)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-surface-2 ${
                action.destructive ? "text-danger" : "text-fg"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {renderGroup(smart, "Alat pintar")}
      {renderGroup(manage, "Kelola")}
    </div>
  );
}

export default function FileActionMenu({
  item,
  actions,
  anchor,
  onAction,
  onClose,
}: FileActionMenuProps) {
  const coarse = useCoarsePointer();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(anchor);

  useLayoutEffect(() => {
    if (coarse) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const x = Math.min(Math.max(8, anchor.x), Math.max(8, window.innerWidth - rect.width - 8));
    const y = Math.min(Math.max(8, anchor.y), Math.max(8, window.innerHeight - rect.height - 8));
    setPosition({ x, y });
  }, [anchor, coarse]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]");
      if (!items || items.length === 0) return;
      event.preventDefault();
      const list = Array.from(items);
      const current = list.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "ArrowDown"
          ? list[(current + 1 + list.length) % list.length]
          : list[(current - 1 + list.length) % list.length];
      next.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLElement>("[data-menu-item]")?.focus();

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);

  if (coarse) {
    return (
      <Modal
        title={item.name}
        description={`${item.type === "folder" ? "Folder" : item.sizeStr} · pilih aksi`}
        icon={<FolderOpen className="h-4 w-4" aria-hidden />}
        onClose={onClose}
        size="sm"
      >
        <div role="menu" aria-label={`Aksi untuk ${item.name}`}>
          <ActionList actions={actions} onAction={onAction} autoFocus />
        </div>
      </Modal>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label={`Aksi untuk ${item.name}`}
        className="absolute w-64 rounded-xl border border-line bg-surface p-1.5 shadow-pop"
        style={{ left: position.x, top: position.y }}
      >
        <div className="border-b border-line px-2.5 pb-2 pt-1.5">
          <p className="truncate text-[12.5px] font-semibold text-fg">{item.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-subtle">
            {item.type === "folder" ? "Folder" : `${item.sizeStr} · ${item.updatedAt}`}
          </p>
        </div>
        <div className="pt-1">
          <ActionList actions={actions} onAction={onAction} autoFocus />
        </div>
      </div>
    </div>
  );
}
