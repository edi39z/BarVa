import { PDFDocument } from "pdf-lib";

/**
 * Merge multiple PDF files into one single PDF in-memory (Client-side, 0 server cost).
 */
export async function mergePDFs(files: File[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return mergedPdf.save();
}

/**
 * Convert an array of image files (JPG, PNG) into a single PDF document.
 */
export async function imagesToPDF(files: File[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    let image;

    if (file.type === "image/jpeg" || file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg")) {
      image = await pdfDoc.embedJpg(arrayBuffer);
    } else if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) {
      image = await pdfDoc.embedPng(arrayBuffer);
    } else {
      // If WebP or other format, convert via canvas to JPEG first
      const convertedBlob = await convertImageToBlob(file, "image/jpeg");
      const convertedBuffer = await convertedBlob.arrayBuffer();
      image = await pdfDoc.embedJpg(convertedBuffer);
    }

    const { width, height } = image.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  return pdfDoc.save();
}

/**
 * Helper to convert any image format to JPEG or PNG Blob using HTML Canvas
 */
function convertImageToBlob(file: File, outputType: "image/jpeg" | "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context is not available"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Blob conversion failed"));
        },
        outputType,
        0.92
      );
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}
