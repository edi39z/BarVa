"use client";

import React from "react";
import {
  Cloud,
  FileArchive,
  Folder,
  HardDrive,
  Heart,
  Home as HomeIcon,
  Image as ImageIcon,
  LogOut,
  Settings,
  Share2,
  Smartphone,
  Trash2,
  Wand2,
} from "lucide-react";
import type { NasUser } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/nasDisplay";
import { formatBytes } from "@/lib/nasDisplay";
import type { AppTab } from "@/components/HomeDashboard";

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  activeItems: DisplayItem[];
  trashCount: number;
  connectionMode: "standalone" | "nas";
  nasStatus: "online" | "offline" | "checking";
  nasLatency: number | null;
  isGdriveConnected: boolean;
  serverUrl: string;
  currentUser: NasUser | null;
  onOpenServer: () => void;
  onInstallPwa: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  activeItems,
  trashCount,
  connectionMode,
  nasStatus,
  nasLatency,
  isGdriveConnected,
  serverUrl,
  currentUser,
  onOpenServer,
  onInstallPwa,
  onLogout,
}: SidebarProps) {
  return (
<aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 flex flex-col justify-between shrink-0 select-none">
  <div>
    {/* Logo & Server/Mode Indicator */}
    <div className="p-4 border-b border-zinc-800/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 font-bold text-lg text-white">
            N
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-zinc-100">NAS Cloud</h1>
            <button
              onClick={() => onOpenServer()}
              className="flex items-center gap-1.5 text-[11px] font-medium transition-colors hover:underline text-left cursor-pointer"
            >
              {connectionMode === "nas" ? (
                nasStatus === "online" ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    NAS: {nasLatency ? `${nasLatency}ms` : "Online"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    NAS Offline (IDB)
                  </span>
                )
              ) : (
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Mode Standalone
                </span>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={() => onOpenServer()}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Konfigurasi Server NAS"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>

    {/* Navigation Links */}
    <nav className="p-3 space-y-1">
      <button
        onClick={() => onTabChange("home")}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          activeTab === "home"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        }`}
      >
        <HomeIcon className="h-4 w-4" />
        <span>Home Dashboard</span>
      </button>

      <button
        onClick={() => onTabChange("files")}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          activeTab === "files"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        }`}
      >
        <Folder className="h-4 w-4" />
        <span>Semua File</span>
        <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
          {activeItems.length}
        </span>
      </button>

      <button
        onClick={() => onTabChange("gallery")}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          activeTab === "gallery"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        }`}
      >
        <ImageIcon className="h-4 w-4" />
        <span>Galeri Media</span>
        <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
          {activeItems.filter((i) => i.type === "image" || i.type === "video").length}
        </span>
      </button>

      {connectionMode === "nas" && (
        <button
          onClick={() => onTabChange("trash")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            activeTab === "trash"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          <span>Trash</span>
          <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            {trashCount}
          </span>
        </button>
      )}

      {/* Studio Tools (Client-Side WASM) */}
      <button
        onClick={() => onTabChange("studio")}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          activeTab === "studio"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        }`}
      >
        <Wand2 className="h-4 w-4 text-amber-400" />
        <span>Studio Tools</span>
        <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-medium">
          WASM
        </span>
      </button>

      <button
        onClick={() => onTabChange("gdrive")}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          activeTab === "gdrive"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        }`}
      >
        <Cloud className="h-4 w-4 text-emerald-400" />
        <span>Google Drive</span>
        <span
          className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
            isGdriveConnected ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {isGdriveConnected ? "Aktif" : "Hubungkan"}
        </span>
      </button>

      <button
        onClick={() => onTabChange("shares")}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
          activeTab === "shares"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
        }`}
      >
        <Share2 className="h-4 w-4" />
        <span>Family Sharing</span>
      </button>

      <div className="pt-3 pb-1 px-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
        Koleksi
      </div>

      <button
        onClick={() => onTabChange("gallery")}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 cursor-pointer"
      >
        <Heart className="h-3.5 w-3.5 text-rose-400" />
        <span>Foto Favorit</span>
      </button>
      <button
        onClick={() => onTabChange("files")}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 cursor-pointer"
      >
        <FileArchive className="h-3.5 w-3.5 text-amber-400" />
        <span>Backup & Arsip</span>
      </button>

      {/* PWA Install Button */}
      <div className="pt-2">
        <button
          onClick={onInstallPwa}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/30 text-blue-300 text-xs font-medium py-2 px-3 rounded-xl transition-all cursor-pointer shadow-sm"
        >
          <Smartphone className="h-3.5 w-3.5" />
          <span>Pasang Aplikasi PWA</span>
        </button>
      </div>
    </nav>
  </div>

  {/* Storage Health & User Info */}
  <div className="p-4 border-t border-zinc-800 space-y-4">
    <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-blue-400" />
          {connectionMode === "nas" ? "Penyimpanan NAS" : "Local Storage (IDB)"}
        </span>
        <span className="font-mono text-zinc-300 font-medium">
          {formatBytes(activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0))}
        </span>
      </div>
      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(
              100,
              Math.max(
                activeItems.length > 0 ? 5 : 0,
                Math.round(
                  (activeItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0) /
                    (50 * 1024 * 1024 * 1024)) *
                    100
                )
              )
            )}%`,
          }}
        />
      </div>
      <p className="text-[11px] text-zinc-500">
        {connectionMode === "nas"
          ? `Server NAS • ${activeItems.length} item di folder ini`
          : `IndexedDB Client Aktif • ${activeItems.length} File Tersimpan`}
      </p>
    </div>

    {currentUser && (
      <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/80 rounded-xl px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-200 truncate">
            {currentUser.username}
          </p>
          <p className="text-[10px] text-zinc-500 truncate">
            {currentUser.email}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
            {currentUser.role}
          </span>
          <button
            onClick={onLogout}
            title="Keluar"
            className="text-zinc-500 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )}

    <div className="flex items-center justify-between pt-1">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-teal-400 flex items-center justify-center text-xs font-bold text-white">
          {connectionMode === "nas" ? "NAS" : "LCL"}
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-200">
            {connectionMode === "nas"
              ? nasStatus === "online"
                ? "NAS Homelab"
                : "NAS (Offline)"
              : "Penyimpanan Lokal"}
          </p>
          <p className="text-[10px] text-zinc-400 font-mono">
            {connectionMode === "nas"
              ? nasStatus === "online"
                ? serverUrl.replace(/^https?:\/\//, "")
                : "Cache Offline"
              : "Standalone Mode"}
          </p>
        </div>
      </div>
      <span
        className={`h-2 w-2 rounded-full ${
          connectionMode === "nas"
            ? nasStatus === "online"
              ? "bg-emerald-400"
              : "bg-rose-400"
            : "bg-amber-400"
        }`}
        title="Status Jaringan"
      />
    </div>
  </div>
</aside>

  );
}
