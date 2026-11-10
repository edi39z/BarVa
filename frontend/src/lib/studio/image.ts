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
