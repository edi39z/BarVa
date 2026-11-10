"use client";

import React from "react";
import {
  ArrowRight,
  Cloud,
  Download,
  FileArchive,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Layers,
  Palette,
  Play,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wand2,
  Wifi,
} from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";
import { formatBytes } from "@/lib/nasDisplay";

export type AppTab = "home" | "files" | "trash" | "gallery" | "studio" | "gdrive" | "shares";
export type StudioTool = "img2pdf" | "mergepdf" | "idphoto" | "compress";

interface HomeDashboardProps {
  activeItems: DisplayItem[];
  localItems: DisplayItem[];
  isGdriveConnected: boolean;
  nasLatency: number | null;
  connectionMode: "standalone" | "nas";
  nasStatus: "online" | "offline" | "checking";
  serverUrl: string;
  onCreateFolder: () => void | Promise<void>;
  onNavigate: (tab: AppTab) => void;
  onOpenStudioTool: (tool: StudioTool) => void;
  onUpload: () => void;
  onDownload: (item: DisplayItem) => void;
  onOpenMedia: (item: DisplayItem) => void;
  onOpenServer: () => void;
}

export default function HomeDashboard({
  activeItems,
  localItems,
  isGdriveConnected,
  nasLatency,
  connectionMode,
  nasStatus,
  serverUrl,
  onCreateFolder,
  onNavigate,
  onOpenStudioTool,
  onUpload,
  onDownload,
  onOpenMedia,
  onOpenServer,
}: HomeDashboardProps) {
  return (
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* 1. Hero Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-zinc-900 to-indigo-950 border border-blue-900/40 p-6 md:p-8 shadow-2xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {connectionMode === "nas" ? (nasStatus === "online" ? "NAS Homelab Terlindungi (Online)" : "NAS Mode Offline") : "Local Standalone Active"}
                </span>
                <span className="text-zinc-500 text-xs">• v1.0.0 Production</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Selamat Datang di NAS Project! 🚀
              </h1>
              <p className="text-xs md:text-sm text-zinc-300 leading-relaxed">
                Pusat digital terpadu untuk berkas pribadi, album kenangan foto, dan alat studio dokumen — tanpa ketergantungan cloud pihak ketiga.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => onNavigate("files")}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <span>Jelajahi Berkas</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onNavigate("studio")}
                className="bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/80 text-zinc-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Buka Studio Tools
              </button>
            </div>
          </div>
        </div>

        {/* 2. Six Category Shortcuts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div
            onClick={() => onNavigate("gallery")}
            className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-purple-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors mb-3">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-purple-400 transition-colors">Galeri Media</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Lihat foto & video</p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("files")}
            className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors mb-3">
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">File Manager</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Kelola direktori & berkas</p>
            </div>
          </div>

          <div
            onClick={() => { onNavigate("studio"); onOpenStudioTool("idphoto"); }}
            className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-3">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">Image Studio</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Pasfoto & kompresi</p>
            </div>
          </div>

          <div
            onClick={() => { onNavigate("studio"); onOpenStudioTool("img2pdf"); }}
            className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-colors mb-3">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-rose-400 transition-colors">Document Studio</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Gabung & olah PDF</p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("gdrive")}
            className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-teal-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:bg-teal-600 group-hover:text-white transition-colors mb-3">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-teal-400 transition-colors">Google Drive</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Integrasi cloud storage</p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("shares")}
            className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-cyan-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] group shadow-sm flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-600 group-hover:text-white transition-colors mb-3">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-cyan-400 transition-colors">Family Space</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">Berbagi & kuota aman</p>
            </div>
          </div>
        </div>

        {/* 3. Middle Bento Row: Memories & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Memories Section (7 Cols) */}
          <div className="lg:col-span-7 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Kenangan Anda (Your Memories)</h2>
                <p className="text-[11px] text-zinc-400">Momen foto dan media yang Anda simpan di perangkat</p>
              </div>
              <button
                onClick={() => onNavigate("gallery")}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>Lihat Semua</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {activeItems.filter((i) => i.type === "image" || i.type === "video").length === 0 ? (
              <div
                onClick={() => onUpload()}
                className="text-center py-10 border-2 border-dashed border-zinc-800 hover:border-blue-500/50 rounded-xl bg-zinc-950/40 cursor-pointer transition-colors"
              >
                <ImageIcon className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-zinc-300">Belum Ada Foto Kenangan</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">Klik di sini untuk mengunggah foto pertama Anda ke album pribadi.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {localItems
                  .filter((i) => i.type === "image" || i.type === "video")
                  .slice(0, 4)
                  .map((media) => (
                    <div
                      key={media.id}
                      onClick={() => onOpenMedia(media)}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 cursor-pointer hover:border-blue-500/50 transition-all"
                    >
                      {media.blob && media.type === "image" ? (
                        <img
                          src={URL.createObjectURL(media.blob)}
                          alt={media.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                          {media.type === "video" ? (
                            <Play className="h-6 w-6 text-blue-400 mb-1" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-purple-400 mb-1" />
                          )}
                          <span className="text-[10px] text-zinc-400 truncate max-w-full">{media.name}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <span className="text-[10px] text-white font-medium truncate">{media.name}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Quick Actions (5 Cols) */}
          <div className="lg:col-span-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Aksi Cepat (Quick Actions)</h2>
              <p className="text-[11px] text-zinc-400">Pintasan alat pemrosesan instan client-side</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => { onNavigate("studio"); onOpenStudioTool("idphoto"); }}
                className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-rose-500/40 text-left transition-all cursor-pointer group"
              >
                <Scissors className="h-4 w-4 text-rose-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-zinc-200">Pasfoto 3x4 / 4x6</p>
                <p className="text-[10px] text-zinc-500">Standar resmi 300 DPI</p>
              </button>

              <button
                onClick={() => { onNavigate("studio"); onOpenStudioTool("compress"); }}
                className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-emerald-500/40 text-left transition-all cursor-pointer group"
              >
                <Sparkles className="h-4 w-4 text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-zinc-200">Kompres Gambar</p>
                <p className="text-[10px] text-zinc-500">Hemat ruang disk</p>
              </button>

              <button
                onClick={() => { onNavigate("studio"); onOpenStudioTool("img2pdf"); }}
                className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-blue-500/40 text-left transition-all cursor-pointer group"
              >
                <Layers className="h-4 w-4 text-blue-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-zinc-200">Foto ke PDF</p>
                <p className="text-[10px] text-zinc-500">Kompilasi jadi 1 berkas</p>
              </button>

              <button
                onClick={() => { onNavigate("studio"); onOpenStudioTool("mergepdf"); }}
                className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-indigo-500/40 text-left transition-all cursor-pointer group"
              >
                <FileText className="h-4 w-4 text-indigo-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-zinc-200">Gabung PDF</p>
                <p className="text-[10px] text-zinc-500">Merge berkas dokumen</p>
              </button>

              <button
                onClick={() => onUpload()}
                className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-amber-500/40 text-left transition-all cursor-pointer group"
              >
                <Upload className="h-4 w-4 text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-zinc-200">Upload Berkas</p>
                <p className="text-[10px] text-zinc-500">Simpan ke device / NAS</p>
              </button>

              <button
                onClick={async () => {
                  await onCreateFolder();
                  onNavigate("files");
                }}
                className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-teal-500/40 text-left transition-all cursor-pointer group"
              >
                <Plus className="h-4 w-4 text-teal-400 mb-1.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs font-semibold text-zinc-200">Folder Baru</p>
                <p className="text-[10px] text-zinc-500">Buat direktori baru</p>
              </button>
            </div>
          </div>
        </div>

        {/* 4. Bottom Bento Row: Recent Files (4 Cols) + Storage Overview (4 Cols) + Family/System Feed (4 Cols) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Col 1: Recent Files */}
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Berkas Terbaru</h3>
              <button
                onClick={() => onNavigate("files")}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
              >
                Lihat Semua →
              </button>
            </div>

            {activeItems.filter((i) => i.type !== "folder").length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-400">Belum ada berkas tersimpan</p>
                <button
                  onClick={() => onUpload()}
                  className="mt-2 text-[11px] text-blue-400 hover:underline cursor-pointer font-medium"
                >
                  + Upload berkas sekarang
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {localItems
                  .filter((i) => i.type !== "folder")
                  .slice(0, 4)
                  .map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                          {file.type === "document" && <FileText className="h-4 w-4 text-blue-400" />}
                          {file.type === "video" && <Film className="h-4 w-4 text-emerald-400" />}
                          {file.type === "image" && <ImageIcon className="h-4 w-4 text-purple-400" />}
                          {file.type === "archive" && <FileArchive className="h-4 w-4 text-amber-400" />}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-medium text-zinc-200 truncate">{file.name}</p>
                          <p className="text-[10px] text-zinc-500">{file.sizeStr} • {file.updatedAt}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => onDownload(file)}
                        className="text-zinc-500 hover:text-white p-1 cursor-pointer"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex items-center justify-between">
              <span>Total Berkas: {activeItems.filter((i) => i.type !== "folder").length} item</span>
              <span className="text-emerald-400 flex items-center gap-1 font-mono">
                <ShieldCheck className="h-3 w-3" /> SHA-256 Integritas
              </span>
            </div>
          </div>

          {/* Col 2: Storage Overview Donut */}
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Ringkasan Penyimpanan</h3>
              <span className="text-[10px] font-mono text-zinc-400">IndexedDB Client</span>
            </div>

            <div className="flex items-center justify-center py-2">
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-zinc-800"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-blue-500 transition-all duration-500"
                    strokeDasharray={`${Math.min(100, Math.max(activeItems.length > 0 ? 8 : 0, Math.round((activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0) / (10 * 1024 * 1024 * 1024)) * 100)))}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-sm font-bold font-mono text-zinc-100">
                    {formatBytes(activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0))}
                  </span>
                  <span className="text-[9px] text-zinc-500">Terpakai</span>
                </div>
              </div>
            </div>

            {/* Storage Breakdown Legend */}
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-500" /> Foto & Media
                </span>
                <span className="font-mono text-zinc-300">
                  {activeItems.filter((i) => i.type === "image").length} file
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Dokumen & PDF
                </span>
                <span className="font-mono text-zinc-300">
                  {activeItems.filter((i) => i.type === "document").length} file
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Video Rekaman
                </span>
                <span className="font-mono text-zinc-300">
                  {activeItems.filter((i) => i.type === "video").length} file
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigate("files")}
              className="w-full text-center text-xs text-blue-400 hover:text-blue-300 pt-2 border-t border-zinc-800/60 font-medium cursor-pointer"
            >
              Kelola Penyimpanan →
            </button>
          </div>

          {/* Col 3: System Status & Activity Feed */}
          <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Status & Aktivitas</h3>
              <span className="text-[10px] text-emerald-400 font-mono">Live Telemetry</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Wifi className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200 text-xs">
                    {connectionMode === "nas" ? (nasStatus === "online" ? `NAS Backend Aktif (${nasLatency ?? 0}ms)` : "NAS Server Terputus") : "Mode Mandiri (Offline)"}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {connectionMode === "nas" ? `Endpoint: ${serverUrl}` : "Data tersimpan di memori perangkat"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                  <Wand2 className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200 text-xs">Studio WASM Siap Digunakan</p>
                  <p className="text-[10px] text-zinc-500">Pasfoto, kompresi, dan merge PDF di browser</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                <div className="h-7 w-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400 shrink-0">
                  <Cloud className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-medium text-zinc-200 text-xs">
                    {isGdriveConnected ? "Google Drive Pro Terhubung" : "Google Drive Siap Dihubungkan"}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {isGdriveConnected ? "Cadangan offsite 3-2-1 aktif" : "Koneksi cloud opsional"}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 flex items-center justify-between">
              <span>Platform: PWA Next.js 16</span>
              <button onClick={() => onOpenServer()} className="text-zinc-400 hover:text-white underline cursor-pointer">
                Detail Server
              </button>
            </div>
          </div>
        </div>
      </div>

  );
}
