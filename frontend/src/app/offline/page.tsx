import Link from "next/link";
import { WifiOff, HardDrive, RefreshCw } from "lucide-react";

export const metadata = {
  title: "Offline — NAS Cloud",
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center">
            <WifiOff className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Kamu sedang offline</h1>
            <p className="text-[11px] text-zinc-500">Halaman ini diambil dari cache aplikasi.</p>
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Berkas yang tersimpan di server NAS tidak dapat dibuka sampai koneksi kembali. Berkas di
          mode standalone (IndexedDB) tetap bisa diakses dari halaman utama.
        </p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-zinc-300">
            <HardDrive className="h-3.5 w-3.5 text-blue-400" />
            <span>Mode standalone tetap berjalan tanpa jaringan.</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-300">
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
            <span>Muat ulang halaman setelah koneksi kembali.</span>
          </div>
        </div>

        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
        >
          Coba buka halaman utama
        </Link>
      </div>
    </main>
  );
}
