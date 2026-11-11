import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { FileType } from "@/lib/fileTypes";

export interface StoredFile {
  id: string;
  name: string;
  type: FileType;
  size: number;
  mimeType: string;
  blob?: Blob;
  sha256?: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueuedUpload {
  id: string;
  name: string;
  blob: Blob;
  mimeType: string;
  parentId: string | null;
  overwrite: boolean;
  attempts: number;
  lastError?: string;
  createdAt: string;
}

interface NASDatabase extends DBSchema {
  files: {
    key: string;
    value: StoredFile;
    indexes: {
      "by-type": string;
      "by-created": string;
      "by-favorite": number;
    };
  };
  upload_queue: {
    key: string;
    value: QueuedUpload;
    indexes: {
      "by-created": string;
    };
  };
}

const DB_NAME = "nas_local_storage";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<NASDatabase>> | null = null;

function getDB(): Promise<IDBPDatabase<NASDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<NASDatabase>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files")) {
          const store = db.createObjectStore("files", { keyPath: "id" });
          store.createIndex("by-type", "type");
          store.createIndex("by-created", "createdAt");
          store.createIndex("by-favorite", "isFavorite");
        }
        // Store antrean upload ditambahkan di versi 2; data files lama tetap.
        if (!db.objectStoreNames.contains("upload_queue")) {
          const queue = db.createObjectStore("upload_queue", { keyPath: "id" });
          queue.createIndex("by-created", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

async function calculateSHA256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveLocalFile(
  name: string,
  blob: Blob,
  type: StoredFile["type"],
  mimeType: string
): Promise<StoredFile> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const sha256 = await calculateSHA256(blob);
  const now = new Date().toISOString();

  const fileRecord: StoredFile = {
    id,
    name,
    type,
    size: blob.size,
    mimeType,
    blob,
    sha256,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.put("files", fileRecord);
  return fileRecord;
}

export async function getAllLocalFiles(): Promise<StoredFile[]> {
  const db = await getDB();
  return db.getAll("files");
}

export async function deleteLocalFile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("files", id);
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const db = await getDB();
  const file = await db.get("files", id);
  if (!file) return false;
  file.isFavorite = !file.isFavorite;
  file.updatedAt = new Date().toISOString();
  await db.put("files", file);
  return !!file.isFavorite;
}

// ---------------- Antrean upload offline ----------------

export async function enqueueUpload(
  name: string,
  blob: Blob,
  parentId: string | null,
  overwrite: boolean,
  mimeType: string
): Promise<QueuedUpload> {
  const db = await getDB();
  const item: QueuedUpload = {
    id: crypto.randomUUID(),
    name,
    blob,
    mimeType,
    parentId,
    overwrite,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  await db.put("upload_queue", item);
  return item;
}

export async function listQueuedUploads(): Promise<QueuedUpload[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex("upload_queue", "by-created");
  return items;
}

export async function countQueuedUploads(): Promise<number> {
  const db = await getDB();
  return db.count("upload_queue");
}

export async function deleteQueuedUpload(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("upload_queue", id);
}

export async function markQueuedUploadFailed(id: string, message: string): Promise<void> {
  const db = await getDB();
  const item = await db.get("upload_queue", id);
  if (!item) return;
  item.attempts += 1;
  item.lastError = message;
  await db.put("upload_queue", item);
}
