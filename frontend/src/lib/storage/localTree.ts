/**
 * Helper pohon berkas lokal (mode standalone). Record IndexedDB disimpan flat
 * dengan `parentId`, jadi seluruh navigasi dihitung di memori dari satu daftar.
 */

export interface LocalTreeNode {
  id: string;
  parentId?: string | null;
}

export interface LocalNamedNode extends LocalTreeNode {
  name: string;
}

export interface LocalTrashNode extends LocalTreeNode {
  deletedAt?: string | null;
}

function parentKey(node: LocalTreeNode): string | null {
  return node.parentId ?? null;
}

function groupByParent<T extends LocalTreeNode>(nodes: T[]): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>();
  for (const node of nodes) {
    const key = parentKey(node);
    const siblings = map.get(key);
    if (siblings) siblings.push(node);
    else map.set(key, [node]);
  }
  return map;
}

/**
 * Node yang boleh tampil di UI: tidak di Sampah dan bukan keturunan node yang
 * di Sampah. Menandai satu folder cukup untuk menyembunyikan seluruh isinya.
 */
export function visibleLocalFiles<T extends LocalTrashNode>(nodes: T[]): T[] {
  const byParent = groupByParent(nodes);
  const hidden = new Set<string>();
  const stack = nodes.filter((node) => !!node.deletedAt).map((node) => node.id);

  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of byParent.get(current) ?? []) {
      if (hidden.has(child.id)) continue;
      hidden.add(child.id);
      stack.push(child.id);
    }
  }

  return nodes.filter((node) => !node.deletedAt && !hidden.has(node.id));
}

/** Node yang ditandai terhapus; isi folder yang di Sampah tidak ikut didaftar. */
export function trashedLocalFiles<T extends LocalTrashNode>(nodes: T[]): T[] {
  return nodes.filter((node) => !!node.deletedAt);
}

/** Semua id di subtree `rootId`, termasuk root itu sendiri. */
export function localSubtreeIds<T extends LocalTreeNode>(nodes: T[], rootId: string): Set<string> {
  const byParent = groupByParent(nodes);
  const ids = new Set<string>();
  if (!nodes.some((node) => node.id === rootId)) return ids;

  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (ids.has(current)) continue;
    ids.add(current);
    for (const child of byParent.get(current) ?? []) stack.push(child.id);
  }
  return ids;
}

/** Apakah `candidateId` berada di bawah `ancestorId`. */
export function isLocalDescendant<T extends LocalTreeNode>(
  nodes: T[],
  ancestorId: string,
  candidateId: string
): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(candidateId);

  while (current) {
    const parentId = parentKey(current);
    if (parentId === null || seen.has(parentId)) return false;
    if (parentId === ancestorId) return true;
    seen.add(parentId);
    current = byId.get(parentId);
  }
  return false;
}

/**
 * Cek nama yang sudah dipakai saudara (folder yang sama). Perbandingan
 * case-insensitive supaya "Foto" dan "foto" dianggap bentrok di UI.
 */
export function hasLocalNameConflict<T extends LocalNamedNode>(
  nodes: T[],
  parentId: string | null,
  name: string,
  excludeIds: Iterable<string> = []
): boolean {
  const excluded = new Set(excludeIds);
  const target = name.trim().toLocaleLowerCase();
  return nodes.some(
    (node) =>
      !excluded.has(node.id) &&
      parentKey(node) === parentId &&
      node.name.toLocaleLowerCase() === target
  );
}

/** Nama unik untuk unggahan: "foto.png", "foto (2).png", ... */
export function uniqueLocalName<T extends LocalNamedNode>(
  nodes: T[],
  parentId: string | null,
  name: string,
  isDirectory = false
): string {
  if (!hasLocalNameConflict(nodes, parentId, name)) return name;

  const dot = isDirectory ? -1 : name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    if (!hasLocalNameConflict(nodes, parentId, candidate)) return candidate;
  }
  return `${base} (${crypto.randomUUID().slice(0, 6)})${ext}`;
}
