"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Folder, Loader2, Scissors, ShieldCheck } from "lucide-react";
import { BG_MODEL_APPROX_MB, removeImageBackground, type BgProgress } from "@/lib/studio/ai";
import { describeStudioError, StudioError, type StudioErrorInfo } from "@/lib/studio/errors";
import {
  composeIdPhoto,
  ID_PHOTO_COLORS,
  ID_PHOTO_PRESETS,
  normalizeHexColor,
  resolveIdPhotoSize,
  type CustomSize,
  type IdPhotoPresetId,
} from "@/lib/studio/idphoto";
import { makeImageOutput } from "@/lib/studio/output";
import StudioAlert from "./StudioAlert";
import StudioProgress from "./StudioProgress";
import type { BgModelPanelProps } from "./types";

const DEFAULT_COLOR = "#dc2626";

function labelFor(preset: IdPhotoPresetId, widthPx: number, heightPx: number): string {
  if (preset === "custom") return `${widthPx}x${heightPx}`;
  return preset;
}

export default function IdPhotoPanel({
  incomingFile,
  onIncomingFileHandled,
  onCommit,
  onSuccess,
  onOpenStoragePicker,
  bgModelReady,
  onBgModelReady,
}: BgModelPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [cutout, setCutout] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [preset, setPreset] = useState<IdPhotoPresetId>("3x4");
  const [custom, setCustom] = useState<CustomSize>({ width: 3, height: 4, unit: "cm", dpi: 300 });
  const [bgColor, setBgColor] = useState(DEFAULT_COLOR);
  const [hexInput, setHexInput] = useState(DEFAULT_COLOR);
  const [hexInvalid, setHexInvalid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [headroom, setHeadroom] = useState(0.07);

  const [progress, setProgress] = useState<BgProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StudioErrorInfo | null>(null);

  const size = useMemo(() => resolveIdPhotoSize(preset, custom), [preset, custom]);

  const replaceSourceUrl = useCallback((next: string | null) => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = next;
    setSourceUrl(next);
  }, []);

  const replacePreviewUrl = useCallback((next: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }, []);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const runSeparation = useCallback(
    async (target: File) => {
      setBusy(true);
      setError(null);
      setProgress({ phase: "download", percent: 0 });
      try {
        const result = await removeImageBackground(target, setProgress);
        setCutout(result.blob);
        onBgModelReady();
      } catch (err) {
        setError(describeStudioError(err));
      } finally {
        setProgress(null);
        setBusy(false);
      }
    },
    [onBgModelReady]
  );

  const acceptFile = useCallback(
    (next: File) => {
      setError(null);
      setCutout(null);
      replacePreviewUrl(null);

      if (!next.type.startsWith("image/")) {
        setError(
          describeStudioError(
            new StudioError("IMAGE_INVALID", "Berkas ini bukan gambar.", "Gunakan JPG, PNG, atau WEBP.")
          )
        );
        return;
      }

      setFile(next);
      replaceSourceUrl(URL.createObjectURL(next));

      // Model yang sudah tersimpan langsung dipakai; kalau belum, pengguna
      // diminta menyetujui unduhan ±40 MB lebih dulu lewat kartu di bawah.
      if (bgModelReady) void runSeparation(next);
    },
    [bgModelReady, replacePreviewUrl, replaceSourceUrl, runSeparation]
  );

  // Berkas dari Storage Picker baru diketahui setelah pengguna memilih, jadi
  // nilainya memang baru bisa dibaca di dalam efek — bukan hasil turunan render.
  useEffect(() => {
    if (!incomingFile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    acceptFile(incomingFile);
    onIncomingFileHandled();
  }, [incomingFile, acceptFile, onIncomingFileHandled]);

  // Pratinjau disusun ulang setiap ukuran, warna, atau skala berubah. Model AI
  // tidak dipanggil lagi — hanya komposit kanvas.
  useEffect(() => {
    if (!cutout) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void composeIdPhoto({
        cutout,
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        backgroundColor: bgColor,
        zoom,
        headroom,
      })
        .then((blob) => {
          if (cancelled) return;
          replacePreviewUrl(URL.createObjectURL(blob));
        })
        .catch(() => {
          // Pratinjau gagal tidak perlu menghentikan pengguna; galat muncul
          // saat menyimpan bila memang ada masalah.
        });
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cutout, size.widthPx, size.heightPx, bgColor, zoom, headroom, replacePreviewUrl]);

  const applyHex = (value: string) => {
    setHexInput(value);
    const normalized = normalizeHexColor(value);
    if (normalized) {
      setBgColor(normalized);
      setHexInvalid(false);
    } else {
      setHexInvalid(value.trim().replace(/^#/, "").length >= 3);
    }
  };

  const applyColor = (value: string) => {
    const normalized = normalizeHexColor(value) ?? DEFAULT_COLOR;
    setBgColor(normalized);
    setHexInput(normalized);
    setHexInvalid(false);
  };

  const handleSave = async () => {
    if (!cutout) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await composeIdPhoto({
        cutout,
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        backgroundColor: bgColor,
        zoom,
        headroom,
      });
      const filename = `Pasfoto_${labelFor(preset, size.widthPx, size.heightPx)}_${Date.now()}.jpg`;
      const result = await onCommit(
        makeImageOutput(blob, filename, `${size.widthPx} × ${size.heightPx} px`)
      );
      if (result.saved) onSuccess(`Pasfoto disimpan sebagai ${filename}.`);
    } catch (err) {
      setError(describeStudioError(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setCutout(null);
    setError(null);
    setProgress(null);
    replaceSourceUrl(null);
    replacePreviewUrl(null);
  };

  const showConsent = Boolean(file) && !cutout && !busy && !bgModelReady;

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileRef}
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) acceptFile(picked);
          event.target.value = "";
        }}
      />

      {error && <StudioAlert error={error} onDismiss={() => setError(null)} />}

      {progress && (
        <StudioProgress
          label={progress.phase === "download" ? "Mengunduh model AI…" : "Memisahkan latar…"}
          percent={progress.percent}
          detail={
            progress.phase === "download"
              ? `Sekitar ${BG_MODEL_APPROX_MB} MB, hanya sekali. Jangan tutup tab ini.`
              : undefined
          }
        />
      )}

      {showConsent && (
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
                Sekitar <strong className="font-semibold text-fg">{BG_MODEL_APPROX_MB} MB</strong>.
                Model dipakai untuk memisahkan orang dari latar aslinya agar warna latar pilihan
                benar-benar terlihat. Setelah tersimpan, alat ini bisa dipakai tanpa internet dan
                foto tidak pernah dikirim ke server mana pun.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={() => file && void runSeparation(file)}
              disabled={busy}
              className="btn btn-primary"
            >
              <Download className="h-4 w-4" aria-hidden />
              Unduh model &amp; proses
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <span className="label">Pratinjau</span>
          {previewUrl ? (
            <div className="mt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Pratinjau pasfoto"
                className="mx-auto max-h-[300px] w-auto rounded-xl border border-line"
              />
            </div>
          ) : sourceUrl ? (
            <div className="mt-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceUrl}
                alt="Foto sumber"
                className="mx-auto max-h-[300px] w-auto rounded-xl border border-line opacity-80"
              />
              <p className="mt-1.5 text-center text-[11.5px] text-subtle">
                Latar belum diganti. Pratinjau muncul setelah pemisahan selesai.
              </p>
            </div>
          ) : (
            <div className="mt-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
              <Scissors className="mx-auto mb-2 h-9 w-9 text-[var(--tile-rose-fg)]" aria-hidden />
              <p className="text-[13px] font-semibold text-fg">Pilih foto untuk dijadikan pasfoto</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-subtle">
                Gunakan foto dengan wajah menghadap kamera dan latar yang tidak terlalu ramai.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="btn btn-primary"
                >
                  Pilih dari perangkat
                </button>
                <button
                  disabled={busy}
                  onClick={() => onOpenStoragePicker("idphoto")}
                  className="btn btn-secondary"
                >
                  <Folder className="h-4 w-4" aria-hidden />
                  Pilih dari berkas tersimpan
                </button>
              </div>
            </div>
          )}
          {file && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[11.5px] text-subtle">{file.name}</span>
              <button onClick={reset} disabled={busy} className="btn btn-ghost btn-sm">
                Ganti foto
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3.5">
          <div>
            <span className="label">Ukuran</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ID_PHOTO_PRESETS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreset(item.id)}
                  aria-pressed={preset === item.id}
                  className={`rounded-xl border px-2 py-2 text-[11.5px] font-semibold transition-colors ${
                    preset === item.id
                      ? "border-brand-border bg-brand-soft text-brand"
                      : "border-line bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => setPreset("custom")}
                aria-pressed={preset === "custom"}
                className={`rounded-xl border px-2 py-2 text-[11.5px] font-semibold transition-colors ${
                  preset === "custom"
                    ? "border-brand-border bg-brand-soft text-brand"
                    : "border-line bg-surface text-muted hover:text-fg"
                }`}
              >
                Kustom
              </button>
            </div>

            {preset === "custom" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-subtle">Lebar</span>
                  <input
                    type="number"
                    min={1}
                    step="0.1"
                    value={custom.width}
                    onChange={(event) =>
                      setCustom((prev) => ({ ...prev, width: Number(event.target.value) }))
                    }
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-subtle">Tinggi</span>
                  <input
                    type="number"
                    min={1}
                    step="0.1"
                    value={custom.height}
                    onChange={(event) =>
                      setCustom((prev) => ({ ...prev, height: Number(event.target.value) }))
                    }
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-subtle">Satuan</span>
                  <select
                    value={custom.unit}
                    onChange={(event) =>
                      setCustom((prev) => ({
                        ...prev,
                        unit: event.target.value as CustomSize["unit"],
                      }))
                    }
                    className="select"
                  >
                    <option value="cm">cm</option>
                    <option value="mm">mm</option>
                    <option value="px">px</option>
                  </select>
                </label>
                {custom.unit !== "px" && (
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-subtle">DPI</span>
                    <select
                      value={custom.dpi}
                      onChange={(event) =>
                        setCustom((prev) => ({ ...prev, dpi: Number(event.target.value) }))
                      }
                      className="select"
                    >
                      <option value={300}>300</option>
                      <option value={600}>600</option>
                    </select>
                  </label>
                )}
              </div>
            )}

            <p className="mt-1.5 text-[11.5px] tabular-nums text-subtle">{size.label}</p>
          </div>

          <div>
            <span className="label">Warna latar</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {ID_PHOTO_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => applyColor(color.value)}
                  aria-pressed={bgColor === color.value}
                  aria-label={`Warna ${color.name}`}
                  title={color.name}
                  className={`h-9 w-9 rounded-full border transition-all ${
                    bgColor === color.value
                      ? "border-brand-solid ring-2 ring-brand-border"
                      : "border-line-strong"
                  }`}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={bgColor}
                onChange={(event) => applyColor(event.target.value)}
                aria-label="Pilih warna latar bebas"
                className="h-9 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface"
              />
              <input
                value={hexInput}
                onChange={(event) => applyHex(event.target.value)}
                maxLength={7}
                spellCheck={false}
                aria-label="Kode warna latar"
                aria-invalid={hexInvalid}
                placeholder="#rrggbb"
                className={`input flex-1 font-mono ${hexInvalid ? "border-danger" : ""}`}
              />
              <span
                className="h-9 w-9 shrink-0 rounded-lg border border-line-strong"
                style={{ backgroundColor: bgColor }}
                aria-hidden
              />
            </div>
            {hexInvalid && (
              <p className="mt-1 text-[11.5px] text-danger">Kode warna harus format #RRGGBB.</p>
            )}
          </div>

          {cutout && (
            <div className="space-y-2.5">
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-[11px] text-subtle">
                  <span>Ukuran subjek</span>
                  <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.85}
                  max={1.15}
                  step={0.01}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  aria-label="Ukuran subjek"
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-3 accent-[var(--brand-solid)]"
                />
              </label>
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-[11px] text-subtle">
                  <span>Ruang atas</span>
                  <span className="tabular-nums">{Math.round(headroom * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.04}
                  max={0.12}
                  step={0.01}
                  value={headroom}
                  onChange={(event) => setHeadroom(Number(event.target.value))}
                  aria-label="Ruang kosong di atas kepala"
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-3 accent-[var(--brand-solid)]"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!cutout || busy}
              className="btn btn-primary"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {busy ? "Memproses…" : "Simpan & unduh"}
            </button>
            {file && (
              <button onClick={reset} disabled={busy} className="btn btn-ghost">
                Batal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
