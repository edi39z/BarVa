"use client";

import React from "react";
import { Check, Cloud, FileText, Folder, HardDrive, Server } from "lucide-react";
import type { DisplayItem } from "@/lib/displayItem";
import Modal from "@/components/Modal";
import { isPdfTool, isSingleFileTool, MULTI_IMAGE_TOOLS, SINGLE_IMAGE_TOOLS, type StudioToolId } from "@/lib/studio/tools";

export type { StudioToolId };
export type StoragePickerTab = "local" | "nas" | "gdrive";

interface StoragePickerModalProps {
  tool: StudioToolId;
  tab: StoragePickerTab;
  onTabChange: (tab: StoragePickerTab) => void;
  localItems: DisplayItem[];
  selectedIds: string[];
  onSelectedIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  nasStatus: "online" | "offline" | "checking";
  isGdriveConnected: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const TABS: { id: StoragePickerTab; label: string; icon: React.ElementType }[] = [
  { id: "local", label: "Perangkat ini", icon: HardDrive },
  { id: "nas", label: "Server NAS", icon: Server },
  { id: "gdrive", label: "Google Drive", icon: Cloud },
];

export default function StoragePickerModal({
  tool,
  tab,
  onTabChange,
  localItems,
  selectedIds,
  onSelectedIdsChange,
  nasStatus,
  isGdriveConnected,
  onClose,
  onConfirm,
}: StoragePickerModalProps) {
  const isSingleTool = isSingleFileTool(tool);

  const eligibleItems = localItems.filter((item) => {
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
      <div
        className="mb-3 flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1 text-[12px]"
        role="tablist"
        aria-label="Sumber berkas"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTabChange(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition-colors ${
              tab === id ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === "local" &&
        (eligibleItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-subtle" aria-hidden />
            <p className="text-[12.5px] font-semibold text-fg">Belum ada berkas yang cocok</p>
            <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-subtle">
              Unggah {isPdfTool(tool) ? "berkas PDF" : "foto"} lebih dulu lewat menu Semua Berkas.
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
                    <span className="chip chip-neutral shrink-0 uppercase">{item.type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "nas" && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center">
          <Server className="mx-auto mb-2 h-8 w-8 text-subtle" aria-hidden />
          <p className="text-[12.5px] font-semibold text-fg">
            {nasStatus === "online" ? "Server NAS terhubung" : "Server NAS sedang offline"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-subtle">
            {nasStatus === "online"
              ? "Berkas di server dapat diolah setelah diunduh ke perangkat ini."
              : "Sambungkan kembali server di menu Pengaturan Server untuk memakai berkas NAS."}
          </p>
        </div>
      )}

      {tab === "gdrive" && (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center">
          <Cloud className="mx-auto mb-2 h-8 w-8 text-subtle" aria-hidden />
          <p className="text-[12.5px] font-semibold text-fg">
            {isGdriveConnected ? "Google Drive terhubung" : "Google Drive belum terhubung"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-subtle">
            {isGdriveConnected
              ? "Buka menu Google Drive untuk mengunduh berkas ke perangkat, lalu pilih dari tab Perangkat ini."
              : "Hubungkan akun Google di menu Google Drive terlebih dahulu."}
          </p>
        </div>
      )}
    </Modal>
  );
}
