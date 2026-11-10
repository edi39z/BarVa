// Salin Web Worker pdf.js ke `public/`.
//
// pdf.js menjalankan parser PDF di Web Worker, dan berkas worker itu harus
// dilayani sebagai aset statis dari origin sendiri. Bila dibiarkan di
// `node_modules` lalu dirujuk lewat `new URL(..., import.meta.url)`, Turbopack
// membundelnya ulang dan aset yang dihasilkan tidak bisa diunduh worker.
//
// Berkas ini dijalankan otomatis oleh `predev` dan `prebuild`, jadi versi
// worker selalu sama dengan versi `pdfjs-dist` yang terpasang.

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(projectRoot, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const target = resolve(projectRoot, "public/pdf.worker.min.mjs");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);

console.log("pdf.js: worker disalin ke public/pdf.worker.min.mjs");
