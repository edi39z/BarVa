"use client";

import React from "react";
import {
  Check,
  Cloud,
  FileText,
  Folder,
  HardDrive,
  Server,
  X,
} from "lucide-react";
import type { DisplayItem } from "@/lib/nasDisplay";

export type StudioToolId = "img2pdf" | "mergepdf" | "idphoto" | "compress";
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
  const eligibleItems = localItems.filter((item) => {
    if (tool === "img2pdf" || tool === "idphoto" || tool === "compress") {
      return item.type === "image";
    }
    if (tool === "mergepdf") {
      return item.type === "document" && item.name.toLowerCase().endsWith(".pdf");
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5 text-zinc-100 font-semibold text-sm">
            <Folder className="h-4 w-4 text-blue-400" />
            <span>Pilih Berkas dari Penyimpanan untuk Studio</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Storage Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-xl text-xs shrink-0 w-fit">
          <button
            onClick={() => onTabChange("local")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              tab === "local" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <HardDrive className="h-3.5 w-3.5 text-blue-400" />
            <span>Lokal Device (IndexedDB)</span>
          </button>
          <button
            onClick={() => onTabChange("nas")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              tab === "nas" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Server className="h-3.5 w-3.5 text-emerald-400" />
            <span>Server NAS ({nasStatus === "online" ? "Online" : "Offline"})</span>
          </button>
          <button
            onClick={() => onTabChange("gdrive")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              tab === "gdrive" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Cloud className="h-3.5 w-3.5 text-teal-400" />
            <span>Google Drive Pro</span>
          </button>
        </div>

        {/* File List in Modal */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
          {tab === "local" &&
            (eligibleItems.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-zinc-300">
                  Belum ada berkas yang sesuai di penyimpanan lokal
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Unggah {tool === "mergepdf" ? "file PDF" : "foto"} terlebih dahulu melalui menu Semua File.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {eligibleItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (tool === "idphoto" || tool === "compress") {
                          onSelectedIdsChange([item.id]);
                        } else {
                          onSelectedIdsChange((prev) =>
                            isSelected ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                          );
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-5 w-5 rounded flex items-center justify-center border text-xs ${
                            isSelected ? "bg-blue-600 border-blue-500 text-white" : "border-zinc-700 bg-zinc-900"
                          }`}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-medium truncate">{item.name}</p>
                          <p className="text-[10px] text-zinc-500">
                            {item.sizeStr} • {item.updatedAt}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                        {item.type}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

          {tab === "nas" && (
            <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
              <Server className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-300">
                {nasStatus === "online" ? "Server NAS Terhubung" : "Server NAS Offline"}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                {nasStatus === "online"
                  ? "File yang diunggah ke NAS otomatis tersimpan dengan hash SHA-256 untuk pemrosesan instan."
                  : "Hubungkan backend NAS di menu Settings untuk menarik berkas langsung dari server."}
              </p>
            </div>
          )}

          {tab === "gdrive" && (
            <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
              <Cloud className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-300">
                {isGdriveConnected ? "Google Drive Pro Terhubung" : "Google Drive Belum Dihubungkan"}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                {isGdriveConnected
                  ? "Gunakan tab Google Drive di sidebar untuk membuka atau mengunduh file Pro Anda ke penyimpanan lokal."
                  : "Buka tab Google Drive di sidebar dan hubungkan akun Anda untuk memilih berkas dari cloud."}
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800 shrink-0">
          <span className="text-xs text-zinc-400">{selectedIds.length} berkas dipilih</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={onConfirm}
              disabled={selectedIds.length === 0}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer shadow-sm shadow-blue-600/30"
            >
              Gunakan Berkas Terpilih
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
