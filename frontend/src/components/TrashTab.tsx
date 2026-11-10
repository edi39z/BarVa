"use client";

import React from "react";
import {
  CornerLeftUp,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  RefreshCw,
  Trash2,
  WifiOff,
} from "lucide-react";
import type { TrashedNode } from "@/lib/api/nas";
import { formatBytes } from "@/lib/nasDisplay";

interface TrashTabProps {
  items: TrashedNode[];
  loading: boolean;
  error: string;
  busyId: string | null;
  currentUserId?: string | null;
  onReload: () => void;
  onRestore: (node: TrashedNode) => void;
  onPurge: (node: TrashedNode) => void;
}

export default function TrashTab({
  items,
  loading,
  error,
  busyId,
  currentUserId,
  onReload,
  onRestore,
  onPurge,
}: TrashTabProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24 lg:pb-6">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-warn-border bg-warn-soft px-3.5 py-3">
        <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-warn">Item di Sampah belum terhapus permanen</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-warn/90">
            Pulihkan untuk mengembalikan item ke folder asalnya. Hapus permanen membebaskan ruang
            dan tidak bisa dibatalkan.
          </p>
        </div>
        <button onClick={onReload} disabled={loading} className="btn btn-sm btn-secondary">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Muat ulang
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-danger-border bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>Gagal memuat sampah: {error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface px-4 py-16 text-center">
          <Trash2 className="h-10 w-10 text-subtle" aria-hidden />
          <p className="text-[13.5px] font-semibold text-fg">Sampah kosong</p>
          <p className="max-w-sm text-[12px] leading-relaxed text-subtle">
            Berkas yang Anda hapus akan muncul di sini dan masih bisa dipulihkan.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((node) => {
            const mime = (node.MimeType || "").toLowerCase();
            const busy = busyId === node.ID;
            return (
              <li key={node.ID} className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                    {node.IsDirectory ? (
                      <Folder className="h-5 w-5 text-[var(--tile-blue-fg)]" aria-hidden />
                    ) : mime.startsWith("image/") ? (
                      <ImageIcon className="h-5 w-5 text-[var(--tile-purple-fg)]" aria-hidden />
                    ) : mime.startsWith("video/") || mime.startsWith("audio/") ? (
                      <Film className="h-5 w-5 text-[var(--tile-green-fg)]" aria-hidden />
                    ) : (
                      <FileText className="h-5 w-5 text-muted" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-fg" title={node.Name}>
                      {node.Name}
                    </p>
                    <p className="truncate text-[11.5px] text-subtle">
                      {node.ParentName || "Semua File"} ·{" "}
                      {node.IsDirectory ? "Folder" : formatBytes(node.SizeBytes ?? 0)}
                      {node.DeletedAt
                        ? ` · dihapus ${new Date(node.DeletedAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : ""}
                    </p>
                    {currentUserId && node.OwnerID !== currentUserId && (
                      <span className="chip chip-warn mt-1">Milik anggota lain</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => onRestore(node)}
                    disabled={busy}
                    className="btn btn-sm border-success-border bg-success-soft text-success"
                    title="Pulihkan ke folder asal"
                  >
                    <CornerLeftUp className="h-3.5 w-3.5" aria-hidden />
                    Pulihkan
                  </button>
                  <button
                    onClick={() => onPurge(node)}
                    disabled={busy}
                    className="btn btn-sm btn-danger"
                    title="Hapus permanen"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Hapus permanen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
