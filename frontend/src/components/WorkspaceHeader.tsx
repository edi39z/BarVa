"use client";

import React from "react";
import { Plus, RefreshCw, Search, Upload, Wifi, WifiOff } from "lucide-react";

interface WorkspaceHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  nasStatus: "online" | "offline" | "checking";
  nasLatency: number | null;
  connectionMode: "standalone" | "nas";
  serverUrl: string;
  isOnline: boolean;
  isUploading: boolean;
  uploadFileName: string;
  uploadProgress: number;
  onOpenServer: () => void;
  onUpload: () => void;
  onCreateFolder: () => void;
}

export default function WorkspaceHeader({
  searchQuery,
  onSearchChange,
  nasStatus,
  nasLatency,
  connectionMode,
  serverUrl,
  isOnline,
  isUploading,
  uploadFileName,
  uploadProgress,
  onOpenServer,
  onUpload,
  onCreateFolder,
}: WorkspaceHeaderProps) {
  return (
    <>
{/* Top Navbar */}
<header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between shrink-0 bg-zinc-950/80 backdrop-blur-md">
  {/* Search Bar */}
  <div className="relative w-96">
    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
    <input
      type="text"
      placeholder="Cari foto, dokumen, video..."
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/80 transition-colors"
    />
  </div>

  {/* Action Buttons */}
  <div className="flex items-center gap-3">
    <button
      onClick={() => onOpenServer()}
      className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
      title="Status Server NAS Homelab"
    >
      {nasStatus === "online" ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          <span>NAS {nasLatency ? `${nasLatency}ms` : "Online"}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-rose-400" />
          <span>NAS Offline</span>
        </>
      )}
    </button>

    <button
      onClick={() => onUpload()}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-all shadow-sm shadow-blue-600/30 active:scale-95 cursor-pointer"
    >
      <Upload className="h-3.5 w-3.5" />
      <span>Upload File Asli</span>
    </button>

    <button
      onClick={onCreateFolder}
      className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
    >
      <Plus className="h-3.5 w-3.5" />
      <span>Folder Baru</span>
    </button>
  </div>
</header>

{/* Offline Browser Alert Banner */}
{!isOnline && (
  <div className="bg-rose-950/60 border-b border-rose-800/60 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200">
    <div className="flex items-center gap-2.5 text-rose-200">
      <WifiOff className="h-4 w-4 text-rose-400 shrink-0" />
      <span>
        <strong>Kamu sedang offline.</strong> Berkas di server NAS tidak dapat dibuka sampai
        koneksi kembali; berkas mode standalone (IndexedDB) tetap tersedia.
      </span>
    </div>
  </div>
)}

{/* Offline Fallback Alert Banner */}
{connectionMode === "nas" && nasStatus === "offline" && (
  <div className="bg-amber-950/60 border-b border-amber-800/60 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200">
    <div className="flex items-center gap-2.5 text-amber-300">
      <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
      <span>
        <strong>NAS Server Offline:</strong> Tidak dapat terhubung ke <code>{serverUrl}</code>. Sistem otomatis mengalihkan penyimpanan ke cache offline (IndexedDB).
      </span>
    </div>
    <button
      onClick={() => onOpenServer()}
      className="text-amber-400 hover:text-white underline font-medium cursor-pointer"
    >
      Konfigurasi Server
    </button>
  </div>
)}

{/* Upload Progress Bar */}
{isUploading && (
  <div className="bg-blue-950/60 border-b border-blue-800/50 px-6 py-2.5 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200">
    <div className="flex items-center gap-3">
      <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
      <span className="text-blue-200">
        Menyimpan file & verifikasi SHA-256: <code className="font-mono text-white">{uploadFileName}</code> ({uploadProgress}%)
      </span>
    </div>
    <div className="w-48 bg-blue-900/40 h-2 rounded-full overflow-hidden border border-blue-700/50">
      <div
        className="bg-blue-400 h-full transition-all duration-200"
        style={{ width: `${uploadProgress}%` }}
      />
    </div>
  </div>
)}


    </>
  );
}
