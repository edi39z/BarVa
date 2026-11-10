"use client";

import { useEffect } from "react";

// Mendaftarkan service worker. Hanya di build produksi: di mode dev, cache
// service worker akan menyajikan bundel lama dan membuat perubahan kode tidak
// terlihat.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => {
          console.warn("[PWA] Gagal mendaftarkan service worker:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
