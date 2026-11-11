/**
 * Alat AI & peningkatan foto untuk Studio.
 *
 * Semua proses berjalan di perangkat pengguna (Canvas API + ONNX Runtime Web).
 * Tidak ada foto yang diunggah ke server mana pun.
 */

/** Perkiraan ukuran model yang diunduh sekali saat pertama kali memakai Hapus Latar. */
export const BG_MODEL_APPROX_MB = 80;

/** Kunci localStorage untuk menandai model sudah pernah diunduh. */
export const BG_MODEL_READY_KEY = "nas-bg-model-ready";

export type BgPhase = "download" | "process";

/**
 * Opsi pembersihan setelah model AI memisahkan latar. Satu alur dipakai untuk
 * foto maupun logo, jadi pengguna tidak perlu memilih jenis gambar.
 */
export interface BgOptions {
  /** Kekuatan pembersihan sisa warna latar, 0–50. 0 berarti tidak dibersihkan. */
  tolerance?: number;
  /** Buang bayangan abu-abu yang sering tertinggal di tepi objek. */
  dropShadow?: boolean;
}

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
 * Hapus latar belakang memakai model ISNet fp16 (±80 MB) yang berjalan di
 * WebGPU bila tersedia, dengan fallback otomatis ke WASM.
 *
 * Model diunduh dari CDN IMG.LY pada pemanggilan pertama lalu disimpan di cache
 * peramban, sehingga pemakaian berikutnya berjalan offline.
 */
export async function removeImageBackground(
  file: File,
  onProgress?: (progress: BgProgress) => void,
  options: BgOptions = {}
): Promise<ImageOutput> {
  const { removeBackground } = await import("@imgly/background-removal");

  const blob = await removeBackground(file, {
    model: "isnet_fp16",
    // Paket otomatis memakai WebGPU bila tersedia dan kembali ke WASM bila tidak.
    device: "gpu",
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      if (!onProgress) return;
      const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
      onProgress({ phase: key.startsWith("fetch") ? "download" : "process", percent });
    },
  });

  // Mask dari model masih menyisakan piksel alpha rendah dan warna latar di
  // sekitar objek. Bersihkan supaya tepinya tidak berbayang abu-abu.
  const cleaned = await refineAlpha(blob, file, options);
  const size = await readImageSize(cleaned);
  return { blob: cleaned, width: size.width, height: size.height };
}

/** Ambil warna latar dari cincin piksel terluar, memakai warna tersering. */
function sampleBorderColor(data: Uint8ClampedArray, width: number, height: number) {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  const add = (index: number) => {
    if (data[index + 3] < 16) return;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  };

  for (let x = 0; x < width; x++) {
    add(x * 4);
    add(((height - 1) * width + x) * 4);
  }
  for (let y = 0; y < height; y++) {
    add(y * width * 4);
    add((y * width + width - 1) * 4);
  }

  let best = { count: 0, r: 255, g: 255, b: 255 };
  for (const bucket of buckets.values()) {
    if (bucket.count > best.count) best = bucket;
  }
  if (best.count === 0) return { r: 255, g: 255, b: 255 };

  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

/** Abu-abu netral di antara hitam dan putih — ciri khas bayangan lembut. */
function looksLikeGreyShadow(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return max - min <= 26 && luma > 70 && luma < 232;
}

/** Haluskan tepi 1 px supaya hasil tidak bergerigi. */
function featherAlpha(alpha: Uint8Array, width: number, height: number) {
  const source = alpha.slice();

  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    const aboveStart = Math.max(0, y - 1) * width;
    const belowStart = Math.min(height - 1, y + 1) * width;

    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const total =
        source[aboveStart + left] +
        source[aboveStart + x] +
        source[aboveStart + right] +
        source[rowStart + left] +
        source[rowStart + x] +
        source[rowStart + right] +
        source[belowStart + left] +
        source[belowStart + x] +
        source[belowStart + right];
      alpha[rowStart + x] = Math.round(total / 9);
    }
  }
}

/**
 * Rapikan mask dari model: buang sisa warna latar di dekat tepi, buang bayangan
 * abu-abu bila diminta, regangkan alpha, lalu hilangkan bintik kecil.
 */
async function refineAlpha(blob: Blob, source: File, options: BgOptions): Promise<Blob> {
  const [maskBitmap, sourceBitmap] = await Promise.all([createImageBitmap(blob), createImageBitmap(source)]);
  const width = maskBitmap.width;
  const height = maskBitmap.height;
  const total = width * height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    maskBitmap.close();
    sourceBitmap.close();
    return blob;
  }
  ctx.drawImage(maskBitmap, 0, 0);
  maskBitmap.close();

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  // Warna asli diperlukan untuk mengenali sisa latar dan bayangan.
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d");
  let sourceData: Uint8ClampedArray | null = null;
  if (sourceCtx) {
    sourceCtx.drawImage(sourceBitmap, 0, 0, width, height);
    sourceData = sourceCtx.getImageData(0, 0, width, height).data;
  }
  sourceBitmap.close();

  const tolerance = Math.max(0, Math.min(50, options.tolerance ?? 15));
  const dropShadow = options.dropShadow ?? true;
  const background = sourceData ? sampleBorderColor(sourceData, width, height) : null;
  const nearEdge = tolerance > 0 && sourceData ? markNearTransparent(data, width, height, 3) : null;
  const limit = Math.round(tolerance * 2.55);
  const low = 18;
  const high = 235;

  for (let pixel = 0, index = 0; pixel < total; pixel++, index += 4) {
    let alpha = data[index + 3];
    if (alpha === 0) continue;

    if (sourceData) {
      if (nearEdge && nearEdge[pixel] && background) {
        const diff = Math.max(
          Math.abs(sourceData[index] - background.r),
          Math.abs(sourceData[index + 1] - background.g),
          Math.abs(sourceData[index + 2] - background.b)
        );
        if (diff <= limit) alpha = 0;
      }
      if (alpha > 0 && dropShadow && looksLikeGreyShadow(sourceData[index], sourceData[index + 1], sourceData[index + 2])) {
        alpha = 0;
      }
    }

    data[index + 3] = alpha <= low ? 0 : alpha >= high ? 255 : Math.round(((alpha - low) / (high - low)) * 255);
  }

  const alphaMask = new Uint8Array(total);
  for (let pixel = 0, index = 3; pixel < total; pixel++, index += 4) {
    alphaMask[pixel] = data[index];
  }
  featherAlpha(alphaMask, width, height);
  for (let pixel = 0, index = 3; pixel < total; pixel++, index += 4) {
    data[index] = alphaMask[pixel];
  }

  clearSmallAlphaIslands(data, width, height);
  ctx.putImageData(image, 0, 0);
  return canvasToBlob(canvas);
}

/**
 * Tandai piksel yang jaraknya maksimal `radius` dari area transparan. Sisa
 * warna latar hanya dibersihkan di area ini supaya warna objek di bagian dalam
 * tidak ikut terhapus.
 */
function markNearTransparent(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  const total = width * height;
  const near = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let pixel = 0; pixel < total; pixel++) {
    if (data[pixel * 4 + 3] === 0) {
      near[pixel] = 1;
      queue[tail++] = pixel;
    }
  }

  let depth = 0;
  while (head < tail && depth < radius) {
    const layerEnd = tail;
    while (head < layerEnd) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = (pixel - x) / width;

      if (x > 0 && !near[pixel - 1]) {
        near[pixel - 1] = 1;
        queue[tail++] = pixel - 1;
      }
      if (x < width - 1 && !near[pixel + 1]) {
        near[pixel + 1] = 1;
        queue[tail++] = pixel + 1;
      }
      if (y > 0 && !near[pixel - width]) {
        near[pixel - width] = 1;
        queue[tail++] = pixel - width;
      }
      if (y < height - 1 && !near[pixel + width]) {
        near[pixel + width] = 1;
        queue[tail++] = pixel + width;
      }
    }
    depth++;
  }

  return near;
}

/** Hapus gumpalan opaque yang luasnya di bawah ambang (debu sisa model). */
function clearSmallAlphaIslands(data: Uint8ClampedArray, width: number, height: number) {
  const total = width * height;
  if (total > 12_000_000) return;

  const minArea = Math.max(12, Math.round(total * 0.00002));
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);

  for (let start = 0; start < total; start++) {
    if (visited[start] || data[start * 4 + 3] < 128) continue;

    const area = floodOpaque(start, width, height, data, visited, stack);
    if (area < minArea) {
      // Telusuri ulang komponen kecil lalu jadikan transparan.
      clearOpaque(start, width, height, data);
    }
  }
}

/** Tandai satu komponen opaque dan kembalikan luasnya. */
function floodOpaque(
  start: number,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  visited: Uint8Array,
  stack: Int32Array
) {
  let top = 0;
  let area = 0;
  stack[top++] = start;
  visited[start] = 1;

  while (top > 0) {
    const pixel = stack[--top];
    area += 1;
    const x = pixel % width;
    const y = (pixel - x) / width;

    if (x > 0) {
      const next = pixel - 1;
      if (!visited[next] && data[next * 4 + 3] >= 128) {
        visited[next] = 1;
        stack[top++] = next;
      }
    }
    if (x < width - 1) {
      const next = pixel + 1;
      if (!visited[next] && data[next * 4 + 3] >= 128) {
        visited[next] = 1;
        stack[top++] = next;
      }
    }
    if (y > 0) {
      const next = pixel - width;
      if (!visited[next] && data[next * 4 + 3] >= 128) {
        visited[next] = 1;
        stack[top++] = next;
      }
    }
    if (y < height - 1) {
      const next = pixel + width;
      if (!visited[next] && data[next * 4 + 3] >= 128) {
        visited[next] = 1;
        stack[top++] = next;
      }
    }
  }

  return area;
}

/** Kosongkan alpha satu komponen opaque (dipakai untuk bintik kecil). */
function clearOpaque(start: number, width: number, height: number, data: Uint8ClampedArray) {
  const stack = [start];
  data[start * 4 + 3] = 0;

  while (stack.length > 0) {
    const pixel = stack.pop() as number;
    const x = pixel % width;
    const y = (pixel - x) / width;

    if (x > 0 && data[(pixel - 1) * 4 + 3] >= 128) {
      data[(pixel - 1) * 4 + 3] = 0;
      stack.push(pixel - 1);
    }
    if (x < width - 1 && data[(pixel + 1) * 4 + 3] >= 128) {
      data[(pixel + 1) * 4 + 3] = 0;
      stack.push(pixel + 1);
    }
    if (y > 0 && data[(pixel - width) * 4 + 3] >= 128) {
      data[(pixel - width) * 4 + 3] = 0;
      stack.push(pixel - width);
    }
    if (y < height - 1 && data[(pixel + width) * 4 + 3] >= 128) {
      data[(pixel + width) * 4 + 3] = 0;
      stack.push(pixel + width);
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Gagal menyimpan gambar."))),
      "image/png"
    );
  });
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
