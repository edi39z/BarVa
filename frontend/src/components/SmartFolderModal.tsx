"use client";

import React from "react";
import { FolderTree } from "lucide-react";
import Modal from "@/components/Modal";
import type { GroupMode, ItemGroup } from "@/lib/files/actions";

interface SmartFolderModalProps {
  mode: GroupMode;
  groups: ItemGroup[];
  busy: boolean;
  onModeChange: (mode: GroupMode) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function SmartFolderModal({
  mode,
  groups,
  busy,
  onModeChange,
  onConfirm,
  onClose,
}: SmartFolderModalProps) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <Modal
      title="Kelompokkan otomatis"
      description={`${total} item akan dipindahkan ke folder baru sesuai pilihan Anda.`}
      icon={<FolderTree className="h-4 w-4" aria-hidden />}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost">
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || groups.length === 0}
            className="btn btn-primary"
          >
            {busy ? "Memproses…" : "Buat & pindahkan"}
          </button>
        </>
      }
    >
      <div
        className="mb-3 flex w-fit items-center gap-1 rounded-xl border border-line bg-surface-2 p-1 text-[12px]"
        role="group"
        aria-label="Cara mengelompokkan"
      >
        <button
          type="button"
          onClick={() => onModeChange("type")}
          aria-pressed={mode === "type"}
          className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
            mode === "type" ? "bg-brand-soft text-brand" : "text-muted hover:text-fg"
          }`}
        >
          Per tipe
        </button>
        <button
          type="button"
          onClick={() => onModeChange("month")}
          aria-pressed={mode === "month"}
          className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
            mode === "month" ? "bg-brand-soft text-brand" : "text-muted hover:text-fg"
          }`}
        >
          Per bulan
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-subtle">Tidak ada berkas yang bisa dikelompokkan.</p>
      ) : (
        <ul className="space-y-1.5">
          {groups.map((group) => (
            <li
              key={group.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5"
            >
              <span className="truncate text-[12.5px] font-medium text-fg">{group.name}</span>
              <span className="chip chip-info shrink-0">{group.items.length} item</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-subtle">
        Folder dengan nama yang sama di lokasi ini akan dipakai ulang, bukan dibuat ganda.
      </p>
    </Modal>
  );
}
