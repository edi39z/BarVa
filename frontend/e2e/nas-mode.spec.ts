import { test, expect } from "@playwright/test";

// Butuh backend NAS hidup dan akun uji terdaftar. Lihat e2e/offline-upload.spec.ts
// untuk variabel lingkungan yang sama.
const enabled = process.env.NAS_E2E_SERVER === "1";
const EMAIL = process.env.NAS_E2E_EMAIL || "";
const PASSWORD = process.env.NAS_E2E_PASSWORD || "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("button", { name: /Semua File/ })).toBeVisible({ timeout: 20_000 });
}

test.describe("mode NAS", () => {
  test.skip(!enabled, "Butuh backend: set NAS_E2E_SERVER=1 beserta kredensial uji.");

  test("tab Trash tampil setelah login dan menjelaskan konsekuensi hapus", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /^Trash/ }).click();
    await expect(page.getByText("Item di Trash belum benar-benar dihapus")).toBeVisible();
  });

  test("tab Family Sharing bisa dibuka", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /Family Sharing/ }).click();
    await expect(page.getByRole("button", { name: /Semua File/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Masuk ke server pribadi Anda");
  });
});
