"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

interface ThemeToggleProps {
  /** Tampilkan teks di samping ikon (untuk pengguna non-teknis). */
  withLabel?: boolean;
  className?: string;
}

export default function ThemeToggle({ withLabel = false, className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      aria-pressed={dark}
      title={dark ? "Mode terang" : "Mode gelap"}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-fg ${
        withLabel ? "h-10 px-3 text-[13px] font-semibold" : "h-10 w-10"
      } ${className}`}
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      {withLabel && <span>{dark ? "Mode Terang" : "Mode Gelap"}</span>}
    </button>
  );
}
