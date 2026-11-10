"use client";

import React from "react";
import {
  CheckCircle2,
  FileText,
  Folder,
  Layers,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";
import { formatBytes } from "@/lib/nasDisplay";
import type { CompressionResult } from "@/lib/studio/image";

export type StudioToolId = "img2pdf" | "mergepdf" | "idphoto" | "compress";
export type IdPhotoRatio = "3x4" | "4x6";

interface StudioTabProps {
  tool: StudioToolId;
  onToolChange: (tool: StudioToolId) => void;
  processing: boolean;
  successMsg: string;
  img2PdfRef: React.RefObject<HTMLInputElement | null>;
  mergePdfRef: React.RefObject<HTMLInputElement | null>;
  idPhotoRef: React.RefObject<HTMLInputElement | null>;
  compressRef: React.RefObject<HTMLInputElement | null>;
  onImagesToPDF: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMergePDFs: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateIDPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCompressImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenStoragePicker: (tool: StudioToolId) => void;
  idPhotoRatio: IdPhotoRatio;
  onIdPhotoRatioChange: (ratio: IdPhotoRatio) => void;
  idPhotoBg: string;
  onIdPhotoBgChange: (color: string) => void;
  compressQuality: number;
  onCompressQualityChange: (quality: number) => void;
  lastCompressResult: CompressionResult | null;
}

const TOOLS: {
  id: StudioToolId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "img2pdf",
    title: "Foto ke PDF",
    subtitle: "Gabung foto jadi 1 PDF",
    icon: <Layers className="h-5 w-5 mb-2 text-blue-400" />,
  },
  {
    id: "mergepdf",
    title: "Gabung PDF",
    subtitle: "Merge banyak file PDF",
    icon: <FileText className="h-5 w-5 mb-2 text-indigo-400" />,
  },
  {
    id: "idphoto",
    title: "Pasfoto 3x4 / 4x6",
    subtitle: "Latar merah/biru/putih",
    icon: <Scissors className="h-5 w-5 mb-2 text-rose-400" />,
  },
  {
    id: "compress",
    title: "Kompres Gambar",
    subtitle: "Kecilkan ukuran file foto",
    icon: <Sparkles className="h-5 w-5 mb-2 text-emerald-400" />,
  },
];

export default function StudioTab({
  tool,
  onToolChange,
  processing,
  successMsg,
  img2PdfRef,
  mergePdfRef,
  idPhotoRef,
  compressRef,
  onImagesToPDF,
  onMergePDFs,
  onCreateIDPhoto,
  onCompressImage,
  onOpenStoragePicker,
  idPhotoRatio,
  onIdPhotoRatioChange,
  idPhotoBg,
  onIdPhotoBgChange,
  compressQuality,
  onCompressQualityChange,
  lastCompressResult,
}: StudioTabProps) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-amber-400" />
          <span>Media & Document Studio (Client-Side WASM)</span>
        </h2>
        <p className="text-xs text-zinc-400">
          Semua proses manipulasi PDF dan gambar berjalan 100% di browser HP/Laptop Anda tanpa perlu server
          atau kuota internet.
        </p>
      </div>

      {/* Tool Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            onClick={() => onToolChange(item.id)}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              tool === item.id
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {item.icon}
            <p className="text-xs font-semibold text-zinc-200">{item.title}</p>
            <p className="text-[10px] text-zinc-500">{item.subtitle}</p>
          </button>
        ))}
      </div>

      {/* Status Message */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tool Workspace Panels */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6">
        {/* 1. Image to PDF */}
        {tool === "img2pdf" && (
          <div className="space-y-4">
            <input
              type="file"
              ref={img2PdfRef}
              onChange={onImagesToPDF}
              multiple
              accept="image/*"
              className="hidden"
            />
            <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
              <Layers className="h-10 w-10 text-blue-400 mx-auto mb-3" />
              <p className="text-xs font-semibold text-zinc-200">Pilih Satu atau Beberapa Foto</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Mendukung format JPG, PNG, WEBP dari perangkat, server NAS, atau Google Drive
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                <button
                  disabled={processing}
                  onClick={() => img2PdfRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors"
                >
                  {processing ? "Memproses..." : "Pilih dari HP / Laptop"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("img2pdf")}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Folder className="h-3.5 w-3.5 text-blue-400" />
                  <span>Pilih dari Penyimpanan (Lokal / NAS / Cloud)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Merge PDF */}
        {tool === "mergepdf" && (
          <div className="space-y-4">
            <input
              type="file"
              ref={mergePdfRef}
              onChange={onMergePDFs}
              multiple
              accept="application/pdf"
              className="hidden"
            />
            <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
              <FileText className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
              <p className="text-xs font-semibold text-zinc-200">Pilih Minimal 2 File PDF</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Gabung berkas ijazah, formulir, atau invoice dari penyimpanan lokal, NAS, atau Google Drive
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                <button
                  disabled={processing}
                  onClick={() => mergePdfRef.current?.click()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors"
                >
                  {processing ? "Memproses..." : "Pilih dari HP / Laptop"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("mergepdf")}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Folder className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Pilih dari Penyimpanan (Lokal / NAS / Cloud)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Pasfoto 3x4 / 4x6 */}
        {tool === "idphoto" && (
          <div className="space-y-4">
            <input
              type="file"
              ref={idPhotoRef}
              onChange={onCreateIDPhoto}
              accept="image/*"
              className="hidden"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">Ukuran Pasfoto</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onIdPhotoRatioChange("3x4")}
                    className={`flex-1 py-2 text-xs rounded-lg font-medium border cursor-pointer ${
                      idPhotoRatio === "3x4"
                        ? "bg-blue-600 text-white border-blue-500"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}
                  >
                    3 × 4 cm (354×472 px)
                  </button>
                  <button
                    onClick={() => onIdPhotoRatioChange("4x6")}
                    className={`flex-1 py-2 text-xs rounded-lg font-medium border cursor-pointer ${
                      idPhotoRatio === "4x6"
                        ? "bg-blue-600 text-white border-blue-500"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}
                  >
                    4 × 6 cm (472×709 px)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                  Warna Latar Belakang
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onIdPhotoBgChange("#dc2626")}
                    className={`flex-1 py-2 text-xs rounded-lg font-medium border flex items-center justify-center gap-1.5 cursor-pointer ${
                      idPhotoBg === "#dc2626" ? "border-white ring-1 ring-white" : "border-zinc-700"
                    }`}
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    <span className="text-white drop-shadow">Merah</span>
                  </button>
                  <button
                    onClick={() => onIdPhotoBgChange("#2563eb")}
                    className={`flex-1 py-2 text-xs rounded-lg font-medium border flex items-center justify-center gap-1.5 cursor-pointer ${
                      idPhotoBg === "#2563eb" ? "border-white ring-1 ring-white" : "border-zinc-700"
                    }`}
                    style={{ backgroundColor: "#2563eb" }}
                  >
                    <span className="text-white drop-shadow">Biru</span>
                  </button>
                  <button
                    onClick={() => onIdPhotoBgChange("#ffffff")}
                    className={`flex-1 py-2 text-xs rounded-lg font-medium border flex items-center justify-center gap-1.5 cursor-pointer ${
                      idPhotoBg === "#ffffff" ? "border-blue-500 ring-1 ring-blue-500" : "border-zinc-700"
                    }`}
                    style={{ backgroundColor: "#ffffff" }}
                  >
                    <span className="text-zinc-900 font-semibold">Putih</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center py-6 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
              <Scissors className="h-8 w-8 text-rose-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-200">Pilih Foto untuk Pasfoto</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Otomatis dipotong & disesuaikan ke resolusi 300 DPI standar resmi
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
                <button
                  disabled={processing}
                  onClick={() => idPhotoRef.current?.click()}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  {processing ? "Memproses..." : "Pilih dari HP / Laptop"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("idphoto")}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Folder className="h-3.5 w-3.5 text-rose-400" />
                  <span>Pilih dari Penyimpanan (Lokal / NAS)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Compress Image */}
        {tool === "compress" && (
          <div className="space-y-4">
            <input
              type="file"
              ref={compressRef}
              onChange={onCompressImage}
              accept="image/*"
              className="hidden"
            />

            <div>
              <div className="flex justify-between text-xs text-zinc-300 mb-2">
                <span>Target Kualitas Kompresi</span>
                <span className="font-mono font-semibold text-emerald-400">
                  {Math.round(compressQuality * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={compressQuality}
                onChange={(e) => onCompressQualityChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>Ukuran Lebih Kecil (Hemat Ruang)</span>
                <span>Kualitas Lebih Tinggi (Lebih Tajam)</span>
              </div>
            </div>

            <div className="text-center py-6 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-950/40 p-4">
              <Sparkles className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-200">Pilih Foto yang Ingin Dikompresi</p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-3">
                <button
                  disabled={processing}
                  onClick={() => compressRef.current?.click()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  {processing ? "Sedang Mengompresi..." : "Pilih dari HP / Laptop"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("compress")}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 text-xs font-medium px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Folder className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Pilih dari Penyimpanan (Lokal / NAS)</span>
                </button>
              </div>
            </div>

            {lastCompressResult && (
              <div className="bg-zinc-950 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <p className="text-zinc-200 font-medium">Hasil Kompresi Terakhir:</p>
                  <p className="text-[11px] text-zinc-400">
                    {formatBytes(lastCompressResult.originalSize)} ➔{" "}
                    <span className="text-emerald-400 font-semibold">
                      {formatBytes(lastCompressResult.compressedSize)}
                    </span>
                  </p>
                </div>
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-xs font-mono font-bold">
                  Hemat {lastCompressResult.savingsPercent}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
