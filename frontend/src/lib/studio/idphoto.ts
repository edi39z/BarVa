// Pasfoto: ukuran resmi, warna latar bebas, dan komposit dengan latar hasil AI.
//
// Latar yang benar-benar terlihat hanya bisa dibuat kalau subjek sudah
// terpisah dari latar aslinya. Karena itu alur utamanya memakai hasil
// `removeImageBackground` (PNG transparan), lalu subjek ditempel di atas warna
// pilihan. Versi lama menggambar foto dengan mode *cover* sehingga warna latar
// tertutup seluruhnya.

import { StudioError } from "./errors";

const MM_PER_INCH = 25.4;
const MIN_SIDE_PX = 50;
const MAX_SIDE_PX = 4000;
const ALPHA_THRESHOLD = 16;
const BOUNDS_SCAN_WIDTH = 256;

export type IdPhotoPresetId = "2x3" | "3x4" | "4x6" | "passport" | "square2in" | "custom";

export interface IdPhotoPreset {
  id: Exclude<IdPhotoPresetId, "custom">;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const ID_PHOTO_PRESETS: readonly IdPhotoPreset[] = [
  { id: "2x3", label: "2 × 3 cm", widthMm: 20, heightMm: 30 },
  { id: "3x4", label: "3 × 4 cm", widthMm: 30, heightMm: 40 },
  { id: "4x6", label: "4 × 6 cm", widthMm: 40, heightMm: 60 },
  { id: "passport", label: "Paspor 35 × 50 mm", widthMm: 35, heightMm: 50 },
  { id: "square2in", label: "2 × 2 inci", widthMm: 50.8, heightMm: 50.8 },
];

export type SizeUnit = "cm" | "mm" | "px";

export interface CustomSize {
  width: number;
  height: number;
  unit: SizeUnit;
  dpi: number;
}

export interface ResolvedSize {
  widthPx: number;
  heightPx: number;
  /** Ringkasan untuk ditampilkan di UI, mis. "354 × 472 px · 3 × 4 cm". */
  label: string;
}

/** Warna latar yang sering dipakai pasfoto, dipakai sebagai pilihan cepat. */
export const ID_PHOTO_COLORS: readonly { value: string; name: string }[] = [
  { value: "#dc2626", name: "Merah" },
  { value: "#2563eb", name: "Biru" },
  { value: "#ffffff", name: "Putih" },
  { value: "#d1d5db", name: "Abu" },
  { value: "#f5e6c8", name: "Krem" },
  { value: "#16a34a", name: "Hijau" },
];

function clampSide(value: number): number {
  if (!Number.isFinite(value)) return MIN_SIDE_PX;
  return Math.min(MAX_SIDE_PX, Math.max(MIN_SIDE_PX, Math.round(value)));
}

function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

/**
 * Ubah preset atau ukuran kustom menjadi ukuran piksel.
 *
 * DPI hanya berpengaruh untuk satuan fisik (cm/mm); untuk satuan px nilainya
 * diabaikan karena pengguna sudah menentukan piksel secara langsung.
 */
export function resolveIdPhotoSize(
  preset: IdPhotoPresetId,
  custom: CustomSize
): ResolvedSize {
  if (preset !== "custom") {
    const found = ID_PHOTO_PRESETS.find((item) => item.id === preset) ?? ID_PHOTO_PRESETS[1];
    const dpi = Number.isFinite(custom.dpi) && custom.dpi > 0 ? custom.dpi : 300;
    const widthPx = clampSide(mmToPx(found.widthMm, dpi));
    const heightPx = clampSide(mmToPx(found.heightMm, dpi));
    return {
      widthPx,
      heightPx,
      label: `${widthPx} × ${heightPx} px · ${found.label}`,
    };
  }

  const dpi = Number.isFinite(custom.dpi) && custom.dpi > 0 ? custom.dpi : 300;
  const width = Number.isFinite(custom.width) && custom.width > 0 ? custom.width : 3;
  const height = Number.isFinite(custom.height) && custom.height > 0 ? custom.height : 4;

  let widthPx: number;
  let heightPx: number;
  let physical: string;

  if (custom.unit === "px") {
    widthPx = clampSide(width);
    heightPx = clampSide(height);
    physical = `${widthPx} × ${heightPx} px`;
  } else {
    const factor = custom.unit === "cm" ? 10 : 1; // ke milimeter
    widthPx = clampSide(mmToPx(width * factor, dpi));
    heightPx = clampSide(mmToPx(height * factor, dpi));
    physical = `${width} × ${height} ${custom.unit} · ${dpi} DPI`;
  }

  return { widthPx, heightPx, label: `${widthPx} × ${heightPx} px · ${physical}` };
}

/**
 * Terima "#fff", "fff", "#FFFFFF", atau "FFFFFF"; kembalikan "#rrggbb".
 * Mengembalikan null bila bukan kode warna yang sah.
 */
export function normalizeHexColor(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(raw) && !/^[0-9a-fA-F]{6}$/.test(raw)) return null;

  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;

  return `#${expanded.toLowerCase()}`;
}

export interface RelativeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cari kotak terkecil yang memuat piksel tidak transparan, dalam koordinat
 * relatif 0..1 terhadap gambar.
 *
 * Pemindaian dilakukan pada kanvas kecil karena membaca seluruh piksel foto
 * 12 MP akan lambat dan boros memori. Hasilnya null bila gambar sepenuhnya
 * transparan.
 */
export async function alphaBounds(bitmap: ImageBitmap): Promise<RelativeBounds | null> {
  const scale = Math.min(1, BOUNDS_SCAN_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  canvas.width = 0;
  canvas.height = 0;

  if (maxX < 0 || maxY < 0) return null;

  return {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  };
}

export interface ComposeIdPhotoOptions {
  /** PNG transparan hasil pemisahan latar. */
  cutout: Blob;
  widthPx: number;
  heightPx: number;
  backgroundColor: string;
  /** 0.85–1.15; memperbesar atau memperkecil subjek di dalam kanvas. */
  zoom?: number;
  /** 0.04–0.12; porsi ruang kosong di atas kepala. */
  headroom?: number;
  quality?: number;
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new StudioError(
      "IMAGE_INVALID",
      "Gambar tidak bisa dibuka peramban ini.",
      "Gunakan JPG, PNG, atau WEBP."
    );
  }
}

/**
 * Susun pasfoto: latar diisi warna pilihan, lalu subjek tanpa latar digambar
 * di atasnya dengan skala yang menjaga proporsi.
 */
export async function composeIdPhoto(options: ComposeIdPhotoOptions): Promise<Blob> {
  const { cutout, widthPx, heightPx, backgroundColor } = options;
  const zoom = options.zoom ?? 1;
  const headroom = options.headroom ?? 0.07;
  const quality = options.quality ?? 0.95;

  const bitmap = await decode(cutout);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new StudioError("EXPORT_FAILED", "Kanvas tidak tersedia di peramban ini.");
    }

    ctx.fillStyle = normalizeHexColor(backgroundColor) ?? "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    const bounds = (await alphaBounds(bitmap)) ?? { x: 0, y: 0, width: 1, height: 1 };

    // Skala ditentukan oleh sisi yang lebih membatasi, supaya seluruh subjek
    // masuk ke kanvas tanpa terpotong.
    const subjectWidth = bounds.width * bitmap.width;
    const subjectHeight = bounds.height * bitmap.height;
    const scale =
      Math.min(widthPx / Math.max(1, subjectWidth), heightPx / Math.max(1, subjectHeight)) * zoom;

    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const drawX = (widthPx - drawWidth) / 2 - bounds.x * drawWidth;
    const drawY = headroom * heightPx - bounds.y * drawHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, drawX, drawY, drawWidth, drawHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    canvas.width = 0;
    canvas.height = 0;

    if (!blob) {
      throw new StudioError("EXPORT_FAILED", "Hasil pasfoto gagal disusun.");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
