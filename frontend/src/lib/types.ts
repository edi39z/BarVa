/**
 * Tipe domain yang dipakai lintas komponen.
 *
 * Disimpan di satu tempat supaya Sidebar, MobileNav, Beranda, dan modal
 * pengaturan server tidak saling mengimpor dari komponen satu sama lain.
 */

/** Tab utama aplikasi. */
export type AppTab = "home" | "files" | "trash" | "gallery" | "studio" | "gdrive" | "shares";

/** Alat Studio yang bisa dibuka langsung dari Beranda. */
export type StudioTool = "img2pdf" | "mergepdf" | "idphoto" | "compress";

/** Mode koneksi: tanpa server (IndexedDB) atau NAS privat. */
export type ConnectionMode = "standalone" | "nas";
