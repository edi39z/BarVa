"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Ukuran panel; `xl` dipakai untuk pemilih berkas. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Kelas tambahan untuk area isi (mis. agar daftar bisa digulir). */
  bodyClassName?: string;
}

const SIZES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

/**
 * Kerangka dialog bersama: latar gelap, panel, judul, tombol tutup, dan
 * penutupan lewat Escape. Dipakai semua modal agar perilakunya seragam.
 */
export default function Modal({
  title,
  description,
  icon,
  onClose,
  children,
  footer,
  size = "md",
  bodyClassName = "",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Fokus awal ke panel supaya pembaca layar langsung membacakan judul.
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Tutup dialog"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-pop outline-none sm:rounded-2xl ${SIZES[size]}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-start gap-2.5">
            {icon && <span className="mt-0.5 shrink-0 text-brand">{icon}</span>}
            <div className="min-w-0">
              <h2 id={titleId} className="text-[14px] font-bold text-fg">
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-subtle">{description}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn shrink-0" aria-label="Tutup">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 ${bodyClassName}`}>{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
