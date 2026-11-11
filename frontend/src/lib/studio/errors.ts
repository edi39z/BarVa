// Pemetaan galat Studio ke pesan yang bisa ditindaklanjuti.
//
// Sebelumnya semua kegagalan berakhir sebagai `alert()` generik tanpa
// membedakan PDF terkunci, PDF rusak, model AI gagal diunduh, atau penyimpanan
// penuh — padahal tindakan yang perlu dilakukan pengguna berbeda-beda.

export type StudioErrorCode =
  | "PDF_PASSWORD"
  | "PDF_ENCRYPTED"
  | "PDF_INVALID"
  | "IMAGE_INVALID"
  | "MODEL_DOWNLOAD"
  | "MODEL_RUNTIME"
  | "MEMORY"
  | "STORAGE_FULL"
  | "EXPORT_FAILED"
  | "INPUT_INCOMPLETE"
  | "ABORTED"
  | "UNKNOWN";

export class StudioError extends Error {
  readonly code: StudioErrorCode;
  readonly hint?: string;

  constructor(code: StudioErrorCode, message: string, hint?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StudioError";
    this.code = code;
    this.hint = hint;
  }
}

export interface StudioErrorInfo {
  code: StudioErrorCode;
  title: string;
  message: string;
  hint?: string;
  /** `warn` dipakai saat hasilnya sudah diunduh tetapi gagal disimpan. */
  tone: "danger" | "warn";
}

const MESSAGES: Record<StudioErrorCode, Omit<StudioErrorInfo, "code" | "tone">> = {
  PDF_PASSWORD: {
    title: "PDF terkunci kata sandi",
    message: "Dokumen ini butuh kata sandi untuk dibuka.",
    hint: "Masukkan kata sandi yang benar, atau simpan salinan tanpa kata sandi lalu coba lagi.",
  },
  PDF_ENCRYPTED: {
    title: "PDF terenkripsi",
    message: "Dokumen ini dilindungi enkripsi sehingga tidak bisa dibaca.",
    hint: "Simpan salinan tanpa kata sandi dari aplikasi pembuatnya, lalu coba lagi.",
  },
  PDF_INVALID: {
    title: "PDF tidak bisa dibaca",
    message: "Berkas mungkin rusak, terpotong, atau bukan PDF yang valid.",
    hint: "Coba buka berkasnya di aplikasi PDF lain untuk memastikan masih utuh.",
  },
  IMAGE_INVALID: {
    title: "Gambar tidak bisa dibuka",
    message: "Berkas ini bukan gambar yang didukung peramban.",
    hint: "Gunakan JPG, PNG, atau WEBP.",
  },
  MODEL_DOWNLOAD: {
    title: "Model AI gagal diunduh",
    message: "Unduhan model terputus sebelum selesai.",
    hint: "Periksa koneksi internet lalu coba lagi — unduhan hanya perlu sekali.",
  },
  MODEL_RUNTIME: {
    title: "Model AI gagal dijalankan",
    message: "Perangkat tidak cukup memori untuk memproses foto ini.",
    hint: "Tutup tab lain, lalu coba foto dengan ukuran lebih kecil.",
  },
  MEMORY: {
    title: "Memori tidak cukup",
    message: "Proses ini membutuhkan memori lebih besar dari yang tersedia.",
    hint: "Tutup tab lain, atau kerjakan dokumen dengan halaman lebih sedikit.",
  },
  STORAGE_FULL: {
    title: "Penyimpanan perangkat penuh",
    message: "Berkas sudah diunduh, tetapi gagal disimpan di aplikasi.",
    hint: "Hapus beberapa berkas lama dari daftar, lalu ulangi bila ingin menyimpannya.",
  },
  EXPORT_FAILED: {
    title: "Gagal membuat berkas",
    message: "Berkas hasil tidak bisa disusun.",
    hint: "Coba lagi; bila tetap gagal, periksa berkas sumbernya.",
  },
  INPUT_INCOMPLETE: {
    title: "Berkas belum cukup",
    message: "Alat ini butuh berkas dengan jumlah tertentu.",
    hint: "Pilih berkas yang diminta lalu ulangi.",
  },
  ABORTED: {
    title: "Dibatalkan",
    message: "Proses dihentikan sebelum selesai.",
  },
  UNKNOWN: {
    title: "Terjadi kesalahan",
    message: "Proses tidak bisa diselesaikan.",
    hint: "Coba lagi. Bila tetap gagal, periksa berkas yang dipakai.",
  },
};

function nameOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function codeFor(error: unknown): StudioErrorCode {
  if (error instanceof StudioError) return error.code;

  const name = nameOf(error);
  const message = messageOf(error).toLowerCase();

  if (name === "PasswordException") return "PDF_PASSWORD";
  if (name === "EncryptedPDFError") return "PDF_ENCRYPTED";
  if (
    name === "InvalidPDFException" ||
    name === "MissingPDFException" ||
    name === "PDFParsingError" ||
    name === "MissingPDFHeaderError" ||
    name === "FormatError"
  ) {
    return "PDF_INVALID";
  }
  if (name === "QuotaExceededError") return "STORAGE_FULL";
  if (name === "AbortError" || name === "RenderingCancelledException") return "ABORTED";
  if (message.includes("out of memory") || message.includes("allocation failed")) return "MEMORY";
  if (message.includes("quota")) return "STORAGE_FULL";
  if (name === "EncodingError" || name === "InvalidStateError") return "IMAGE_INVALID";

  return "UNKNOWN";
}

export function describeStudioError(error: unknown): StudioErrorInfo {
  const code = codeFor(error);
  const base = MESSAGES[code];

  // Pesan khusus dari pemanggil (mis. menyebut nama berkas) lebih berguna
  // daripada pesan umum, jadi dipakai bila ada.
  const custom = error instanceof StudioError ? error.message : "";
  const hint = error instanceof StudioError && error.hint ? error.hint : base.hint;

  return {
    code,
    title: base.title,
    message: custom || base.message,
    hint,
    tone: code === "STORAGE_FULL" || code === "INPUT_INCOMPLETE" ? "warn" : "danger",
  };
}
