import { test, expect, type APIRequestContext } from "@playwright/test";

// Halaman publik /s/:token adalah satu-satunya jalur yang dipakai orang di luar
// keluarga, tetapi sebelumnya tidak punya test sama sekali. Suite ini butuh
// backend NAS hidup dan akun uji, sama seperti nas-mode.spec.ts.
const enabled = process.env.NAS_E2E_SERVER === "1";
const EMAIL = process.env.NAS_E2E_EMAIL || "";
const PASSWORD = process.env.NAS_E2E_PASSWORD || "";
const API = process.env.NAS_E2E_API || "http://localhost:8080";
const SHARE_PASSWORD = "rahasia-e2e";

const PNG_8X8 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
  "base64"
);

async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/api/v1/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.token as string;
}

async function uploadPng(
  request: APIRequestContext,
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const res = await request.post(`${API}/api/v1/files/upload`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: { name, mimeType: "image/png", buffer: PNG_8X8 },
      ...(parentId ? { parent_id: parentId } : {}),
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.node.ID as string;
}

async function createShare(
  request: APIRequestContext,
  token: string,
  nodeId: string,
  withPassword: boolean
): Promise<{ id: string; rawToken: string }> {
  const res = await request.post(`${API}/api/v1/shares`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      node_id: nodeId,
      ...(withPassword ? { password: SHARE_PASSWORD } : {}),
    },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { id: body.data.id as string, rawToken: body.data.raw_token as string };
}

test.describe("halaman share publik", () => {
  test.skip(!enabled, "Butuh backend: set NAS_E2E_SERVER=1 beserta kredensial uji.");

  test("berkas berpassword: metadata tampil, sandi salah ditolak, sandi benar membuka unduhan", async ({
    page,
    request,
  }) => {
    const token = await apiToken(request);
    const fileName = `e2e-share-${Date.now()}.png`;
    const nodeId = await uploadPng(request, token, fileName);
    const share = await createShare(request, token, nodeId, true);

    try {
      await page.goto(`/s/${share.rawToken}`);

      await expect(page.getByText("Berkas Siap Diunduh")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(fileName)).toBeVisible();
      await expect(page.getByText("Berkas ini diproteksi kata sandi:")).toBeVisible();

      await page.locator('input[type="password"]').fill("sandi-salah");
      await page.getByRole("button", { name: "Buka Tautan" }).click();
      await expect(page.getByText("Kata sandi salah.")).toBeVisible();

      await page.locator('input[type="password"]').fill(SHARE_PASSWORD);
      await page.getByRole("button", { name: "Buka Tautan" }).click();
      await expect(page.getByRole("button", { name: /Unduh Berkas Sekarang/ })).toBeVisible();

      // Unduhan diuji lewat request, bukan klik tombol, agar browser tidak
      // membuka dialog simpan berkas saat test berjalan.
      const download = await request.get(
        `${API}/api/v1/public/share/${share.rawToken}/download?password=${encodeURIComponent(SHARE_PASSWORD)}`
      );
      expect(download.status()).toBe(200);
      expect(download.headers()["content-type"]).toContain("image/png");
      expect((await download.body()).length).toBeGreaterThan(0);
    } finally {
      await request.delete(`${API}/api/v1/shares/${share.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await request.delete(`${API}/api/v1/files/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test("folder tanpa password: tombol ZIP tampil dan arsip benar-benar zip", async ({
    page,
    request,
  }) => {
    const token = await apiToken(request);

    const folderRes = await request.post(`${API}/api/v1/files/folder`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `e2e-folder-${Date.now()}` },
    });
    expect(folderRes.ok()).toBeTruthy();
    const folderBody = await folderRes.json();
    const folderId = folderBody.data.ID as string;

    const nodeId = await uploadPng(request, token, "isi-folder.png", folderId);
    const share = await createShare(request, token, folderId, false);

    try {
      await page.goto(`/s/${share.rawToken}`);

      await expect(page.getByText("Folder Dibagikan")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: /Unduh Folder \(ZIP\)/ })).toBeVisible();

      const archive = await request.get(
        `${API}/api/v1/public/share/${share.rawToken}/archive`
      );
      expect(archive.status()).toBe(200);
      expect(archive.headers()["content-type"]).toContain("application/zip");

      // "PK" adalah dua byte pertama setiap arsip zip.
      const head = (await archive.body()).subarray(0, 2).toString("latin1");
      expect(head).toBe("PK");
    } finally {
      await request.delete(`${API}/api/v1/shares/${share.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Soft delete folder tidak ikut menghapus isinya, jadi anak dihapus dulu.
      await request.delete(`${API}/api/v1/files/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await request.delete(`${API}/api/v1/files/${folderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
