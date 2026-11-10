/**
 * Alat AI & peningkatan foto untuk Studio.
 *
 * Semua proses berjalan di perangkat pengguna (Canvas API + ONNX Runtime Web).
 * Tidak ada foto yang diunggah ke server mana pun.
 */

/** Perkiraan ukuran model yang diunduh sekali saat pertama kali memakai Hapus Latar. */
export const BG_MODEL_APPROX_MB = 40;

/** Kunci localStorage untuk menandai model sudah pernah diunduh. */
export const BG_MODEL_READY_KEY = "nas-bg-model-ready";

export type BgPhase = "download" | "process";

export interface BgProgress {
  phase: BgPhase;
  /** 0–100. Bernilai 0 saat fase pemrosesan belum melaporkan kemajuan. */
  percent: number;
}

export interface ImageOutput {
  blob: Blob;
  width: number;
  height: number;
}

export interface EnhanceResult extends ImageOutput {
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  enhancedSize: number;
}

/**
 * Hapus latar belakang foto memakai model ISNet (kuantisasi, ±40 MB).
 *
 * Model diunduh dari CDN IMG.LY pada pemanggilan pertama lalu disimpan di cache
 * peramban, sehingga pemakaian berikutnya berjalan offline.
 */
export async function removeImageBackground(
  file: File,
  onProgress?: (progress: BgProgress) => void
): Promise<ImageOutput> {
  const { removeBackground } = await import("@imgly/background-removal");

  const blob = await removeBackground(file, {
    model: "isnet_quint8",
    device: "cpu",
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      if (!onProgress) return;
      const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
      onProgress({ phase: key.startsWith("fetch") ? "download" : "process", percent });
    },
  });

  const size = await readImageSize(blob);
  return { blob, width: size.width, height: size.height };
}

/** Batas aman supaya canvas tidak kehabisan memori di ponsel. */
const MAX_OUTPUT_PIXELS = 8_000_000;
const MAX_OUTPUT_DIMENSION = 4000;

export interface EnhanceOptions {
  /** Faktor perbesaran. Default 2 (dua kali lipat). */
  scale?: number;
  /** Kekuatan penajaman 0–1. Default 0.55. */
  sharpen?: number;
  /** Pengali kontras. Default 1.06. */
  contrast?: number;
  /** Pengali saturasi warna. Default 1.08. */
  saturation?: number;
}

/**
 * Tingkatkan kualitas foto: perbesar 2×, pertajam detail, lalu rapikan kontras
 * dan saturasi. Hasil dikodekan sebagai JPEG kualitas tinggi.
 */
export async function enhancePhoto(file: File, options: EnhanceOptions = {}): Promise<EnhanceResult> {
  const { scale = 2, sharpen = 0.55, contrast = 1.06, saturation = 1.08 } = options;

  const bitmap = await createImageBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;

  const { width, height } = planOutputSize(originalWidth, originalHeight, scale);
  const canvas = upscaleProgressive(bitmap, width, height);
  bitmap.close();

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Peramban ini tidak mendukung pengolahan gambar.");

  const imageData = ctx.getImageData(0, 0, width, height);
  applyDetailPass(imageData.data, width, height, { sharpen, contrast, saturation });
  ctx.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Gagal menyimpan foto hasil peningkatan.")),
      "image/jpeg",
      0.92
    );
  });

  return {
    blob,
    width,
    height,
    originalWidth,
    originalHeight,
    originalSize: file.size,
    enhancedSize: blob.size,
  };
}

function planOutputSize(width: number, height: number, scale: number) {
  let targetWidth = Math.max(1, Math.round(width * scale));
  let targetHeight = Math.max(1, Math.round(height * scale));

  const dimensionLimit = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(targetWidth, targetHeight));
  const pixelLimit = Math.min(1, Math.sqrt(MAX_OUTPUT_PIXELS / (targetWidth * targetHeight)));
  const limit = Math.min(dimensionLimit, pixelLimit);

  if (limit < 1) {
    targetWidth = Math.max(1, Math.round(targetWidth * limit));
    targetHeight = Math.max(1, Math.round(targetHeight * limit));
  }

  return { width: targetWidth, height: targetHeight };
}

/**
 * Perbesar bertahap (2× per langkah) supaya interpolasi tetap halus, bukan
 * melompat langsung dari ukuran asli ke ukuran akhir.
 */
function upscaleProgressive(source: ImageBitmap, targetWidth: number, targetHeight: number) {
  let currentSource: CanvasImageSource = source;
  let currentWidth = source.width;
  let currentHeight = source.height;

  while (currentWidth * 2 <= targetWidth) {
    currentWidth *= 2;
    currentHeight *= 2;
    currentSource = drawToCanvas(currentSource, currentWidth, currentHeight);
  }

  return drawToCanvas(currentSource, targetWidth, targetHeight);
}

function drawToCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Peramban ini tidak mendukung pengolahan gambar.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);

  return canvas;
}

interface DetailOptions {
  sharpen: number;
  contrast: number;
  saturation: number;
}

/**
 * Satu lintasan piksel: unsharp mask (pertajam), lalu koreksi kontras dan
 * saturasi. Digabung supaya tidak membaca ulang seluruh piksel berkali-kali.
 */
function applyDetailPass(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  { sharpen, contrast, saturation }: DetailOptions
) {
  const blurred = boxBlur3(data, width, height);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] + sharpen * (data[i] - blurred[i]);
    let g = data[i + 1] + sharpen * (data[i + 1] - blurred[i + 1]);
    let b = data[i + 2] + sharpen * (data[i + 2] - blurred[i + 2]);

    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = luma + (r - luma) * saturation;
    data[i + 1] = luma + (g - luma) * saturation;
    data[i + 2] = luma + (b - luma) * saturation;
  }
}

/** Box blur 3×3 terpisah (horizontal lalu vertikal) — cukup untuk unsharp mask. */
function boxBlur3(source: Uint8ClampedArray, width: number, height: number) {
  const horizontal = new Uint8ClampedArray(source.length);
  const result = new Uint8ClampedArray(source.length);

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const index = rowStart + x * 4;
      const left = rowStart + Math.max(0, x - 1) * 4;
      const right = rowStart + Math.min(width - 1, x + 1) * 4;
      for (let c = 0; c < 4; c++) {
        horizontal[index + c] = (source[left + c] + source[index + c] + source[right + c]) / 3;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    const aboveStart = Math.max(0, y - 1) * width * 4;
    const belowStart = Math.min(height - 1, y + 1) * width * 4;
    for (let x = 0; x < width; x++) {
      const index = rowStart + x * 4;
      const offset = x * 4;
      for (let c = 0; c < 4; c++) {
        result[index + c] =
          (horizontal[aboveStart + offset + c] + horizontal[index + c] + horizontal[belowStart + offset + c]) / 3;
      }
    }
  }

  return result;
}

async function readImageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
