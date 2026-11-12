import { openDB, DBSchema, IDBPDatabase, IDBPTransaction } from "idb";
import type { FileType } from "@/lib/fileTypes";
import { isLocalDescendant, localSubtreeIds } from "./localTree";

export interface StoredFile {
  id: string;
  name: string;
  type: FileType;
  size: number;
  mimeType: string;
  /** Folder induk; `null` berarti akar "Semua File". */
  parentId: string | null;
  /** Folder tidak punya blob maupun sha256. */
  isDirectory: boolean;
  /** Terisi saat node dipindahkan ke Sampah (soft delete). */
  deletedAt: string | null;
  blob?: Blob;
  sha256?: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoredText {
  /** ID berkas lokal; satu teks per berkas. */
  id: string;
  text: string;
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
  file_texts: {
    key: string;
    value: StoredText;
  };
}

const DB_NAME = "nas_local_storage";
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase<NASDatabase>> | null = null;

/** Record dari skema v3 yang belum punya field pohon maupun soft delete. */
type LegacyStoredFile = Omit<StoredFile, "parentId" | "isDirectory" | "deletedAt"> &
  Partial<Pick<StoredFile, "parentId" | "isDirectory" | "deletedAt">>;

/**
 * Lengkapi record lama dengan field v4. Berkas lama masuk ke akar dan dianggap
 * hidup; folder lama (kalau ada) dikenali dari `type`.
 */
async function migrateFilesToV4(
  tx: IDBPTransaction<NASDatabase, ("files" | "upload_queue" | "file_texts")[], "versionchange">
): Promise<void> {
  const store = tx.objectStore("files");
  let cursor = await store.openCursor();
  while (cursor) {
    const value = cursor.value as LegacyStoredFile;
    if (value.parentId === undefined || value.isDirectory === undefined || value.deletedAt === undefined) {
      await cursor.update({
        ...value,
        parentId: value.parentId ?? null,
        isDirectory: value.isDirectory ?? value.type === "folder",
        deletedAt: value.deletedAt ?? null,
      });
    }
    cursor = await cursor.continue();
  }
}

function getDB(): Promise<IDBPDatabase<NASDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<NASDatabase>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
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
        // Teks dokumen untuk pencarian isi ditambahkan di versi 3.
        if (!db.objectStoreNames.contains("file_texts")) {
          db.createObjectStore("file_texts", { keyPath: "id" });
        }
        // Versi 4 menambah pohon folder (parentId/isDirectory) dan Sampah
        // (deletedAt). Request IDB menjaga transaksi tetap hidup selama cursor.
        if (oldVersion > 0 && oldVersion < 4) {
          void migrateFilesToV4(tx).catch((err) =>
            console.error("Migrasi IndexedDB v4 gagal:", err)
          );
        }
      },
      blocked() {
        console.warn("IndexedDB diblokir tab lain; tutup tab lama lalu muat ulang.");
      },
    });
  }
  return dbPromise;
}

function nowISO(): string {
  return new Date().toISOString();
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
  mimeType: string,
  parentId: string | null = null
): Promise<StoredFile> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const sha256 = await calculateSHA256(blob);
  const now = nowISO();

  const fileRecord: StoredFile = {
    id,
    name,
    type,
    size: blob.size,
    mimeType,
    parentId,
    isDirectory: false,
    deletedAt: null,
    blob,
    sha256,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.put("files", fileRecord);
  return fileRecord;
}

/** Buat folder kosong. Folder hanya hidup di IndexedDB, tanpa blob. */
export async function createLocalFolder(
  name: string,
  parentId: string | null
): Promise<StoredFile> {
  const db = await getDB();
  const now = nowISO();
  const folder: StoredFile = {
    id: crypto.randomUUID(),
    name,
    type: "folder",
    size: 0,
    mimeType: "",
    parentId,
    isDirectory: true,
    deletedAt: null,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.put("files", folder);
  return folder;
}

export async function getAllLocalFiles(): Promise<StoredFile[]> {
  const db = await getDB();
  return db.getAll("files");
}

function requireAlive(file: StoredFile | undefined, action: string): StoredFile {
  if (!file) throw new Error(`Item tidak ditemukan.`);
  if (file.deletedAt) throw new Error(`Item ini ada di Sampah. Pulihkan dulu sebelum ${action}.`);
  return file;
}

export async function renameLocalNode(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nama tidak boleh kosong.");
  const db = await getDB();
  const file = requireAlive(await db.get("files", id), "mengganti nama");
  await db.put("files", { ...file, name: trimmed, updatedAt: nowISO() });
}

/**
 * Pindahkan node ke folder lain. Ditolak bila tujuan bukan folder, berada di
 * Sampah, atau justru bagian dari subtree node itu sendiri.
 */
export async function moveLocalNode(id: string, parentId: string | null): Promise<void> {
  const db = await getDB();
  const all = await db.getAll("files");
  const node = requireAlive(
    all.find((item) => item.id === id),
    "memindahkan"
  );

  if (parentId !== null) {
    const target = all.find((item) => item.id === parentId);
    if (!target || !target.isDirectory) throw new Error("Folder tujuan tidak ditemukan.");
    if (target.deletedAt) throw new Error("Folder tujuan ada di Sampah.");
    if (target.id === id || isLocalDescendant(all, id, target.id)) {
      throw new Error("Folder tidak bisa dipindah ke dalam dirinya sendiri.");
    }
  }

  await db.put("files", { ...node, parentId, updatedAt: nowISO() });
}

/** Tandai satu node masuk Sampah. Keturunannya ikut tersembunyi, bukan ditandai. */
export async function trashLocalNode(id: string): Promise<void> {
  const db = await getDB();
  const file = await db.get("files", id);
  if (!file || file.deletedAt) return;
  const now = nowISO();
  await db.put("files", { ...file, deletedAt: now, updatedAt: now });
}

/**
 * Pulihkan node dari Sampah. Bila folder induknya masih di Sampah, pemulihan
 * ditolak agar item tidak muncul di tempat yang tidak terlihat.
 */
export async function restoreLocalNode(id: string): Promise<{ movedToRoot: boolean }> {
  const db = await getDB();
  const all = await db.getAll("files");
  const node = all.find((item) => item.id === id);
  if (!node) throw new Error("Item tidak ditemukan.");
  if (!node.deletedAt) return { movedToRoot: false };

  let parentId = node.parentId;
  let movedToRoot = false;

  if (parentId !== null) {
    const parent = all.find((item) => item.id === parentId);
    if (!parent) {
      parentId = null;
      movedToRoot = true;
    } else if (parent.deletedAt) {
      throw new Error("Folder induk masih di Sampah. Pulihkan folder induknya lebih dulu.");
    }
  }

  const bentrok = all.some(
    (item) =>
      item.id !== node.id &&
      !item.deletedAt &&
      (item.parentId ?? null) === parentId &&
      item.name.toLocaleLowerCase() === node.name.toLocaleLowerCase()
  );
  if (bentrok) {
    throw new Error("Sudah ada item dengan nama sama di folder tujuan. Ganti namanya dulu.");
  }

  await db.put("files", { ...node, deletedAt: null, parentId, updatedAt: nowISO() });
  return { movedToRoot };
}

/**
 * Hapus permanen node beserta seluruh keturunannya. Satu-satunya operasi yang
 * benar-benar rekursif; teks pencarian ikut dibuang agar indeks tidak basi.
 */
export async function purgeLocalNode(id: string): Promise<void> {
  const db = await getDB();
  const all = await db.getAll("files");
  const ids = localSubtreeIds(all, id);
  if (ids.size === 0) return;

  const tx = db.transaction(["files", "file_texts"], "readwrite");
  for (const nodeId of ids) {
    void tx.objectStore("files").delete(nodeId);
    void tx.objectStore("file_texts").delete(nodeId);
  }
  await tx.done;
}

// ---------------- Indeks teks lokal ----------------

export async function saveLocalText(id: string, text: string): Promise<void> {
  const db = await getDB();
  await db.put("file_texts", { id, text, updatedAt: nowISO() });
}

export async function getAllLocalTexts(): Promise<StoredText[]> {
  const db = await getDB();
  return db.getAll("file_texts");
}

export async function deleteLocalText(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("file_texts", id);
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const db = await getDB();
  const file = await db.get("files", id);
  if (!file) return false;
  file.isFavorite = !file.isFavorite;
  file.updatedAt = nowISO();
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
    createdAt: nowISO(),
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
