"use client";

import { AlertCircle, X } from "lucide-react";
import type { StudioErrorInfo } from "@/lib/studio/errors";

interface StudioAlertProps {
  error: StudioErrorInfo;
  onDismiss?: () => void;
}

/**
 * Kotak galat Studio. Menggantikan `alert()` supaya pesan tetap terlihat,
 * memuat langkah perbaikan, dan tidak memblokir antarmuka.
 */
export default function StudioAlert({ error, onDismiss }: StudioAlertProps) {
  const tone =
    error.tone === "warn"
      ? "border-warn-border bg-warn-soft text-warn"
      : "border-danger-border bg-danger-soft text-danger";

  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${tone}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{error.title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed">{error.message}</p>
        {error.hint && <p className="mt-1 text-[11.5px] leading-relaxed opacity-90">{error.hint}</p>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="-mr-1 shrink-0 rounded-lg p-1 transition-colors hover:bg-black/5"
          aria-label="Tutup pesan"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
