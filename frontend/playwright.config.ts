import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Chromium bawaan repo ini kadang sudah tersedia lokal (hasil `playwright
// install` sebelumnya). Pakai bila ada supaya `npm run test:e2e` tidak perlu
// mengunduh ulang; kalau tidak ada, biarkan Playwright memakai browser default.
const localChromium =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "C:/Users/Acer/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";

const launchOptions = fs.existsSync(localChromium)
  ? { executablePath: localChromium }
  : {};

const baseURL = process.env.NAS_E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  // Playwright yang menyalakan dan mematikan server, jadi tidak perlu langkah
  // terpisah di CI. `npm run start` butuh hasil `npm run build` lebih dulu.
  // Di lokal, server yang sudah berjalan (mis. `npm run dev`) dipakai ulang.
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
