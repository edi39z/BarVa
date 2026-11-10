import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Suite ini sengaja tidak butuh backend. Aplikasi dibuka dalam mode
// standalone (tombol "Lanjut tanpa server") sehingga semua pemeriksaan
// berjalan pada state kosong milik browser sendiri.

const SKIP_STANDALONE = /Lanjut tanpa server/;

test.describe("gerbang autentikasi", () => {
  test("menampilkan form login dan tautan mode standalone", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "NAS Project" })).toBeVisible();
    await expect(page.getByText("Penyimpanan pribadi keluarga Anda")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: SKIP_STANDALONE })).toBeVisible();
  });

  test("tombol Buat akun menampilkan field username dan konfirmasi", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Buat akun" }).click();

    await expect(page.getByPlaceholder("Minimal 3 karakter")).toBeVisible();
    await expect(page.getByPlaceholder("Ulangi kata sandi")).toBeVisible();
    await expect(page.getByText("Akun pertama yang mendaftar otomatis menjadi pemilik")).toBeVisible();
  });

  test("mode standalone membuka dashboard tanpa sesi", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: SKIP_STANDALONE }).click();

    await expect(page.getByRole("button", { name: /Beranda/ })).toBeVisible();
    await expect(page.getByText("Selamat datang kembali!")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mulai jelajahi" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });
});

test.describe("navigasi tab mode standalone", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: SKIP_STANDALONE }).click();
    await expect(page.getByRole("button", { name: /Beranda/ })).toBeVisible();
  });

  test("Semua Berkas menampilkan explorer berkas", async ({ page }) => {
    await page.getByRole("button", { name: /Semua Berkas/ }).click();
    await expect(page.getByRole("button", { name: /Perangkat ini/ })).toBeVisible();
  });

  test("Galeri Foto menampilkan galeri media", async ({ page }) => {
    await page.getByRole("button", { name: /Galeri Foto/ }).click();
    await expect(page.getByRole("heading", { name: "Galeri Foto & Video" })).toBeVisible();
  });

  test("Studio menampilkan alat client-side", async ({ page }) => {
    await page.getByRole("button", { name: /Studio Foto & PDF/ }).click();
    await expect(page.getByRole("heading", { name: "Studio Foto & Dokumen" })).toBeVisible();
  });

  test("alat AI minta izin sebelum mengunduh model", async ({ page }) => {
    await page.getByRole("button", { name: /Studio Foto & PDF/ }).click();

    await page.getByRole("button", { name: /Hapus Latar/ }).click();
    await expect(page.getByText("Perlu unduh model AI sekali saja")).toBeVisible();
    await expect(page.getByRole("button", { name: /Unduh model/ })).toBeVisible();

    // Sebelum memberi izin, tombol pemilih foto masih terkunci.
    await expect(page.getByRole("button", { name: "Pilih dari perangkat" })).toBeDisabled();

    await page.getByRole("button", { name: /Unduh model/ }).click();
    await expect(page.getByRole("button", { name: "Pilih dari perangkat" })).toBeEnabled();

    await page.getByRole("button", { name: /Naikkan Kualitas/ }).click();
    await expect(page.getByText("Pilih foto yang ingin diperjelas")).toBeVisible();
  });

  test("pasfoto menyediakan ukuran resmi dan warna latar kustom", async ({ page }) => {
    await page.getByRole("button", { name: /Studio Foto & PDF/ }).click();
    await page.getByRole("button", { name: /Pasfoto/ }).click();

    await expect(page.getByText("Pilih foto untuk dijadikan pasfoto")).toBeVisible();

    // Ukuran resmi yang paling sering diminta instansi.
    for (const label of ["2 × 3 cm", "3 × 4 cm", "4 × 6 cm"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/354 × 472 px/)).toBeVisible();

    // Ukuran kustom memakai satuan fisik (dengan DPI) atau piksel langsung.
    await page.getByRole("button", { name: "Kustom", exact: true }).click();
    await expect(page.getByLabel("Satuan")).toBeVisible();
    await expect(page.getByLabel("DPI")).toBeVisible();

    // Warna latar: pilihan cepat mengisi kode hex, dan hex bisa diketik sendiri.
    const hex = page.getByLabel("Kode warna latar");
    await page.getByRole("button", { name: "Warna Biru" }).click();
    await expect(hex).toHaveValue("#2563eb");

    await hex.fill("#12345");
    await expect(hex).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Kode warna harus format #RRGGBB.")).toBeVisible();

    await hex.fill("#123abc");
    await expect(hex).toHaveAttribute("aria-invalid", "false");
    await expect(page.getByText("Kode warna harus format #RRGGBB.")).toHaveCount(0);
  });

  test("PDF ke Word menghasilkan berkas .docx", async ({ page }) => {
    await page.getByRole("button", { name: /Studio Foto & PDF/ }).click();
    await page.getByRole("button", { name: /PDF ke Word/ }).click();

    await page.locator('input[type="file"][accept="application/pdf,.pdf"]').setInputFiles({
      name: "surat.pdf",
      mimeType: "application/pdf",
      buffer: await makeSamplePdf(),
    });

    await expect(page.getByText(/2 halaman/).first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Ubah ke Word/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("surat.docx");
    await expect(page.getByRole("status")).toContainText("2 halaman diubah ke Word");
  });

  test("Sampah disembunyikan di mode standalone", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^Sampah/ })).toHaveCount(0);
  });
  test("kembali ke Beranda berhasil", async ({ page }) => {
    await page.getByRole("button", { name: /Galeri Foto/ }).click();
    await expect(page.getByRole("heading", { name: "Galeri Foto & Video" })).toBeVisible();

    await page.getByRole("button", { name: /Beranda/ }).click();
    await expect(page.getByRole("heading", { name: "Galeri Foto & Video" })).toHaveCount(0);
  });
});

test.describe("tema terang & gelap", () => {
  test("tombol tema mengganti mode dan pilihan tersimpan setelah muat ulang", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: SKIP_STANDALONE }).click();

    const header = page.locator("header");
    await header.getByRole("button", { name: "Aktifkan mode gelap" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Setelah muat ulang aplikasi kembali ke gerbang login, yang juga punya
    // tombol tema sendiri.
    await page.getByRole("button", { name: "Aktifkan mode terang" }).first().click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("halaman pendukung", () => {
  test("halaman /offline bisa dibuka langsung", async ({ page }) => {
    const res = await page.goto("/offline");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(/internet/i);
  });

  test("manifest PWA tersedia dan valid", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
  });
});

/**
 * PDF dua halaman dibuat saat tes berjalan supaya tidak ada berkas biner di
 * repo: halaman pertama berisi teks, halaman kedua kosong (meniru hasil pindai).
 */
async function makeSamplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([595, 842]);
  page.drawText("SURAT KETERANGAN", { x: 60, y: 760, size: 18, font });
  page.drawText("Nomor: 123/ABC/2026", { x: 60, y: 730, size: 11, font });

  doc.addPage([595, 842]);

  return Buffer.from(await doc.save());
}
