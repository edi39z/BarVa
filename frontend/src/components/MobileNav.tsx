"use client";

import React, { useEffect, useState } from "react";
import {
  Cloud,
  Folder,
  Home as HomeIcon,
  Image as ImageIcon,
  LogOut,
  Menu,
  Server,
  Share2,
  Smartphone,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { AppTab } from "@/components/HomeDashboard";
import ThemeToggle from "@/components/ThemeToggle";

interface MobileNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  connectionMode: "standalone" | "nas";
  onOpenServer: () => void;
  onInstallPwa: () => void;
  onLogout: () => void;
}

const PRIMARY: { id: AppTab; label: string; icon: React.ElementType }[] = [
  { id: "home", label: "Beranda", icon: HomeIcon },
  { id: "files", label: "Berkas", icon: Folder },
  { id: "gallery", label: "Galeri", icon: ImageIcon },
  { id: "studio", label: "Studio", icon: Wand2 },
];

export default function MobileNav({
  activeTab,
  onTabChange,
  connectionMode,
  onOpenServer,
  onInstallPwa,
  onLogout,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  // Tutup panel dengan tombol Escape agar konsisten dengan dialog lain.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (tab: AppTab) => {
    onTabChange(tab);
    setOpen(false);
  };

  return (
    <>
      <nav
        aria-label="Navigasi utama"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pt-1.5 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between">
          {PRIMARY.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium transition-colors ${
                  active ? "text-brand" : "text-subtle"
                }`}
              >
                <span
                  className={`flex h-7 w-10 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-brand-soft" : ""
                  }`}
                >
                  <Icon className="h-[19px] w-[19px]" aria-hidden />
                </span>
                {label}
              </button>
            );
          })}

          <button
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[11px] font-medium transition-colors ${
              open ? "text-brand" : "text-subtle"
            }`}
          >
            <span className="flex h-7 w-10 items-center justify-center rounded-full">
              <Menu className="h-[19px] w-[19px]" aria-hidden />
            </span>
            Lainnya
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu lainnya"
            className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-surface p-4 shadow-pop"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-fg">Menu Lainnya</h2>
              <button onClick={() => setOpen(false)} className="icon-btn" aria-label="Tutup menu">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => go("shares")}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13.5px] font-medium text-fg hover:bg-surface-3"
              >
                <Share2 className="h-[18px] w-[18px] text-[var(--tile-teal-fg)]" aria-hidden />
                Berbagi Keluarga
              </button>
              <button
                onClick={() => go("gdrive")}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13.5px] font-medium text-fg hover:bg-surface-3"
              >
                <Cloud className="h-[18px] w-[18px] text-[var(--tile-green-fg)]" aria-hidden />
                Google Drive
              </button>
              {connectionMode === "nas" && (
                <button
                  onClick={() => go("trash")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13.5px] font-medium text-fg hover:bg-surface-3"
                >
                  <Trash2 className="h-[18px] w-[18px] text-muted" aria-hidden />
                  Sampah
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenServer();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13.5px] font-medium text-fg hover:bg-surface-3"
              >
                <Server className="h-[18px] w-[18px] text-muted" aria-hidden />
                Pengaturan Server
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onInstallPwa();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13.5px] font-medium text-fg hover:bg-surface-3"
              >
                <Smartphone className="h-[18px] w-[18px] text-muted" aria-hidden />
                Pasang di HP
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <ThemeToggle withLabel className="flex-1 justify-start" />
              <button onClick={onLogout} className="btn btn-danger">
                <LogOut className="h-4 w-4" aria-hidden />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
