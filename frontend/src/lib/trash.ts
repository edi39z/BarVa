import type { TrashedNode } from "@/lib/api/nas";
import type { StoredFile } from "@/lib/storage/indexeddb";

/**
 * Bentuk netral untuk tab Sampah. Dua mode punya sumber data berbeda (DTO
 * backend vs record IndexedDB), jadi komponen hanya melihat bentuk ini.
 */
export interface TrashItem {
  id: string;
  /** `null` untuk berkas lokal yang tidak punya pemilik. */
  ownerId: string | null;
  parentId: string | null;
  parentName: string | null;
  name: string;
  isDirectory: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  deletedAt: string;
}

export function nasTrashToItem(node: TrashedNode): TrashItem {
  return {
    id: node.ID,
    ownerId: node.OwnerID,
    parentId: node.ParentID,
    parentName: node.ParentName,
    name: node.Name,
    isDirectory: node.IsDirectory,
    mimeType: node.MimeType,
    sizeBytes: node.SizeBytes,
    deletedAt: node.DeletedAt,
  };
}

export function localTrashToItem(file: StoredFile, parentName: string | null): TrashItem {
  return {
    id: file.id,
    ownerId: null,
    parentId: file.parentId,
    parentName,
    name: file.name,
    isDirectory: file.isDirectory,
    mimeType: file.isDirectory ? null : file.mimeType || null,
    sizeBytes: file.isDirectory ? null : file.size,
    deletedAt: file.deletedAt ?? file.updatedAt,
  };
}
