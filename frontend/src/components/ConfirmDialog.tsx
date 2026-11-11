"use client";

import React from "react";
import { Info, ShieldAlert, TriangleAlert } from "lucide-react";
import Modal from "./Modal";

/** Nada dialog: menentukan ikon, warna, dan gaya tombol utama. */
export type DialogTone = "danger" | "warning" | "info";

export interface ConfirmDialogProps {
  /** `confirm` menampilkan dua tombol, `alert` hanya satu. */
  mode: "confirm" | "alert";
  title: string;
  message: React.ReactNode;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONES: Record<
  DialogTone,
  { icon: React.ReactNode; badge: string; button: string }
> = {
  danger: {
    icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
    badge: "bg-danger-soft text-danger ring-danger-border",
    button: "btn btn-danger",
  },
  warning: {
    icon: <TriangleAlert className="h-4 w-4" aria-hidden />,
    badge: "bg-warn-soft text-warn ring-warn-border",
    button: "btn btn-primary",
  },
  info: {
    icon: <Info className="h-4 w-4" aria-hidden />,
    badge: "bg-info-soft text-info ring-info-border",
    button: "btn btn-primary",
  },
};

/**
 * Dialog keputusan dan pemberitahuan.
 *
 * Menggantikan `confirm()` dan `alert()` bawaan browser supaya tampilannya
 * sama dengan modal lain, mengikuti tema terang/gelap, dan bisa dipakai dari
 * hook lewat `useConfirm()`.
 */
export default function ConfirmDialog({
  mode,
  title,
  message,
  tone = "info",
  confirmLabel,
  cancelLabel = "Batal",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const style = TONES[tone];
  const confirmText = confirmLabel ?? (mode === "alert" ? "Mengerti" : "Lanjutkan");

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      icon={
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${style.badge}`}
        >
          {style.icon}
        </span>
      }
      footer={
        <>
          {mode === "confirm" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              // Fokus awal ke Batal: tindakan destruktif tidak boleh terpicu
              // hanya karena pengguna menekan Enter.
              autoFocus
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={mode === "alert" ? "btn btn-primary" : style.button}
            onClick={onConfirm}
            autoFocus={mode === "alert"}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">{message}</p>
    </Modal>
  );
}
