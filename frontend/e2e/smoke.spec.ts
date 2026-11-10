import { test, expect } from "@playwright/test";

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
