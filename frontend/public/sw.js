// Service worker Barva.
//
// Aturan penting:
// - Hanya request GET same-origin yang disentuh. Backend NAS berjalan di port
//   lain, jadi request ke sana (termasuk token sesi) tidak pernah di-cache.
// - HTML hanya di-cache untuk path "/" supaya halaman bertoken (/s/...,
//   /invite/...) tidak tersimpan di disk browser.
// - Naikkan CACHE_VERSION saat mengubah strategi cache; cache lama dihapus
//   otomatis pada tahap activate.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `nas-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `nas-static-${CACHE_VERSION}`;
const CACHE_PREFIX = "nas-";

const SHELL_URLS = ["/", "/offline", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Satu URL gagal tidak boleh menggagalkan seluruh instalasi.
      await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|png|jpe?g|svg|webp|gif|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).pathname === "/") {
      cache.put("/", response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      (await cache.match("/offline")) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await network) || Response.error();
}
