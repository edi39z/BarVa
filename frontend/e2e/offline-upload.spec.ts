import { test, expect } from "@playwright/test";

// Butuh backend NAS hidup dan akun uji yang sudah terdaftar. Set:
//   NAS_E2E_SERVER=1
//   NAS_E2E_EMAIL=... NAS_E2E_PASSWORD=...
// tanpa itu seluruh suite di-skip supaya `npm run test:e2e` tetap hijau
// di mesin yang hanya menjalankan frontend.
const enabled = process.env.NAS_E2E_SERVER === "1";
const EMAIL = process.env.NAS_E2E_EMAIL || "";
const PASSWORD = process.env.NAS_E2E_PASSWORD || "";

const queueSize = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open("nas_local_storage");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("upload_queue")) return resolve(-1);
          const tx = db.transaction("upload_queue", "readonly");
          const count = tx.objectStore("upload_queue").count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(-2);
        };
        req.onerror = () => resolve(-3);
      })
  );

test.describe("antrean upload offline", () => {
  test.skip(!enabled, "Butuh backend: set NAS_E2E_SERVER=1 beserta kredensial uji.");

  test("berkas masuk antrean saat offline lalu terkirim otomatis", async ({ page, context }) => {
    await page.goto("/");
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page.getByRole("button", { name: /Semua File/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Semua File/ }).click();
    await expect(page.getByText("Lokal Device (IndexedDB)")).toBeVisible();

    const name = `e2e-offline-${Date.now()}.txt`;
    await context.setOffline(true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    const dialog = page.waitForEvent("dialog");
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(`uji antrean ${name}`),
    });
    const alert = await dialog;
    expect(alert.message()).toContain("disimpan di antrean");
    await alert.accept();

    await expect(page.getByText(/berkas menunggu koneksi ke server/)).toBeVisible();
    expect(await queueSize(page)).toBe(1);

    await context.setOffline(false);
    await expect(page.getByText(/berkas menunggu koneksi ke server/)).toHaveCount(0, {
      timeout: 20_000,
    });
    expect(await queueSize(page)).toBe(0);
    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });
  });
});
