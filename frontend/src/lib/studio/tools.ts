/**
 * Daftar alat Studio. Dipakai bersama oleh StudioTab, StoragePickerModal, dan page.tsx
 * supaya penambahan alat baru cukup diubah di satu tempat.
 */
export type StudioToolId =
  | "img2pdf"
  | "mergepdf"
  | "pdf2word"
  | "pdfedit"
  | "idphoto"
  | "compress"
  | "removebg"
  | "enhance";

/** Alat yang hanya menerima satu foto sebagai masukan. */
export const SINGLE_IMAGE_TOOLS: StudioToolId[] = ["idphoto", "compress", "removebg", "enhance"];

/** Alat yang menerima banyak foto sekaligus. */
export const MULTI_IMAGE_TOOLS: StudioToolId[] = ["img2pdf"];

/** Alat yang menerima tepat satu berkas PDF. */
export const SINGLE_PDF_TOOLS: StudioToolId[] = ["pdf2word", "pdfedit"];

/** Alat yang menerima banyak berkas PDF sekaligus. */
export const MULTI_PDF_TOOLS: StudioToolId[] = ["mergepdf"];

/**
 * Alat yang punya panel sendiri dan mengolah berkasnya di dalam panel.
 *
 * Untuk alat ini Storage Picker hanya meneruskan berkas yang dipilih; pratinjau,
 * opsi, dan penyimpanan diurus panelnya.
 */
export const PANEL_TOOLS: StudioToolId[] = ["idphoto", "pdf2word", "pdfedit"];

export function isPdfTool(tool: StudioToolId): boolean {
  return SINGLE_PDF_TOOLS.includes(tool) || MULTI_PDF_TOOLS.includes(tool);
}

/** Alat yang hanya boleh menerima satu berkas. */
export function isSingleFileTool(tool: StudioToolId): boolean {
  return SINGLE_IMAGE_TOOLS.includes(tool) || SINGLE_PDF_TOOLS.includes(tool);
}
