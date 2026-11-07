/**
 * Image Studio client-side tools (Canvas API, Web Workers, 100% on-device).
 */

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  savingsPercent: number;
}

export function compressAndResizeImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8,
  outputFormat: "image/jpeg" | "image/webp" | "image/png" = "image/jpeg"
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let targetWidth = img.width;
      let targetHeight = img.height;

      if (targetWidth > maxWidth) {
        targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
        targetWidth = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Gagal menginisialisasi canvas context."));
        return;
      }

      // Smooth resizing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Gagal membuat blob kompresi gambar."));
            return;
          }

          const savings = Math.max(
            0,
            Math.round(((file.size - blob.size) / file.size) * 100)
          );

          resolve({
            blob,
            originalSize: file.size,
            compressedSize: blob.size,
            width: targetWidth,
            height: targetHeight,
            savingsPercent: savings,
          });
        },
        outputFormat,
        quality
      );
    };

    img.onerror = () => reject(new Error("Format file gambar tidak didukung atau rusak."));
    img.src = url;
  });
}

/**
 * Buat foto paspor resmi (ukuran 3x4 = 354x472 px, atau 4x6 = 472x709 px pada 300 DPI)
 * dengan opsi background (merah, biru, putih, atau transparan).
 */
export function createIDPhoto(
  file: File,
  ratio: "3x4" | "4x6" = "3x4",
  bgColor: string = "#e11d48" // default merah paspor
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    // Resolusi standar 300 DPI:
    // 3x4 cm = ~354 x 472 px
    // 4x6 cm = ~472 x 709 px
    const targetWidth = ratio === "3x4" ? 354 : 472;
    const targetHeight = ratio === "3x4" ? 472 : 709;

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas context tidak tersedia."));
        return;
      }

      // Draw background color
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Center crop image to target ratio
      const imgRatio = img.width / img.height;
      const targetRatio = targetWidth / targetHeight;

      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = img.width;
      let sourceHeight = img.height;

      if (imgRatio > targetRatio) {
        // Image is wider than target ratio
        sourceWidth = img.height * targetRatio;
        sourceX = (img.width - sourceWidth) / 2;
      } else {
        // Image is taller than target ratio
        sourceHeight = img.width / targetRatio;
        sourceY = (img.height - sourceHeight) / 2;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        targetWidth,
        targetHeight
      );

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Gagal membuat foto ukuran paspor."));
        },
        "image/jpeg",
        0.95
      );
    };

    img.onerror = () => reject(new Error("Gagal membaca file gambar."));
    img.src = url;
  });
}
