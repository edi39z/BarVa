"use client";

import React from "react";
import { Share2, X } from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";

export type ShareExpiry = "24h" | "7d" | "30d" | "never";
export type SharePermission = "viewer" | "uploader";

interface ShareLinkModalProps {
  item: DisplayItem;
  expiry: ShareExpiry;
  onExpiryChange: (value: ShareExpiry) => void;
  permission: SharePermission;
  onPermissionChange: (value: SharePermission) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  generatedUrl: string;
  generated: boolean;
  generating: boolean;
  onGenerate: () => void;
  onClose: () => void;
}

export default function ShareLinkModal({
  item,
  expiry,
  onExpiryChange,
  permission,
  onPermissionChange,
  password,
  onPasswordChange,
  generatedUrl,
  generated,
  generating,
  onGenerate,
  onClose,
}: ShareLinkModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
            <Share2 className="h-4 w-4 text-blue-400" />
            <span>Bagikan Link Aman</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          Buat link unduh publik untuk file <span className="text-zinc-200 font-medium">{item.name}</span>.
        </p>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Batas Waktu Kedaluwarsa</label>
            <select
              value={expiry}
              onChange={(e) => onExpiryChange(e.target.value as ShareExpiry)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="24h">24 Jam (1 Hari)</option>
              <option value="7d">7 Hari</option>
              <option value="30d">30 Hari</option>
              <option value="never">Tanpa Batas Waktu</option>
            </select>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Izin Akses</label>
            <select
              value={permission}
              onChange={(e) => onPermissionChange(e.target.value as SharePermission)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="viewer">Viewer (Hanya Melihat & Unduh)</option>
              <option value="uploader">Uploader (Bisa Unggah File Tambahan)</option>
            </select>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1 font-medium">Proteksi Password (Opsional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Masukkan password jika diperlukan..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {generated ? (
            <div className="bg-zinc-950 border border-blue-500/40 p-3 rounded-xl space-y-2">
              <span className="text-[10px] text-blue-400 font-semibold uppercase">
                Link Publik Terenkripsi Aktif
              </span>
              <div className="flex items-center justify-between bg-zinc-900 p-2 rounded-lg font-mono text-[11px] text-zinc-300">
                <span className="truncate">{generatedUrl}</span>
                <button
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                      navigator.clipboard.writeText(generatedUrl);
                    }
                    alert("Link berhasil disalin ke clipboard!");
                  }}
                  className="text-blue-400 hover:text-blue-300 ml-2 font-sans font-medium cursor-pointer"
                >
                  Salin
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors mt-2 cursor-pointer shadow-sm shadow-blue-600/30"
            >
              {generating ? "Membuat link..." : "Generate Link Berbagi"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
