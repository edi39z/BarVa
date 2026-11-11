"use client";

import React from "react";
import { Check, FileText, Folder } from "lucide-react";
import type { DisplayItem } from "@/lib/displayItem";
import Modal from "@/components/Modal";
import { isPdfTool, isSingleFileTool, MULTI_IMAGE_TOOLS, SINGLE_IMAGE_TOOLS, type StudioToolId } from "@/lib/studio/tools";

export type { StudioToolId };

// Berkas dari pustaka (NAS, Google Drive, HDD) ikut ditampilkan dan diunduh ke
// perangkat saat dipilih, karena Studio memproses berkas sepenuhnya di browser.
interface StoragePickerModalProps {
  tool: StudioToolId;
  items: DisplayItem[];
  selectedIds: string[];
  onSelectedIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onConfirm: () => void;
}

/** Asal berkas, ditampilkan sebagai label kecil di tiap baris. */
function sourceLabel(item: DisplayItem): string {
  if (item.blob) return "Perangkat";
  if (item.source === "gdrive") return "Drive";
  if (item.source === "hdd") return "HDD";
  return "NAS";
}

export default function StoragePickerModal({
  tool,
  items,
  selectedIds,
  onSelectedIdsChange,
  onClose,
  onConfirm,
}: StoragePickerModalProps) {
  const isSingleTool = isSingleFileTool(tool);

  const eligibleItems = items.filter((item) => {
    if (item.type === "folder") return false;
    if (SINGLE_IMAGE_TOOLS.includes(tool) || MULTI_IMAGE_TOOLS.includes(tool)) {
      return item.type === "image";
    }
    if (isPdfTool(tool)) {
      return item.type === "document" && item.name.toLowerCase().endsWith(".pdf");
    }
    return true;
  });

  return (
    <Modal
      title="Pilih berkas dari penyimpanan"
      description={`${selectedIds.length} berkas dipilih`}
      icon={<Folder className="h-4 w-4" aria-hidden />}
      size="xl"
      onClose={onClose}
      bodyClassName="min-h-[240px]"
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Batal
          </button>
          <button onClick={onConfirm} disabled={selectedIds.length === 0} className="btn btn-primary">
            Gunakan {selectedIds.length > 0 ? `${selectedIds.length} berkas` : "berkas"}
          </button>
        </>
      }
    >
      {eligibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-subtle" aria-hidden />
          <p className="text-[12.5px] font-semibold text-fg">Belum ada berkas yang cocok</p>
          <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-subtle">
            Tidak ada {isPdfTool(tool) ? "berkas PDF" : "foto"} di penyimpanan ini. Unggah lewat
            menu Semua Berkas, atau buka folder lain yang berisi berkas tersebut.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {eligibleItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    if (isSingleTool) {
                      onSelectedIdsChange([item.id]);
                    } else {
                      onSelectedIdsChange((prev) =>
                        isSelected ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                      );
                    }
                  }}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "border-brand-border bg-brand-soft"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      isSelected ? "border-brand-solid bg-brand-solid text-white" : "border-line-strong"
                    }`}
                    aria-hidden
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg">{item.name}</span>
                    <span className="block text-[11px] text-subtle">
                      {item.sizeStr} · {item.updatedAt}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="chip chip-neutral uppercase">{item.type}</span>
                    <span className="chip chip-neutral">{sourceLabel(item)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
