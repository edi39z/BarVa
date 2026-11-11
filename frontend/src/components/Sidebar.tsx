"use client";

import React from "react";
import {
  Cloud,
  Folder,
  HardDrive,
  Home as HomeIcon,
  Image as ImageIcon,
  LogOut,
  Server,
  Share2,
  Smartphone,
  Trash2,
  Wand2,
} from "lucide-react";
import type { NasUser } from "@/lib/api/nas";
import { mergeDisplayItems, type DisplayItem } from "@/lib/displayItem";
import { formatBytes } from "@/lib/nasDisplay";
import { computeStorageStats, usagePercent } from "@/lib/storageStats";
import type { AppTab, ConnectionMode } from "@/lib/types";
import ThemeToggle from "@/components/ThemeToggle";

// Kuota cadangan bila server belum menetapkan batas (quota_bytes = 0).
const DEFAULT_QUOTA_BYTES = 50 * 1024 * 1024 * 1024;

interface SidebarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  activeItems: DisplayItem[];
  /** Berkas lokal di perangkat; digabung agar angka sama dengan Beranda. */
  localItems: DisplayItem[];
  trashCount: number;
  connectionMode: ConnectionMode;
  nasStatus: "online" | "offline" | "checking";
  nasLatency: number | null;
  isGdriveConnected: boolean;
  serverUrl: string;
  currentUser: NasUser | null;
  onOpenServer: () => void;
  onInstallPwa: () => void;
  onLogout: () => void;
}

interface NavItem {
  id: AppTab;
  label: string;
  icon: React.ElementType;
  badge?: string;
  /** Warna ikon agar tiap menu mudah dikenali sekilas. */
  tone: string;
}

export default function Sidebar({
  activeTab,
  onTabChange,
  activeItems,
  localItems,
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
  const mergedItems = mergeDisplayItems(activeItems, localItems);
  const stats = computeStorageStats(mergedItems);
  const mediaCount = stats.imageCount + stats.videoCount;
  const quotaBytes =
    currentUser?.quota_bytes && currentUser.quota_bytes > 0
      ? currentUser.quota_bytes
      : DEFAULT_QUOTA_BYTES;
  const usedPercent = usagePercent(stats.totalBytes, quotaBytes);

  const mainNav: NavItem[] = [
    { id: "home", label: "Beranda", icon: HomeIcon, tone: "text-brand" },
    { id: "files", label: "Semua Berkas", icon: Folder, tone: "text-[var(--tile-blue-fg)]" },
    { id: "gallery", label: "Galeri Foto", icon: ImageIcon, tone: "text-[var(--tile-purple-fg)]", badge: String(mediaCount) },
    { id: "studio", label: "Studio Foto & PDF", icon: Wand2, tone: "text-[var(--tile-amber-fg)]" },
    { id: "shares", label: "Berbagi Keluarga", icon: Share2, tone: "text-[var(--tile-teal-fg)]" },
  ];

  const secondaryNav: NavItem[] = [
    {
      id: "gdrive",
      label: "Google Drive",
      icon: Cloud,
      tone: "text-[var(--tile-green-fg)]",
      badge: isGdriveConnected ? "Aktif" : undefined,
    },
  ];

  if (connectionMode === "nas") {
    secondaryNav.push({
      id: "trash",
      label: "Sampah",
      icon: Trash2,
      tone: "text-muted",
      badge: trashCount > 0 ? String(trashCount) : undefined,
    });
  }

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        aria-current={active ? "page" : undefined}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
          active
            ? "bg-brand-soft text-brand"
            : "text-muted hover:bg-surface-3 hover:text-fg"
        }`}
      >
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${active ? "text-brand" : item.tone}`}
          aria-hidden
        />
        <span className="truncate">{item.label}</span>
        {item.badge && (
          <span
            className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
              active ? "bg-surface text-brand" : "bg-surface-3 text-subtle"
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="hidden w-[260px] shrink-0 select-none flex-col justify-between overflow-hidden border-r border-line bg-surface lg:flex">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Identitas aplikasi + status server */}
        <div className="border-b border-line px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-solid text-lg font-bold text-white shadow-brand">
              N
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold tracking-tight text-fg">Barva</h1>
              <p className="truncate text-[11.5px] text-subtle">Penyimpanan keluarga</p>
            </div>
            <div className="ml-auto flex items-center gap-0.5">
              <ThemeToggle />
            </div>
          </div>

          <button
            onClick={onOpenServer}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[11.5px] font-medium transition-colors hover:text-fg"
          >
            {connectionMode === "nas" ? (
              nasStatus === "online" ? (
                <span className="flex items-center gap-1.5 text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                  Server tersambung {nasLatency ? `· ${nasLatency} ms` : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-danger">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden />
                  Server tidak terjangkau
                </span>
              )
            ) : (
              <span className="flex items-center gap-1.5 text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
                Mode mandiri (tanpa server)
              </span>
            )}
          </button>
        </div>

        <nav className="scroll-area min-h-0 flex-1 space-y-1 p-3" aria-label="Menu utama">
          {mainNav.map(renderNavItem)}

          <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle">
            Lainnya
          </p>
          {secondaryNav.map(renderNavItem)}

          <button
            onClick={onInstallPwa}
            className="mt-3 flex w-full items-center gap-2 rounded-xl border border-brand-border bg-brand-soft px-3 py-2 text-[12.5px] font-semibold text-brand transition-colors hover:brightness-[0.98]"
          >
            <Smartphone className="h-4 w-4" aria-hidden />
            <span>Pasang di HP</span>
          </button>
        </nav>
      </div>

      {/* Ringkasan penyimpanan + akun */}
      <div className="space-y-3 border-t border-line p-3">
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-muted">
              <HardDrive className="h-3.5 w-3.5 text-brand" aria-hidden />
              Ruang terpakai
            </span>
            <span className="font-semibold tabular-nums text-fg">{formatBytes(stats.totalBytes)}</span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label="Pemakaian penyimpanan"
            aria-valuenow={usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand-solid transition-all duration-300"
              style={{
                width: `${Math.max(stats.totalBytes > 0 ? 4 : 0, usedPercent)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px] text-subtle">
            {connectionMode === "nas"
              ? `${stats.fileCount} berkas dari ${formatBytes(quotaBytes)}`
              : `${stats.fileCount} berkas di perangkat ini`}
          </p>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-2.5 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold uppercase text-brand">
              {currentUser.username.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-fg">{currentUser.username}</p>
              <p className="truncate text-[11px] text-subtle">
                {formatBytes(currentUser.quota_used_bytes ?? 0)}
                {currentUser.quota_bytes ? ` / ${formatBytes(currentUser.quota_bytes)}` : ""}
              </p>
            </div>
            <button onClick={onLogout} className="icon-btn" aria-label="Keluar dari akun" title="Keluar">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          // Sama seperti status di atas, kartu ini membuka Pengaturan Server —
          // dulu berupa <div> sehingga terlihat seperti tombol tapi tidak bisa diklik.
          <button
            onClick={onOpenServer}
            title="Buka pengaturan server"
            className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-3"
          >
            <Server className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
              {connectionMode === "nas" ? serverUrl.replace(/^https?:\/\//, "") : "Penyimpanan lokal"}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
