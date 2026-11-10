"use client";

import React, { useEffect, useRef } from "react";
import { FolderPlus, RefreshCw, Search, Upload, Wifi, WifiOff, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

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
  const searchRef = useRef<HTMLInputElement>(null);

  // Pintasan Ctrl/⌘ + K memfokuskan pencarian, seperti pada referensi desain.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md md:px-6">
        {/* Logo hanya di layar kecil, karena sidebar disembunyikan */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-solid text-base font-bold text-white shadow-brand">
            N
          </div>
        </div>

        {/* Pencarian */}
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            aria-label="Cari berkas, foto, atau dokumen"
            placeholder="Cari berkas, foto, atau dokumen…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input h-10 rounded-full pl-10 pr-16 text-[13px]"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface-3 hover:text-fg"
              aria-label="Hapus pencarian"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-subtle sm:block">
              Ctrl K
            </kbd>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Status server ringkas; detail ada di modal pengaturan */}
          <button
            onClick={onOpenServer}
            className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-fg sm:flex"
            title={
              connectionMode === "nas" && nasStatus === "online"
                ? `Server tersambung${nasLatency ? ` · ${nasLatency} ms` : ""}`
                : "Lihat status dan pengaturan server"
            }
          >
            {connectionMode === "nas" && nasStatus === "online" ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-success" aria-hidden />
                <span className="text-success">Tersambung</span>
              </>
            ) : connectionMode === "nas" ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-danger" aria-hidden />
                <span className="text-danger">Terputus</span>
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5 text-warn" aria-hidden />
                <span className="text-warn">Mode mandiri</span>
              </>
            )}
          </button>

          <ThemeToggle />

          <button
            onClick={onCreateFolder}
            className="btn btn-secondary hidden md:inline-flex"
            aria-label="Buat folder baru"
          >
            <FolderPlus className="h-4 w-4" aria-hidden />
            <span>Folder Baru</span>
          </button>

          <button onClick={onUpload} className="btn btn-primary px-3 md:px-4" aria-label="Unggah berkas">
            <Upload className="h-4 w-4" aria-hidden />
            <span className="hidden md:inline">Unggah Berkas</span>
          </button>
        </div>
      </header>

      {/* Jaringan perangkat terputus */}
      {!isOnline && (
        <div
          role="status"
          className="flex items-center gap-2.5 border-b border-danger-border bg-danger-soft px-4 py-2.5 text-[12.5px] text-danger md:px-6"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Tidak ada internet.</strong> Berkas di server belum
            bisa dibuka. Berkas yang tersimpan di perangkat tetap bisa dipakai.
          </span>
        </div>
      )}

      {/* Server NAS mati padahal jaringan ada */}
      {connectionMode === "nas" && nasStatus === "offline" && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn-border bg-warn-soft px-4 py-2.5 text-[12.5px] text-warn md:px-6"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Server rumah tidak terjangkau.</strong> Periksa
            koneksi ke <span className="font-mono">{serverUrl}</span>.
          </span>
          <button
            onClick={onOpenServer}
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Buka pengaturan
          </button>
        </div>
      )}

      {/* Progres unggah */}
      {isUploading && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 border-b border-brand-border bg-brand-soft px-4 py-2.5 text-[12.5px] text-brand md:px-6"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Mengunggah <strong className="font-semibold">{uploadFileName}</strong> — {uploadProgress}%
          </span>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface md:w-44">
            <div
              className="h-full rounded-full bg-brand-solid transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
