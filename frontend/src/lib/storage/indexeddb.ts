import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface StoredFile {
  id: string;
  name: string;
  type: "image" | "video" | "document" | "archive" | "folder";
  size: number;
  mimeType: string;
  blob?: Blob;
  sha256?: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
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
}

const DB_NAME = "nas_local_storage";
const DB_VERSION = 1;

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
      },
    });
  }
  return dbPromise;
}

export async function calculateSHA256(blob: Blob): Promise<string> {
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

export async function getLocalFile(id: string): Promise<StoredFile | undefined> {
  const db = await getDB();
  return db.get("files", id);
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
