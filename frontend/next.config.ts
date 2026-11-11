import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Indikator dev bawaan Next.js berupa tombol melayang di salah satu sudut.
  // Tata letak aplikasi ini memakai tinggi penuh, jadi sudut mana pun menimpa
  // isi nyata — di kiri bawah ia menutupi kartu "Penyimpanan lokal". Status
  // kompilasi tetap terlihat di terminal, jadi indikatornya dimatikan.
  devIndicators: false,
  // Service worker harus selalu diambil ulang agar pembaruan tidak tertahan
  // cache HTTP di browser.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
