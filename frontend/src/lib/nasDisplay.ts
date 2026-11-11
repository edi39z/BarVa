import { NasFileNode } from "@/lib/api/nas";
import type { DisplayItem } from "@/lib/displayItem";
import { detectFileType } from "@/lib/fileTypes";
import type { FileType } from "@/lib/fileTypes";

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
  fileType: FileType;
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
  const type = detectFileType({
    mime: node.MimeType,
    name: node.Name,
    isDirectory: node.IsDirectory,
  });

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
    updatedAtISO: timestamp || undefined,
    parentId: node.ParentID,
    ownerId: node.OwnerID,
  };
}
