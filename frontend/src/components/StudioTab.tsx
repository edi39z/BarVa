"use client";

import React from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Folder,
  Layers,
  Scissors,
  ShieldCheck,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { formatBytes } from "@/lib/nasDisplay";
import type { CompressionResult } from "@/lib/studio/image";
import type { BgProgress, EnhanceResult } from "@/lib/studio/ai";
import type { StudioToolId } from "@/lib/studio/tools";

export type { StudioToolId };
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
  removeBgRef: React.RefObject<HTMLInputElement | null>;
  enhanceRef: React.RefObject<HTMLInputElement | null>;
  onImagesToPDF: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMergePDFs: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateIDPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCompressImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveBackground: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEnhancePhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenStoragePicker: (tool: StudioToolId) => void;
  idPhotoRatio: IdPhotoRatio;
  onIdPhotoRatioChange: (ratio: IdPhotoRatio) => void;
  idPhotoBg: string;
  onIdPhotoBgChange: (color: string) => void;
  compressQuality: number;
  onCompressQualityChange: (quality: number) => void;
  lastCompressResult: CompressionResult | null;
  bgModelReady: boolean;
  bgConsentGranted: boolean;
  bgProgress: BgProgress | null;
  onGrantBgConsent: () => void;
  lastEnhanceResult: EnhanceResult | null;
}

const TOOLS: {
  id: StudioToolId;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  bg: string;
  fg: string;
}[] = [
  {
    id: "removebg",
    title: "Hapus Latar",
    subtitle: "Latar jadi transparan",
    icon: Wand2,
    bg: "var(--tile-teal)",
    fg: "var(--tile-teal-fg)",
  },
  {
    id: "enhance",
    title: "Naikkan Kualitas",
    subtitle: "Foto lebih tajam & besar",
    icon: Zap,
    bg: "var(--tile-amber)",
    fg: "var(--tile-amber-fg)",
  },
  {
    id: "compress",
    title: "Kompres Foto",
    subtitle: "Perkecil ukuran berkas",
    icon: Sparkles,
    bg: "var(--tile-green)",
    fg: "var(--tile-green-fg)",
  },
  {
    id: "idphoto",
    title: "Pasfoto 3×4 / 4×6",
    subtitle: "Latar merah, biru, putih",
    icon: Scissors,
    bg: "var(--tile-rose)",
    fg: "var(--tile-rose-fg)",
  },
  {
    id: "img2pdf",
    title: "Foto ke PDF",
    subtitle: "Gabung foto jadi 1 PDF",
    icon: Layers,
    bg: "var(--tile-blue)",
    fg: "var(--tile-blue-fg)",
  },
  {
    id: "mergepdf",
    title: "Gabung PDF",
    subtitle: "Satukan beberapa PDF",
    icon: FileText,
    bg: "var(--tile-purple)",
    fg: "var(--tile-purple-fg)",
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
  removeBgRef,
  enhanceRef,
  onImagesToPDF,
  onMergePDFs,
  onCreateIDPhoto,
  onCompressImage,
  onRemoveBackground,
  onEnhancePhoto,
  onOpenStoragePicker,
  idPhotoRatio,
  onIdPhotoRatioChange,
  idPhotoBg,
  onIdPhotoBgChange,
  compressQuality,
  onCompressQualityChange,
  lastCompressResult,
  bgModelReady,
  bgConsentGranted,
  bgProgress,
  onGrantBgConsent,
  lastEnhanceResult,
}: StudioTabProps) {
  const bgCanRun = bgModelReady || bgConsentGranted;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24 lg:pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-[17px] font-bold text-fg">
          <Wand2 className="h-[18px] w-[18px] text-brand" aria-hidden />
          Studio Foto & Dokumen
        </h1>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-subtle">
          Semua proses berjalan langsung di HP atau laptop Anda — foto tidak diunggah ke mana pun,
          jadi tetap privat.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          const active = tool === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onToolChange(item.id)}
              aria-pressed={active}
              className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-brand-border bg-brand-soft"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: item.bg, color: item.fg }}
                aria-hidden
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-[12.5px] font-semibold ${active ? "text-brand" : "text-fg"}`}>
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-subtle">{item.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>

      {successMsg && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl border border-success-border bg-success-soft px-3.5 py-2.5 text-[12.5px] text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="card p-4 sm:p-6">
        {tool === "removebg" && (
          <div className="space-y-4">
            <input
              type="file"
              ref={removeBgRef}
              onChange={onRemoveBackground}
              accept="image/*"
              className="hidden"
            />

            {!bgCanRun && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "var(--tile-teal)", color: "var(--tile-teal-fg)" }}
                    aria-hidden
                  >
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-fg">Perlu unduh model AI sekali saja</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-subtle">
                      Sekitar <strong className="font-semibold text-fg">40 MB</strong>. Setelah tersimpan, alat ini
                      bisa dipakai tanpa internet. Foto Anda tidak pernah dikirim ke server mana pun.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={onGrantBgConsent} disabled={processing} className="btn btn-primary">
                    <Download className="h-4 w-4" aria-hidden />
                    Unduh model &amp; mulai
                  </button>
                </div>
              </div>
            )}

            {bgProgress && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-muted">
                    {bgProgress.phase === "download" ? "Mengunduh model AI…" : "Memproses foto…"}
                  </span>
                  <span className="font-semibold tabular-nums text-brand">{bgProgress.percent}%</span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={bgProgress.percent}
                  aria-label="Kemajuan hapus latar belakang"
                >
                  <div
                    className="h-full rounded-full bg-[var(--brand-solid)] transition-[width] duration-300"
                    style={{ width: `${Math.max(4, bgProgress.percent)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
              <Wand2 className="mx-auto mb-2 h-9 w-9 text-[var(--tile-teal-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih foto yang ingin dihapus latarnya</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
                Paling cocok untuk foto orang, produk, atau hewan. Hasil disimpan sebagai PNG transparan.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  disabled={processing || !bgCanRun}
                  onClick={() => removeBgRef.current?.click()}
                  className="btn btn-primary"
                >
                  {processing ? "Memproses…" : "Pilih dari perangkat"}
                </button>
                <button
                  disabled={processing || !bgCanRun}
                  onClick={() => onOpenStoragePicker("removebg")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
              {bgModelReady && !processing && (
                <p className="mt-3 text-[11.5px] text-subtle">Model AI sudah siap di perangkat ini.</p>
              )}
            </div>
          </div>
        )}

        {tool === "enhance" && (
          <div className="space-y-4">
            <input type="file" ref={enhanceRef} onChange={onEnhancePhoto} accept="image/*" className="hidden" />

            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed text-subtle">
              Foto diperbesar <strong className="font-semibold text-fg">2×</strong>, detail dipertajam, dan warna
              dirapikan. Tanpa model AI, jadi langsung jalan dan tidak memakai kuota.
            </div>

            <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
              <Zap className="mx-auto mb-2 h-9 w-9 text-[var(--tile-amber-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih foto yang ingin diperjelas</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
                Cocok untuk foto lama, hasil scan, atau foto yang tampak buram.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button disabled={processing} onClick={() => enhanceRef.current?.click()} className="btn btn-primary">
                  {processing ? "Memproses…" : "Pilih dari perangkat"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("enhance")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
            </div>

            {lastEnhanceResult && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-border bg-success-soft px-3.5 py-3 text-[12px]">
                <div>
                  <p className="font-semibold text-success">Hasil peningkatan terakhir</p>
                  <p className="text-success/90">
                    {lastEnhanceResult.originalWidth} × {lastEnhanceResult.originalHeight} →{" "}
                    <strong className="font-semibold">
                      {lastEnhanceResult.width} × {lastEnhanceResult.height}
                    </strong>{" "}
                    · {formatBytes(lastEnhanceResult.originalSize)} →{" "}
                    {formatBytes(lastEnhanceResult.enhancedSize)}
                  </p>
                </div>
                <span className="chip chip-success">
                  {Math.round((lastEnhanceResult.width / lastEnhanceResult.originalWidth) * 100)}% lebih besar
                </span>
              </div>
            )}
          </div>
        )}

        {tool === "img2pdf" && (
          <div className="space-y-4">
            <input type="file" ref={img2PdfRef} onChange={onImagesToPDF} multiple accept="image/*" className="hidden" />
            <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
              <Layers className="mx-auto mb-2 h-9 w-9 text-[var(--tile-blue-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih satu atau beberapa foto</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
                Format JPG, PNG, atau WEBP. Foto akan digabung berurutan menjadi satu berkas PDF.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button disabled={processing} onClick={() => img2PdfRef.current?.click()} className="btn btn-primary">
                  {processing ? "Memproses…" : "Pilih dari perangkat"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("img2pdf")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
            </div>
          </div>
        )}

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
            <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
              <FileText className="mx-auto mb-2 h-9 w-9 text-[var(--tile-purple-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih minimal 2 berkas PDF</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
                Cocok untuk menggabung ijazah, formulir, atau tagihan menjadi satu dokumen.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button disabled={processing} onClick={() => mergePdfRef.current?.click()} className="btn btn-primary">
                  {processing ? "Memproses…" : "Pilih dari perangkat"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("mergepdf")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
            </div>
          </div>
        )}

        {tool === "idphoto" && (
          <div className="space-y-4">
            <input type="file" ref={idPhotoRef} onChange={onCreateIDPhoto} accept="image/*" className="hidden" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span className="label">Ukuran pasfoto</span>
                <div className="flex gap-2">
                  {(["3x4", "4x6"] as const).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => onIdPhotoRatioChange(ratio)}
                      aria-pressed={idPhotoRatio === ratio}
                      className={`flex-1 rounded-xl border py-2.5 text-[12px] font-semibold transition-colors ${
                        idPhotoRatio === ratio
                          ? "border-brand-border bg-brand-soft text-brand"
                          : "border-line bg-surface text-muted hover:text-fg"
                      }`}
                    >
                      {ratio === "3x4" ? "3 × 4 cm" : "4 × 6 cm"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Warna latar</span>
                <div className="flex gap-2">
                  {[
                    { color: "#dc2626", name: "Merah", text: "#ffffff" },
                    { color: "#2563eb", name: "Biru", text: "#ffffff" },
                    { color: "#ffffff", name: "Putih", text: "#111827" },
                  ].map((bg) => (
                    <button
                      key={bg.color}
                      onClick={() => onIdPhotoBgChange(bg.color)}
                      aria-pressed={idPhotoBg === bg.color}
                      className={`flex-1 rounded-xl border py-2.5 text-[12px] font-semibold transition-all ${
                        idPhotoBg === bg.color
                          ? "border-brand-solid ring-2 ring-brand-border"
                          : "border-line-strong"
                      }`}
                      style={{ backgroundColor: bg.color, color: bg.text }}
                    >
                      {bg.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center">
              <Scissors className="mx-auto mb-2 h-8 w-8 text-[var(--tile-rose-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih foto untuk dijadikan pasfoto</p>
              <p className="mt-0.5 text-[12px] text-subtle">
                Foto otomatis dipotong dan disesuaikan ke ukuran resmi 300 DPI.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button disabled={processing} onClick={() => idPhotoRef.current?.click()} className="btn btn-primary">
                  {processing ? "Memproses…" : "Pilih dari perangkat"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("idphoto")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
            </div>
          </div>
        )}

        {tool === "compress" && (
          <div className="space-y-4">
            <input type="file" ref={compressRef} onChange={onCompressImage} accept="image/*" className="hidden" />

            <div>
              <div className="mb-2 flex items-center justify-between text-[12px]">
                <label htmlFor="compress-quality" className="font-semibold text-muted">
                  Kualitas hasil
                </label>
                <span className="font-semibold tabular-nums text-success">
                  {Math.round(compressQuality * 100)}%
                </span>
              </div>
              <input
                id="compress-quality"
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={compressQuality}
                onChange={(e) => onCompressQualityChange(parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-3 accent-[var(--brand-solid)]"
              />
              <div className="mt-1 flex justify-between text-[11px] text-subtle">
                <span>Ukuran lebih kecil</span>
                <span>Kualitas lebih tajam</span>
              </div>
            </div>

            <div className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-[var(--tile-green-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih foto yang ingin dikompres</p>
              <p className="mt-0.5 text-[12px] text-subtle">Hasil kompresi tetap menyimpan detail penting.</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button disabled={processing} onClick={() => compressRef.current?.click()} className="btn btn-primary">
                  {processing ? "Mengompres…" : "Pilih dari perangkat"}
                </button>
                <button
                  disabled={processing}
                  onClick={() => onOpenStoragePicker("compress")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
            </div>

            {lastCompressResult && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-border bg-success-soft px-3.5 py-3 text-[12px]">
                <div>
                  <p className="font-semibold text-success">Hasil kompresi terakhir</p>
                  <p className="text-success/90">
                    {formatBytes(lastCompressResult.originalSize)} →{" "}
                    <strong className="font-semibold">{formatBytes(lastCompressResult.compressedSize)}</strong>
                  </p>
                </div>
                <span className="chip chip-success">Hemat {lastCompressResult.savingsPercent}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-[11.5px] text-subtle">
        Berkas hasil olahan otomatis tersimpan ke penyimpanan yang sedang aktif.
      </p>
    </div>
  );
}
