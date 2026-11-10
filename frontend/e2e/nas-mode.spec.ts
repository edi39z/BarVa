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
  await expect(page.getByRole("button", { name: /Semua Berkas/ })).toBeVisible({ timeout: 20_000 });
}

// PNG 8x8 valid (RGBA, filter 0) untuk memastikan endpoint thumbnail benar-benar
// dipakai. Konstanta lama ternyata rusak — zlib-nya gagal di-dekode Go — dan
// test sempat lolos hanya karena ada media lain di galeri.
const PNG_8X8 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAXklEQVR42hXKMQEEMQgAsCqpEpSghPFVoAQlGLpPh2w55/y+S5AUzbCccwWCpGiGvS+EQJAUzbDxQgoESdEMmy+UQJAUzbD1QgsESdEM2y+MQJAUzbDzwgoESdEMyx+KIpRBoj1OHQAAAABJRU5ErkJggg==",
  "base64"
);

const API = process.env.NAS_E2E_API || "http://localhost:8080";

test.describe("mode NAS", () => {
  test.skip(!enabled, "Butuh backend: set NAS_E2E_SERVER=1 beserta kredensial uji.");

  test("tab Trash tampil setelah login dan menjelaskan konsekuensi hapus", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /^Sampah/ }).click();
    await expect(page.getByText("Item di Trash belum benar-benar dihapus")).toBeVisible();
  });

  test("tab Family Sharing bisa dibuka", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: /Berbagi Keluarga/ }).click();
    await expect(page.getByRole("button", { name: /Semua Berkas/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Penyimpanan pribadi keluarga Anda");
  });

  test("galeri memuat thumbnail dari server, termasuk media di subfolder", async ({
    page,
    request,
  }) => {
    await login(page);
    const token = await page.evaluate(() => localStorage.getItem("nas_auth_token"));
    expect(token).toBeTruthy();

    // Media sengaja diunggah ke subfolder: galeri harus menjangkau seluruh
    // pohon berkas, bukan hanya isi folder yang sedang dibuka.
    const folderRes = await request.post(`${API}/api/v1/files/folder`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `e2e-galeri-${Date.now()}` },
    });
    expect(folderRes.ok()).toBeTruthy();
    const folderId = (await folderRes.json()).data.ID as string;

    const fileName = `e2e-thumb-${Date.now()}.png`;
    const upload = await request.post(`${API}/api/v1/files/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: fileName, mimeType: "image/png", buffer: PNG_8X8 },
        parent_id: folderId,
      },
    });
    expect(upload.ok()).toBeTruthy();
    const body = await upload.json();
    const nodeId = body.data.node.ID as string;

    try {
      await page.getByRole("button", { name: /Galeri Foto/ }).click();
      // Cari berkas yang barusan diunggah, bukan sekadar thumbnail pertama:
      // galeri bisa memuat media lain dari folder berbeda.
      const thumb = page.locator(`img[alt="${fileName}"]`);
      await expect(thumb).toBeVisible({ timeout: 20_000 });

      // naturalWidth > 0 menandakan JPEG benar-benar diterima dan didekode browser.
      await expect
        .poll(() => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    } finally {
      await request.delete(`${API}/api/v1/files/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await request.delete(`${API}/api/v1/files/${folderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
