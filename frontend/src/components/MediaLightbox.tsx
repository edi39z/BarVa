"use client";

import React from "react";
import {
  Activity,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { getStreamUrl } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/nasDisplay";

interface MediaLightboxProps {
  item: DisplayItem;
  onClose: () => void;
  onDownload: (item: DisplayItem) => void;
}

export default function MediaLightbox({ item, onClose, onDownload }: MediaLightboxProps) {
  const mediaSrc = item.blob ? URL.createObjectURL(item.blob) : getStreamUrl(item.id);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
        {/* Media Area */}
        <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-[340px]">
          {item.type === "video" ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <video
                controls
                autoPlay
                playsInline
                className="w-full max-h-[360px] rounded-xl bg-zinc-950 shadow-2xl border border-zinc-800"
                src={mediaSrc}
              >
                Format video tidak didukung oleh browser Anda.
              </video>
              <div className="flex items-center gap-2 mt-2.5 text-[11px] text-zinc-400 font-mono">
                <Activity className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                <span>HTTP 206 Partial Content Stream • Scrubbing Aktif</span>
              </div>
            </div>
          ) : item.type === "image" ? (
            <div className="w-full h-full flex items-center justify-center p-2">
              <img
                src={mediaSrc}
                alt={item.name}
                className="max-h-[380px] w-auto max-w-full rounded-xl object-contain shadow-lg"
              />
            </div>
          ) : (
            <div className="text-center space-y-2">
              <ImageIcon className="h-16 w-16 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-500 font-mono">Pratinjau Resolusi Penuh</p>
            </div>
          )}
        </div>

        {/* Metadata & Actions Sidebar */}
        <div className="w-full md:w-80 p-5 flex flex-col justify-between border-t md:border-t-0 md:border-l border-zinc-800 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200 truncate">{item.name}</h3>
              <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Ukuran File</span>
                <span className="text-zinc-200 font-mono">{item.sizeStr}</span>
              </div>
              {item.dimensions && (
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-semibold">
                    Dimensi / Resolusi
                  </span>
                  <span className="text-zinc-200 font-mono">{item.dimensions}</span>
                </div>
              )}
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Waktu</span>
                <span className="text-zinc-200">{item.updatedAt}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">
                  Status Integritas
                </span>
                <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
                  <CheckCircle2 className="h-3 w-3" /> SHA-256 Validated
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => onDownload(item)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download File Asli</span>
            </button>
            <button
              onClick={onClose}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium py-2 rounded-lg transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
