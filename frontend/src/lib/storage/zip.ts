// Pembaca ZIP minimal untuk mengambil satu entri dari DOCX.
//
// `docx` hanya bisa menulis, dan menambah library ZIP baru tidak sepadan untuk
// satu kebutuhan. Parser ini membaca central directory lalu meng-inflate satu
// entri dengan DecompressionStream bawaan browser.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

function findEndOfCentralDirectory(view: DataView): number {
  const stop = Math.max(0, view.byteLength - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = view.byteLength - EOCD_MIN_SIZE; offset >= stop; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Browser tidak mendukung dekompresi ZIP.");
  }
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readLocalEntry(
  buffer: ArrayBuffer,
  view: DataView,
  localOffset: number,
  compressedSize: number,
  method: number,
  maxBytes: number
): Promise<string | null> {
  if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
    return null;
  }

  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > buffer.byteLength) return null;

  const compressed = new Uint8Array(buffer, start, compressedSize);
  let bytes: Uint8Array;
  if (method === 0) {
    bytes = compressed;
  } else if (method === 8) {
    bytes = await inflateRaw(compressed);
  } else {
    return null;
  }

  if (bytes.byteLength > maxBytes) {
    bytes = bytes.subarray(0, maxBytes);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Ambil isi satu entri ZIP sebagai teks UTF-8. Mengembalikan `null` bila entri
 * tidak ada, ukurannya melebihi batas, atau metodenya tidak didukung.
 */
export async function readZipEntry(
  file: Blob,
  entryName: string,
  maxBytes: number
): Promise<string | null> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return null;

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) {
    // ZIP64 tidak dipakai DOCX biasa; hindari membaca offset yang salah.
    return null;
  }

  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return null;
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));

    if (name === entryName) {
      if (uncompressedSize > maxBytes) return null;
      return readLocalEntry(buffer, view, localOffset, compressedSize, method, maxBytes);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}
