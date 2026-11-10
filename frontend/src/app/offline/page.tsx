import Link from "next/link";
import { WifiOff, HardDrive, RefreshCw } from "lucide-react";

export const metadata = {
  title: "Offline — NAS Project",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6 text-fg">
      <div className="card w-full max-w-md space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-soft text-warn">
            <WifiOff className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-[14px] font-bold text-fg">Tidak ada internet</h1>
            <p className="text-[11.5px] text-subtle">Halaman ini diambil dari simpanan sementara.</p>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted">
          Berkas di server NAS belum bisa dibuka sampai koneksi kembali. Berkas yang tersimpan di
          perangkat ini tetap bisa diakses dari halaman utama.
        </p>

        <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-2 text-[11.5px] text-muted">
            <HardDrive className="h-3.5 w-3.5 text-brand" aria-hidden />
            Mode mandiri tetap berjalan tanpa jaringan.
          </p>
          <p className="flex items-center gap-2 text-[11.5px] text-muted">
            <RefreshCw className="h-3.5 w-3.5 text-success" aria-hidden />
            Muat ulang halaman setelah koneksi kembali.
          </p>
        </div>

        <Link href="/" className="btn btn-primary w-full">
          Coba buka halaman utama
        </Link>
      </div>
    </main>
  );
}
