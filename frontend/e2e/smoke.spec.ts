import { test, expect } from "@playwright/test";

// Suite ini sengaja tidak butuh backend. Aplikasi dibuka dalam mode
// standalone (tombol "Lanjut tanpa server") sehingga semua pemeriksaan
// berjalan pada state kosong milik browser sendiri.

test.describe("gerbang autentikasi", () => {
  test("menampilkan form login dan tautan mode standalone", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "NAS Cloud" })).toBeVisible();
    await expect(page.getByText("Masuk ke server pribadi Anda")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lanjut tanpa server (Mode Standalone)" })
    ).toBeVisible();
  });

  test("tombol Daftar menampilkan field username dan konfirmasi", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Daftar", exact: true }).click();

    await expect(page.getByPlaceholder("username")).toBeVisible();
    await expect(page.getByPlaceholder("ulangi password")).toBeVisible();
    await expect(page.getByText("Akun pertama yang mendaftar otomatis menjadi")).toBeVisible();
  });

  test("mode standalone membuka dashboard tanpa sesi", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Lanjut tanpa server (Mode Standalone)" }).click();

    await expect(page.getByRole("button", { name: /Home Dashboard/ })).toBeVisible();
    await expect(page.getByText("Selamat Datang di NAS Project!")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jelajahi Berkas" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });
});

test.describe("navigasi tab mode standalone", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Lanjut tanpa server (Mode Standalone)" }).click();
    await expect(page.getByRole("button", { name: /Home Dashboard/ })).toBeVisible();
  });

  test("Semua File menampilkan explorer berkas", async ({ page }) => {
    await page.getByRole("button", { name: /Semua File/ }).click();
    await expect(page.getByText("Lokal Device (IndexedDB)")).toBeVisible();
  });

  test("Foto Favorit menampilkan galeri media", async ({ page }) => {
    await page.getByRole("button", { name: /Foto Favorit/ }).click();
    await expect(page.getByText("Galeri Media Keluarga")).toBeVisible();
  });

  test("Studio Tools menampilkan alat client-side", async ({ page }) => {
    await page.getByRole("button", { name: "Studio Tools WASM" }).click();
    await expect(page.getByText("Media & Document Studio (Client-Side WASM)")).toBeVisible();
  });

  test("Trash disembunyikan di mode standalone", async ({ page }) => {
    await expect(page.getByRole("button", { name: /^Trash/ })).toHaveCount(0);
  });

  test("kembali ke Home Dashboard berhasil", async ({ page }) => {
    await page.getByRole("button", { name: /Foto Favorit/ }).click();
    await expect(page.getByText("Galeri Media Keluarga")).toBeVisible();

    await page.getByRole("button", { name: /Home Dashboard/ }).click();
    await expect(page.getByText("Galeri Media Keluarga")).toHaveCount(0);
  });
});

test.describe("halaman pendukung", () => {
  test("halaman /offline bisa dibuka langsung", async ({ page }) => {
    const res = await page.goto("/offline");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(/offline/i);
  });

  test("manifest PWA tersedia dan valid", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
  });
});
