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

// PNG 8x8 sederhana untuk memastikan endpoint thumbnail benar-benar dipakai.
const PNG_8X8 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
  "base64"
);

const API = process.env.NAS_E2E_API || "http://localhost:8080";

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

  test("galeri memuat thumbnail dari server", async ({ page, request }) => {
    await login(page);
    const token = await page.evaluate(() => localStorage.getItem("nas_auth_token"));
    expect(token).toBeTruthy();

    const upload = await request.post(`${API}/api/v1/files/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: `e2e-thumb-${Date.now()}.png`, mimeType: "image/png", buffer: PNG_8X8 },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const body = await upload.json();
    const nodeId = body.data.node.ID as string;

    try {
      await page.getByRole("button", { name: /Foto Favorit/ }).click();
      const thumb = page.locator('img[src*="/thumbnail"]').first();
      await expect(thumb).toBeVisible({ timeout: 20_000 });

      // naturalWidth > 0 menandakan JPEG benar-benar diterima dan didekode browser.
      await expect
        .poll(() => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    } finally {
      await request.delete(`${API}/api/v1/files/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
