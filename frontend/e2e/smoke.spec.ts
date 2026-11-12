import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Suite ini sengaja tidak butuh backend. Aplikasi dibuka dalam mode
// standalone (tombol "Lanjut tanpa server") sehingga semua pemeriksaan
// berjalan pada state kosong milik browser sendiri.

const SKIP_STANDALONE = /Lanjut tanpa server/;

test.describe("gerbang autentikasi", () => {
  test("menampilkan form login dan tautan mode standalone", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Barva" })).toBeVisible();
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

test.describe("mode mandiri tanpa backend", () => {
  test("tidak mengirim request ke server NAS", async ({ page }) => {
    const attempts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(":8080")) attempts.push(request.url());
    });

    await page.goto("/");
    await page.getByRole("button", { name: SKIP_STANDALONE }).click();
    await page.getByRole("button", { name: /Semua Berkas/ }).click();
    await page.waitForTimeout(1500);

    // Dulu ada lima request yang tetap jalan sebelum pengguna memilih mode
    // mandiri: health, dua kali status Drive, undangan, dan daftar anggota.
    expect(attempts).toEqual([]);
  });
});

test.describe("tekan lama memilih item", () => {
  // PNG 1x1 px, cukup untuk membuat satu item gambar.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  /**
   * Menahan penunjuk selama 700 ms, melewati ambang 450 ms di `useLongPress`.
   * `pointerType` bisa "touch" (jari) atau "mouse" (tahan klik kiri).
   */
  async function longPress(page: Page, target: Locator, pointerType: "touch" | "mouse" = "touch") {
    const point = { clientX: 120, clientY: 120, pointerId: 1, pointerType, isPrimary: true };
    await target.dispatchEvent("pointerdown", { ...point, button: 0, buttons: 1, bubbles: true });
    await page.waitForTimeout(700);
    await target.dispatchEvent("pointerup", { ...point, button: 0, buttons: 0, bubbles: true });
  }

  test("tekan lama menyalakan mode pilih, klik kanan tetap membuka menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: SKIP_STANDALONE }).click();
    await page.getByRole("button", { name: /Semua Berkas/ }).click();

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "tekan-lama.png",
      mimeType: "image/png",
      buffer: PNG,
    });

    const card = page.locator("article").filter({ hasText: "tekan-lama.png" }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await longPress(page, card);
    await expect(page.getByText("1 item dipilih")).toBeVisible();
    // Label aksi ikut menyesuaikan: satu item tidak memakai akhiran "semua".
    await expect(page.getByRole("button", { name: "Hapus latar" })).toBeVisible();

    // Menahan penunjuk pada item yang sudah terpilih tidak mengubah apa pun.
    await longPress(page, card);
    await expect(page.getByText("1 item dipilih")).toBeVisible();

    await page.getByRole("button", { name: "Batal memilih" }).click();
    await expect(page.getByText("1 item dipilih")).toHaveCount(0);

    // Mouse juga memicu seleksi, bukan hanya layar sentuh.
    await longPress(page, card, "mouse");
    await expect(page.getByText("1 item dipilih")).toBeVisible();

    // Menahan mouse di atas tombol ⋮ tidak boleh menyalakan seleksi.
    await page.getByRole("button", { name: "Batal memilih" }).click();
    await longPress(page, card.getByRole("button", { name: /Lihat|Buka/ }).first(), "mouse");
    await expect(page.getByText("1 item dipilih")).toHaveCount(0);

    await card.click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Hapus latar" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Galeri memakai perilaku yang sama.
    await page.getByRole("button", { name: /Galeri Foto/ }).click();
    const photo = page.locator('[role="button"]').filter({ hasText: "tekan-lama.png" }).first();
    await expect(photo).toBeVisible({ timeout: 15_000 });

    await longPress(page, photo, "mouse");
    await expect(page.getByText("1 item dipilih")).toBeVisible();
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

  test("editor PDF menghapus, menyisipkan, dan menyusun ulang halaman", async ({ page }) => {
    await page.getByRole("button", { name: /Studio Foto & PDF/ }).click();
    await page.getByRole("button", { name: /Editor PDF/ }).click();

    const fileInputs = page.locator('input[type="file"][accept="application/pdf,.pdf"]');

    await fileInputs.first().setInputFiles({
      name: "susunan.pdf",
      mimeType: "application/pdf",
      buffer: await makePdf([
        [595, 842],
        [400, 400],
        [300, 500],
      ]),
    });
    await expect(page.getByRole("img", { name: "Pratinjau halaman 3" })).toBeVisible();

    // Hapus halaman kedua; urungkan mengembalikannya.
    await page.getByRole("button", { name: "Hapus halaman 2" }).click();
    await expect(page.getByRole("img", { name: /Pratinjau halaman/ })).toHaveCount(2);

    await page.getByRole("button", { name: /Urungkan/ }).click();
    await expect(page.getByRole("img", { name: /Pratinjau halaman/ })).toHaveCount(3);

    // Hapus lagi, lalu sisipkan PDF lain setelah halaman pertama.
    await page.getByRole("button", { name: "Hapus halaman 2" }).click();
    await expect(page.getByRole("img", { name: /Pratinjau halaman/ })).toHaveCount(2);

    await page.getByLabel("Posisi sisip").selectOption("1");
    await fileInputs.nth(1).setInputFiles({
      name: "sisipan.pdf",
      mimeType: "application/pdf",
      buffer: await makePdf([
        [350, 350],
        [360, 360],
      ]),
    });
    await expect(page.getByRole("img", { name: /Pratinjau halaman/ })).toHaveCount(4);

    // Putar halaman 2, lalu tukar posisinya dengan halaman 3.
    await page.getByRole("button", { name: "Putar halaman 2" }).click();
    await page.getByRole("button", { name: "Geser halaman 3 ke kiri" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Simpan PDF/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("susunan_diedit.pdf");

    // Ukuran halaman dipakai sebagai penanda urutan: [595, 360, 350, 300].
    const saved = await PDFDocument.load(fs.readFileSync((await download.path())!));
    expect(saved.getPageCount()).toBe(4);
    expect(saved.getPages().map((item) => Math.round(item.getSize().width))).toEqual([595, 360, 350, 300]);
    expect(saved.getPages()[2].getRotation().angle).toBe(90);
  });

  test("Sampah tersedia di mode standalone", async ({ page }) => {
    await page.getByRole("button", { name: /^Sampah/ }).click();
    await expect(page.getByText("Sampah kosong")).toBeVisible();
  });

  test("kembali ke Beranda berhasil", async ({ page }) => {
    await page.getByRole("button", { name: /Galeri Foto/ }).click();
    await expect(page.getByRole("heading", { name: "Galeri Foto & Video" })).toBeVisible();

    await page.getByRole("button", { name: /Beranda/ }).click();
    await expect(page.getByRole("heading", { name: "Galeri Foto & Video" })).toHaveCount(0);
  });
});

test.describe("pencarian isi dokumen", () => {
  // Isi berkas sengaja memuat kata yang tidak ada di namanya, supaya tes
  // membuktikan pencarian menelusuri teks dan bukan nama berkas.
  const NOTES = [
    "Catatan belanja keluarga",
    "",
    "Beli makanan kucing oranye di pasar minggu pagi.",
    "Jangan lupa vitamin dan pasir wangi.",
  ].join("\n");

  test("mode standalone menemukan kata di dalam berkas teks", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: SKIP_STANDALONE }).click();
    await page.getByRole("button", { name: /Semua Berkas/ }).click();

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "catatan-belanja.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(NOTES),
    });

    const card = page.locator("article").filter({ hasText: "catatan-belanja.txt" }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Isi", exact: true }).click();

    const search = page.getByLabel("Cari berkas, foto, atau dokumen");
    await search.fill("ku");
    await expect(
      page.getByText("Ketik minimal 3 karakter untuk mencari di isi dokumen.")
    ).toBeVisible();

    await search.fill("kucing oranye");
    await expect(page.getByText("Hasil pencarian isi")).toBeVisible();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText("Beli makanan kucing oranye di pasar minggu pagi.");
    await expect(card.getByText("Semua File")).toBeVisible();

    // Kata yang tidak ada di isi dokumen tidak menghasilkan apa pun.
    await search.fill("dinosaurus");
    await expect(page.getByText("Tidak ada dokumen yang cocok")).toBeVisible();
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

/**
 * PDF dengan ukuran halaman berbeda-beda, dipakai sebagai penanda urutan saat
 * memeriksa hasil editor tanpa perlu mengekstrak teks.
 */
async function makePdf(sizes: [number, number][]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  sizes.forEach(([width, height], index) => {
    const page = doc.addPage([width, height]);
    page.drawText(`HALAMAN ${index + 1}`, { x: 40, y: height - 60, size: 18, font });
  });

  return Buffer.from(await doc.save());
}
