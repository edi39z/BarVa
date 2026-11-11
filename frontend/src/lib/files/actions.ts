/**
 * Definisi aksi untuk menu berkas. Dipisah dari komponen supaya daftar aksi
 * mudah diuji dan dipakai bersama oleh daftar berkas maupun galeri.
 */
import type { DisplayItem } from "@/lib/displayItem";
import type { StudioToolId } from "@/lib/studio/tools";

export type FileActionId =
  | "open"
  | "download"
  | "archive"
  | "copy-local"
  | "copy-gdrive"
  | "rename"
  | "move"
  | "share"
  | "delete"
  | "removebg"
  | "compress"
  | "enhance"
  | "idphoto"
  | "img2pdf"
  | "pdf2word"
  | "pdfedit"
  | "mergepdf"
  | "newfolder"
  | "group-type"
  | "group-month";

export type FileActionGroup = "smart" | "manage";

export interface FileAction {
  id: FileActionId;
  label: string;
  group: FileActionGroup;
  /** Butuh isi berkas di memori (diunduh dulu pada mode NAS). */
  needsFile?: boolean;
  /** Mengubah data; disembunyikan untuk berkas milik anggota lain. */
  destructive?: boolean;
  /** Alat Studio yang dijalankan, bila aksi ini memproses berkas. */
  tool?: StudioToolId;
}

/** PDF dikenali dari ekstensi karena DisplayItem tidak menyimpan MIME. */
function isPdfItem(item: DisplayItem): boolean {
  return item.type !== "folder" && item.name.toLowerCase().endsWith(".pdf");
}

function isImageItem(item: DisplayItem): boolean {
  return item.type === "image";
}

const SMART_IMAGE_ACTIONS: FileAction[] = [
  { id: "removebg", label: "Hapus latar", group: "smart", needsFile: true, tool: "removebg" },
  { id: "compress", label: "Kompres foto", group: "smart", needsFile: true, tool: "compress" },
  { id: "enhance", label: "Naikkan kualitas", group: "smart", needsFile: true, tool: "enhance" },
  { id: "idphoto", label: "Jadikan pasfoto", group: "smart", needsFile: true, tool: "idphoto" },
  { id: "img2pdf", label: "Jadikan PDF", group: "smart", needsFile: true, tool: "img2pdf" },
];

const SMART_PDF_ACTIONS: FileAction[] = [
  { id: "pdf2word", label: "PDF ke Word", group: "smart", needsFile: true, tool: "pdf2word" },
  { id: "pdfedit", label: "Editor PDF", group: "smart", needsFile: true, tool: "pdfedit" },
];

function manageActions(item: DisplayItem, foreign: boolean): FileAction[] {
  const actions: FileAction[] = [
    { id: "open", label: item.type === "folder" ? "Buka folder" : "Buka", group: "manage" },
  ];

  if (item.type !== "folder") {
    actions.push({ id: "download", label: "Unduh", group: "manage" });
    if (item.source === "hdd" || item.source === "gdrive") {
      actions.push({ id: "copy-local", label: "Salin ke Perangkat ini", group: "manage" });
    }
    if (item.source !== "gdrive") {
      actions.push({ id: "copy-gdrive", label: "Salin ke Google Drive", group: "manage" });
    }
  } else if (!item.readOnly && item.source !== "hdd" && item.source !== "gdrive") {
    actions.push({ id: "archive", label: "Unduh sebagai ZIP", group: "manage" });
  }

  // Berkas read-only (seperti HDD 500GB data lama) atau Google Drive tidak boleh
  // dimutasi/dihapus agar data lama 100% aman dari terhapus atau korup.
  if (!foreign && !item.readOnly && item.source !== "hdd" && item.source !== "gdrive") {
    actions.push({ id: "rename", label: "Ganti nama", group: "manage" });
    actions.push({ id: "move", label: "Pindahkan", group: "manage" });
    if (item.type !== "folder") {
      actions.push({ id: "share", label: "Bagikan tautan", group: "manage" });
    }
    actions.push({ id: "delete", label: "Hapus", group: "manage", destructive: true });
  }

  return actions;
}

/** Aksi untuk satu item. `foreign` menyembunyikan aksi yang mengubah data. */
export function actionsForItem(item: DisplayItem, foreign = false): FileAction[] {
  const smart: FileAction[] = [];

  if (!foreign && item.type === "image") {
    smart.push(...SMART_IMAGE_ACTIONS);
  }
  if (!foreign && isPdfItem(item)) {
    smart.push(...SMART_PDF_ACTIONS);
  }

  return [...smart, ...manageActions(item, foreign)];
}

/**
 * Aksi untuk banyak item sekaligus. Aksi tipe-spesifik hanya muncul bila semua
 * item sejenis dan tidak ada folder di dalam pilihan.
 *
 * Tekan lama pada layar sentuh memilih satu item sekaligus, jadi label memakai
 * akhiran "semua" hanya ketika pilihan benar-benar berisi lebih dari satu item.
 */
export function actionsForSelection(items: DisplayItem[], foreign = false): FileAction[] {
  const files = items.filter((item) => item.type !== "folder");
  const hasFolder = files.length !== items.length;
  const allImages = files.length > 0 && files.every(isImageItem);
  const allPdfs = files.length > 0 && files.every(isPdfItem);
  const many = items.length > 1;
  const suffix = many ? " semua" : "";
  const smart: FileAction[] = [];

  if (!foreign && !hasFolder && allImages) {
    smart.push({ id: "img2pdf", label: "Jadikan PDF", group: "smart", needsFile: true, tool: "img2pdf" });
    smart.push({ id: "removebg", label: `Hapus latar${suffix}`, group: "smart", needsFile: true, tool: "removebg" });
    smart.push({
      id: "compress",
      label: many ? "Kompres semua" : "Kompres foto",
      group: "smart",
      needsFile: true,
      tool: "compress",
    });
    smart.push({
      id: "enhance",
      label: `Naikkan kualitas${suffix}`,
      group: "smart",
      needsFile: true,
      tool: "enhance",
    });
  }

  if (!foreign && !hasFolder && allPdfs && files.length >= 2) {
    smart.push({ id: "mergepdf", label: "Gabung PDF", group: "smart", needsFile: true, tool: "mergepdf" });
  }

  const manage: FileAction[] = [];
  const anyReadOnly = items.some((i) => i.readOnly || i.source === "hdd" || i.source === "gdrive");

  if (files.length > 0) {
    manage.push({ id: "download", label: `Unduh${suffix}`, group: "manage" });
    if (files.some((i) => i.source === "hdd" || i.source === "gdrive")) {
      manage.push({ id: "copy-local", label: `Salin ke Perangkat ini${suffix}`, group: "manage" });
    }
    if (files.some((i) => i.source !== "gdrive")) {
      manage.push({ id: "copy-gdrive", label: `Salin ke Google Drive${suffix}`, group: "manage" });
    }
  }
  if (!foreign && !anyReadOnly) {
    manage.push({ id: "newfolder", label: "Buat folder dari pilihan", group: "manage" });
    manage.push({ id: "group-type", label: "Kelompokkan per tipe", group: "manage" });
    manage.push({ id: "group-month", label: "Kelompokkan per bulan", group: "manage" });
    manage.push({ id: "move", label: `Pindahkan${suffix}`, group: "manage" });
    manage.push({ id: "delete", label: `Hapus${suffix}`, group: "manage", destructive: true });
  }

  return [...smart, ...manage];
}

export type GroupMode = "type" | "month";

export interface ItemGroup {
  key: string;
  name: string;
  items: DisplayItem[];
}

const TYPE_LABELS: Record<DisplayItem["type"], string> = {
  folder: "Folder",
  image: "Foto",
  video: "Video",
  document: "Dokumen",
  archive: "Arsip",
};

/** Kelompokkan item untuk fitur "Kelompokkan otomatis". */
export function groupItems(items: DisplayItem[], mode: GroupMode): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();

  for (const item of items) {
    if (item.type === "folder") continue;

    let key: string;
    let name: string;

    if (mode === "type") {
      key = isPdfItem(item) ? "pdf" : item.type;
      name = isPdfItem(item) ? "PDF" : TYPE_LABELS[item.type];
    } else {
      const date = item.updatedAtISO ? new Date(item.updatedAtISO) : null;
      if (!date || Number.isNaN(date.getTime())) {
        key = "lainnya";
        name = "Lainnya";
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        name = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(date);
      }
    }

    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { key, name, items: [item] });
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}
