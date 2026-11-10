/**
 * Daftar alat Studio. Dipakai bersama oleh StudioTab, StoragePickerModal, dan page.tsx
 * supaya penambahan alat baru cukup diubah di satu tempat.
 */
export type StudioToolId = "img2pdf" | "mergepdf" | "idphoto" | "compress" | "removebg" | "enhance";

/** Alat yang hanya menerima satu foto sebagai masukan. */
export const SINGLE_IMAGE_TOOLS: StudioToolId[] = ["idphoto", "compress", "removebg", "enhance"];

/** Alat yang menerima banyak foto sekaligus. */
export const MULTI_IMAGE_TOOLS: StudioToolId[] = ["img2pdf"];
