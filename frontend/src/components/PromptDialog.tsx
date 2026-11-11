"use client";

import React, { useState } from "react";
import { PencilLine } from "lucide-react";
import Modal from "./Modal";

export interface PromptDialogProps {
  title: string;
  message?: React.ReactNode;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * Dialog satu isian teks, pengganti `prompt()` bawaan browser.
 *
 * Nilai di-trim sebelum dikirim: nama folder atau berkas yang hanya berisi
 * spasi tidak berguna dan dulu lolos lewat `prompt()`.
 */
export default function PromptDialog({
  title,
  message,
  label,
  defaultValue = "",
  placeholder,
  confirmLabel = "Simpan",
  cancelLabel = "Batal",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();

  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      icon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand-border">
          <PencilLine className="h-4 w-4" aria-hidden />
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            form="prompt-dialog-form"
            className="btn btn-primary"
            disabled={!trimmed}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        id="prompt-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onConfirm(trimmed);
        }}
      >
        {message && (
          <p className="mb-3 whitespace-pre-line text-[13px] leading-relaxed text-muted">{message}</p>
        )}
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {label}
        </label>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoFocus
          className="mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-soft"
        />
      </form>
    </Modal>
  );
}
