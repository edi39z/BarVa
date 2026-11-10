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
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 flex items-start gap-3">
        <Trash2 className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-200">Item di Trash belum benar-benar dihapus</p>
          <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
            Pulihkan untuk mengembalikan item ke folder asalnya. Hapus permanen membebaskan ruang
            penyimpanan dan tidak bisa dibatalkan.
          </p>
        </div>
        <button
          onClick={onReload}
          disabled={loading}
          className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          <span>Muat ulang</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 bg-rose-950/50 border border-rose-800/60 text-rose-300">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>Gagal memuat trash: {error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/20">
          <Trash2 className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-300">Trash kosong</p>
          <p className="text-xs text-zinc-500 mt-1">
            Item yang kamu hapus dari file manager akan muncul di sini dan bisa dipulihkan.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/20">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="py-2.5 px-4 font-medium">Nama</th>
                <th className="py-2.5 px-4 font-medium">Lokasi Asal</th>
                <th className="py-2.5 px-4 font-medium">Ukuran</th>
                <th className="py-2.5 px-4 font-medium">Dihapus</th>
                <th className="py-2.5 px-4 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {items.map((node) => {
                const mime = (node.MimeType || "").toLowerCase();
                const busy = busyId === node.ID;
                return (
                  <tr key={node.ID} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-zinc-200">
                      <div className="flex items-center gap-2 min-w-0">
                        {node.IsDirectory ? (
                          <Folder className="h-4 w-4 text-blue-400 shrink-0" />
                        ) : mime.startsWith("image/") ? (
                          <ImageIcon className="h-4 w-4 text-purple-400 shrink-0" />
                        ) : mime.startsWith("video/") || mime.startsWith("audio/") ? (
                          <Film className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                        )}
                        <span className="truncate max-w-[18rem]" title={node.Name}>
                          {node.Name}
                        </span>
                        {currentUserId && node.OwnerID !== currentUserId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                            Milik anggota lain
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-zinc-400">{node.ParentName || "Semua File"}</td>
                    <td className="py-2.5 px-4 font-mono text-zinc-400">
                      {node.IsDirectory ? "Folder" : formatBytes(node.SizeBytes ?? 0)}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-400">
                      {node.DeletedAt
                        ? new Date(node.DeletedAt).toLocaleString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onRestore(node)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-40"
                          title="Pulihkan ke folder asal"
                        >
                          <CornerLeftUp className="h-3 w-3" />
                          <span>Pulihkan</span>
                        </button>
                        <button
                          onClick={() => onPurge(node)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-40"
                          title="Hapus permanen"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Hapus permanen</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
