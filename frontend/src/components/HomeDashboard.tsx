"use client";

import React from "react";
import {
  ArrowRight,
  Cloud,
  Download,
  FileArchive,
  FileText,
  Film,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Palette,
  Play,
  Plus,
  Scissors,
  Share2,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wand2,
  Wifi,
} from "lucide-react";
import { mergeDisplayItems, type DisplayItem } from "@/lib/displayItem";
import { computeStorageStats } from "@/lib/storageStats";
import { formatBytes } from "@/lib/nasDisplay";
import { getThumbnailUrl } from "@/lib/api/nas";
import ThumbnailImage from "@/components/ThumbnailImage";

export type AppTab = "home" | "files" | "trash" | "gallery" | "studio" | "gdrive" | "shares";
export type StudioTool = "img2pdf" | "mergepdf" | "idphoto" | "compress";

interface HomeDashboardProps {
  activeItems: DisplayItem[];
  localItems: DisplayItem[];
  isGdriveConnected: boolean;
  nasLatency: number | null;
  connectionMode: "standalone" | "nas";
  nasStatus: "online" | "offline" | "checking";
  serverUrl: string;
  onCreateFolder: () => void | Promise<void>;
  onNavigate: (tab: AppTab) => void;
  onOpenStudioTool: (tool: StudioTool) => void;
  onUpload: () => void;
  onDownload: (item: DisplayItem) => void;
  onOpenMedia: (item: DisplayItem) => void;
  onOpenServer: () => void;
}

export default function HomeDashboard({
  activeItems,
  localItems,
  isGdriveConnected,
  nasLatency,
  connectionMode,
  nasStatus,
  serverUrl,
  onCreateFolder,
  onNavigate,
  onOpenStudioTool,
  onUpload,
  onDownload,
  onOpenMedia,
  onOpenServer,
}: HomeDashboardProps) {
  // Berkas lokal dan berkas server digabung tanpa duplikat, supaya bagian
  // "Kenangan" tetap terisi di kedua mode penyimpanan.
  const merged = React.useMemo(
    () => mergeDisplayItems(activeItems, localItems),
    [activeItems, localItems]
  );

  const stats = React.useMemo(() => computeStorageStats(merged), [merged]);

  const media = merged.filter((i) => i.type === "image" || i.type === "video");
  const files = merged.filter((i) => i.type !== "folder");
  const images = merged.filter((i) => i.type === "image");
  const documents = merged.filter((i) => i.type === "document");
  const videos = merged.filter((i) => i.type === "video");

  const totalBytes = stats.totalBytes;
  const mediaBytes = stats.imageBytes + stats.videoBytes;
  const docBytes = stats.documentBytes;

  const pct = (part: number) => (totalBytes > 0 ? Math.round((part / totalBytes) * 100) : 0);
  const photoPct = pct(stats.imageBytes);
  const videoPct = pct(stats.videoBytes);
  const donut = `conic-gradient(#8b5cf6 0 ${photoPct}%, #10b981 ${photoPct}% ${
    photoPct + videoPct
  }%, #3b82f6 ${photoPct + videoPct}% 100%)`;

  const shortcuts: {
    tab: AppTab;
    tool?: StudioTool;
    title: string;
    desc: string;
    icon: React.ElementType;
    bg: string;
    fg: string;
  }[] = [
    {
      tab: "gallery",
      title: "Galeri",
      desc: "Lihat foto & video",
      icon: ImageIcon,
      bg: "var(--tile-purple)",
      fg: "var(--tile-purple-fg)",
    },
    {
      tab: "files",
      title: "Berkas",
      desc: "Kelola semua file",
      icon: Folder,
      bg: "var(--tile-blue)",
      fg: "var(--tile-blue-fg)",
    },
    {
      tab: "studio",
      tool: "idphoto",
      title: "Studio Foto",
      desc: "Pasfoto & kompres",
      icon: Palette,
      bg: "var(--tile-green)",
      fg: "var(--tile-green-fg)",
    },
    {
      tab: "studio",
      tool: "img2pdf",
      title: "Studio Dokumen",
      desc: "Foto jadi PDF",
      icon: FileText,
      bg: "var(--tile-rose)",
      fg: "var(--tile-rose-fg)",
    },
    {
      tab: "shares",
      title: "Berbagi",
      desc: "Undang keluarga",
      icon: Share2,
      bg: "var(--tile-teal)",
      fg: "var(--tile-teal-fg)",
    },
    {
      tab: "gdrive",
      title: "Google Drive",
      desc: isGdriveConnected ? "Sudah terhubung" : "Hubungkan akun",
      icon: Cloud,
      bg: "var(--tile-amber)",
      fg: "var(--tile-amber-fg)",
    },
  ];

  const quickActions: {
    label: string;
    desc: string;
    icon: React.ElementType;
    fg: string;
    run: () => void;
  }[] = [
    {
      label: "Pasfoto",
      desc: "Ukuran 3×4 / 4×6",
      icon: Scissors,
      fg: "var(--tile-rose-fg)",
      run: () => {
        onNavigate("studio");
        onOpenStudioTool("idphoto");
      },
    },
    {
      label: "Kompres foto",
      desc: "Hemat ruang",
      icon: Sparkles,
      fg: "var(--tile-green-fg)",
      run: () => {
        onNavigate("studio");
        onOpenStudioTool("compress");
      },
    },
    {
      label: "Foto ke PDF",
      desc: "Gabung jadi 1 file",
      icon: Layers,
      fg: "var(--tile-blue-fg)",
      run: () => {
        onNavigate("studio");
        onOpenStudioTool("img2pdf");
      },
    },
    {
      label: "Gabung PDF",
      desc: "Satukan dokumen",
      icon: FileText,
      fg: "var(--tile-purple-fg)",
      run: () => {
        onNavigate("studio");
        onOpenStudioTool("mergepdf");
      },
    },
    {
      label: "Unggah berkas",
      desc: "Dari HP / laptop",
      icon: Upload,
      fg: "var(--tile-amber-fg)",
      run: onUpload,
    },
    {
      label: "Folder baru",
      desc: "Rapikan berkas",
      icon: Plus,
      fg: "var(--tile-teal-fg)",
      run: async () => {
        await onCreateFolder();
        onNavigate("files");
      },
    },
  ];

  // Tanggal hanya dihitung di browser. Nilai server sengaja kosong agar
  // prerender tidak memakai waktu build.
  const today = React.useSyncExternalStore(
    () => () => {},
    () =>
      new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    () => ""
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-24 lg:pb-6">
      {/* 1. Sapaan utama */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden rounded-2xl border border-brand-border/60 shadow-card"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#132a5e] via-[#1d4ed8] to-[#0e8fb8]" />
        {/* Ilustrasi lembut agar terasa seperti foto pemandangan pada referensi */}
        <svg
          className="absolute inset-x-0 bottom-0 h-32 w-full opacity-40"
          viewBox="0 0 800 200"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 200 L120 96 L210 150 L320 60 L430 150 L520 104 L640 168 L800 78 L800 200 Z" fill="#0b1f45" opacity="0.55" />
          <path d="M0 200 L150 130 L260 176 L390 112 L520 176 L650 132 L800 170 L800 200 Z" fill="#081733" opacity="0.7" />
        </svg>
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl space-y-2 text-white">
            <p className="text-[12px] font-medium uppercase tracking-wider text-white/70">{today}</p>
            <h1 id="hero-title" className="text-[22px] font-bold leading-tight sm:text-[26px]">
              Selamat datang kembali!
            </h1>
            <p className="max-w-md text-[13.5px] leading-relaxed text-white/85">
              Semua foto, berkas, dan dokumen keluarga tersimpan rapi di satu tempat.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <button
                onClick={() => onNavigate("files")}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#12315f] shadow-sm transition-transform hover:scale-[1.02]"
              >
                <span>Mulai jelajahi</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                onClick={() => onNavigate("studio")}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                Buka Studio
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Pintasan kategori */}
      <section aria-label="Pintasan fitur" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              onClick={() => {
                onNavigate(item.tab);
                if (item.tool) onOpenStudioTool(item.tool);
              }}
              className="card card-hover flex flex-col items-start gap-2.5 p-3.5 text-left"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: item.bg, color: item.fg }}
                aria-hidden
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-fg">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-subtle">{item.desc}</span>
              </span>
            </button>
          );
        })}
      </section>

      {/* 3. Kenangan + aksi cepat */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="card p-4 lg:col-span-7" aria-labelledby="memories-title">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="memories-title" className="text-[14px] font-bold text-fg">
                Kenangan Anda
              </h2>
              <p className="text-[12px] text-subtle">Foto dan video terbaru</p>
            </div>
            <button
              onClick={() => onNavigate("gallery")}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-brand transition-colors hover:bg-brand-soft"
            >
              Lihat semua
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {media.length === 0 ? (
            <button
              onClick={onUpload}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-10 text-center transition-colors hover:border-brand-border hover:bg-brand-soft/40"
            >
              <ImageIcon className="h-8 w-8 text-subtle" aria-hidden />
              <span className="text-[13px] font-semibold text-fg">Belum ada foto</span>
              <span className="text-[12px] text-subtle">
                Ketuk untuk mengunggah foto pertama Anda
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {media.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  onClick={() => onOpenMedia(item)}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2"
                  aria-label={`Buka ${item.name}`}
                >
                  <ThumbnailImage
                    blob={item.blob}
                    src={item.type === "image" ? getThumbnailUrl(item.id, "small") : null}
                    alt={item.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    fallback={
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                        {item.type === "video" ? (
                          <Play className="h-6 w-6 text-brand" aria-hidden />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-subtle" aria-hidden />
                        )}
                        <span className="line-clamp-2 text-[11px] text-subtle">{item.name}</span>
                      </span>
                    }
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-left text-[10.5px] font-medium text-white">
                    <span className="line-clamp-1">{item.name}</span>
                  </span>
                </button>
              ))}
              {media.length > 4 && (
                <button
                  onClick={() => onNavigate("gallery")}
                  className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface-2 text-muted transition-colors hover:border-brand-border hover:text-brand"
                >
                  <span className="text-[15px] font-bold">+{media.length - 4}</span>
                  <span className="text-[11px]">lainnya</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="card p-4 lg:col-span-5" aria-labelledby="quick-title">
          <div className="mb-3">
            <h2 id="quick-title" className="text-[14px] font-bold text-fg">
              Aksi Cepat
            </h2>
            <p className="text-[12px] text-subtle">Alat yang paling sering dipakai</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.run}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface-2 p-2.5 text-left transition-colors hover:border-brand-border hover:bg-brand-soft/40"
                >
                  <Icon className="h-[18px] w-[18px]" style={{ color: action.fg }} aria-hidden />
                  <span className="text-[12.5px] font-semibold text-fg">{action.label}</span>
                  <span className="text-[11px] leading-snug text-subtle">{action.desc}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 4. Berkas terbaru, penyimpanan, kondisi sistem */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="card flex flex-col p-4" aria-labelledby="recent-title">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-title" className="text-[14px] font-bold text-fg">
              Berkas Terbaru
            </h2>
            <button
              onClick={() => onNavigate("files")}
              className="rounded-lg px-2 py-1 text-[12px] font-semibold text-brand hover:bg-brand-soft"
            >
              Lihat semua
            </button>
          </div>

          {files.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 py-8 text-center">
              <FileText className="h-7 w-7 text-subtle" aria-hidden />
              <p className="text-[12.5px] text-muted">Belum ada berkas</p>
              <button onClick={onUpload} className="text-[12px] font-semibold text-brand hover:underline">
                Unggah sekarang
              </button>
            </div>
          ) : (
            <ul className="flex-1 space-y-1.5">
              {files.slice(0, 4).map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    {file.type === "image" ? (
                      <ImageIcon className="h-4 w-4 text-[var(--tile-purple-fg)]" aria-hidden />
                    ) : file.type === "video" ? (
                      <Film className="h-4 w-4 text-[var(--tile-green-fg)]" aria-hidden />
                    ) : file.type === "archive" ? (
                      <FileArchive className="h-4 w-4 text-[var(--tile-amber-fg)]" aria-hidden />
                    ) : (
                      <FileText className="h-4 w-4 text-[var(--tile-blue-fg)]" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg">{file.name}</span>
                    <span className="block truncate text-[11px] text-subtle">
                      {file.sizeStr} · {file.updatedAt}
                    </span>
                  </span>
                  <button
                    onClick={() => onDownload(file)}
                    className="icon-btn h-8 w-8"
                    aria-label={`Unduh ${file.name}`}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 flex items-center justify-between border-t border-line pt-2.5 text-[11px] text-subtle">
            <span>{files.length} berkas</span>
            <span className="inline-flex items-center gap-1 text-success">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Terverifikasi
            </span>
          </p>
        </section>

        <section className="card p-4" aria-labelledby="storage-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="storage-title" className="text-[14px] font-bold text-fg">
              Penyimpanan
            </h2>
            <span className="text-[11px] text-subtle">
              {connectionMode === "nas" ? "Server rumah" : "Perangkat ini"}
            </span>
          </div>

          <div className="flex items-center gap-4 py-1">
            <div
              className="relative h-[104px] w-[104px] shrink-0 rounded-full"
              style={{ background: totalBytes > 0 ? donut : "var(--surface-3)" }}
              role="img"
              aria-label={`Penyimpanan terpakai ${formatBytes(totalBytes)}`}
            >
              <div className="absolute inset-[11px] flex flex-col items-center justify-center rounded-full bg-surface">
                <span className="text-[13px] font-bold tabular-nums text-fg">
                  {formatBytes(totalBytes)}
                </span>
                <span className="text-[10.5px] text-subtle">terpakai</span>
              </div>
            </div>

            <ul className="min-w-0 flex-1 space-y-1.5 text-[11.5px]">
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" aria-hidden /> Foto
                </span>
                <span className="font-semibold tabular-nums text-fg">{images.length}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full bg-[#10b981]" aria-hidden /> Video
                </span>
                <span className="font-semibold tabular-nums text-fg">{videos.length}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full bg-[#3b82f6]" aria-hidden /> Dokumen
                </span>
                <span className="font-semibold tabular-nums text-fg">{documents.length}</span>
              </li>
              <li className="flex items-center justify-between gap-2 border-t border-line pt-1.5">
                <span className="text-subtle">Total media</span>
                <span className="font-semibold tabular-nums text-fg">
                  {formatBytes(mediaBytes + docBytes)}
                </span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => onNavigate("files")}
            className="mt-2 w-full rounded-xl border border-line py-2 text-[12px] font-semibold text-brand transition-colors hover:bg-brand-soft"
          >
            Kelola penyimpanan
          </button>
        </section>

        <section className="card p-4 md:col-span-2 xl:col-span-1" aria-labelledby="status-title">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="status-title" className="text-[14px] font-bold text-fg">
              Kondisi Sistem
            </h2>
            <span className="chip chip-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Aktif
            </span>
          </div>

          <ul className="space-y-2 text-[12px]">
            <li className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                <Wifi className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-fg">
                  {connectionMode === "nas"
                    ? nasStatus === "online"
                      ? `Server tersambung${nasLatency ? ` · ${nasLatency} ms` : ""}`
                      : "Server tidak terjangkau"
                    : "Mode mandiri"}
                </span>
                <span className="block truncate text-[11px] text-subtle">
                  {connectionMode === "nas" ? serverUrl : "Tersimpan di perangkat ini"}
                </span>
              </span>
            </li>

            <li className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-fg">Studio siap dipakai</span>
                <span className="block text-[11px] text-subtle">
                  Pasfoto, kompres foto, dan gabung PDF langsung di HP
                </span>
              </span>
            </li>

            <li className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--tile-green)] text-[var(--tile-green-fg)]">
                <Cloud className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-fg">
                  {isGdriveConnected ? "Google Drive terhubung" : "Google Drive belum terhubung"}
                </span>
                <span className="block text-[11px] text-subtle">
                  {isGdriveConnected ? "Cadangan tambahan aktif" : "Opsional, untuk cadangan tambahan"}
                </span>
              </span>
            </li>
          </ul>

          <button
            onClick={onOpenServer}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <HardDrive className="h-3.5 w-3.5" aria-hidden />
            Detail server
          </button>
        </section>
      </div>

      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" aria-hidden /> Khusus keluarga
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Berkas tidak dibagikan ke pihak lain
        </span>
      </p>
    </div>
  );
}
