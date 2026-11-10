import { NasFileNode } from "@/lib/api/nas";

// Bentuk item yang dipakai seluruh UI. Backend mengirim NasFileNode, sedangkan
// berkas lokal (IndexedDB) dipetakan ke bentuk yang sama supaya komponen tidak
// perlu tahu asal datanya.
export interface DisplayItem {
  id: string;
  name: string;
  type: "folder" | "image" | "video" | "document" | "archive";
  sizeStr: string;
  sizeBytes: number;
  updatedAt: string;
  parentId?: string | null;
  ownerId?: string | null;
  sha256?: string;
  isFavorite?: boolean;
  duration?: string;
  dimensions?: string;
  blob?: Blob;
}

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  usedBytes: number;
  quotaBytes: number;
  avatarBg: string;
}

export interface ActiveShare {
  id: string;
  fileName: string;
  fileType: DisplayItem["type"];
  rawToken: string;
  shareUrl: string;
  permission: "viewer" | "uploader";
  expiresAtStr: string;
  hasPassword: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Ubah node dari backend Go menjadi bentuk yang dipakai UI.
export function nasNodeToDisplay(node: NasFileNode): DisplayItem {
  const mime = (node.MimeType || "").toLowerCase();
  const lowerName = node.Name.toLowerCase();

  let type: DisplayItem["type"] = "document";
  if (node.IsDirectory) {
    type = "folder";
  } else if (mime.startsWith("image/")) {
    type = "image";
  } else if (mime.startsWith("video/") || mime.startsWith("audio/")) {
    type = "video";
  } else if (
    mime.startsWith("application/zip") ||
    mime.startsWith("application/x-rar") ||
    mime.startsWith("application/x-7z") ||
    mime.startsWith("application/gzip") ||
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".rar") ||
    lowerName.endsWith(".7z") ||
    lowerName.endsWith(".tar.gz")
  ) {
    type = "archive";
  }

  const size = node.SizeBytes ?? 0;
  const timestamp = node.UpdatedAt || node.CreatedAt;

  return {
    id: node.ID,
    name: node.Name,
    type,
    sizeStr: node.IsDirectory ? "Folder" : formatBytes(size),
    sizeBytes: size,
    updatedAt: timestamp
      ? new Date(timestamp).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
    parentId: node.ParentID,
    ownerId: node.OwnerID,
  };
}
