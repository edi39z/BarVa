// Antarmuka seragam untuk panel alat Studio.
//
// Panel alat baru berdiri sendiri di folder ini, bukan sebagai blok JSX
// kondisional di StudioTab.tsx, supaya berkas itu tidak terus membesar.

import type { StudioOutput } from "@/lib/studio/output";
import type { StudioToolId } from "@/lib/studio/tools";

export interface StudioPanelProps {
  /** Berkas yang dipilih lewat StoragePickerModal, menunggu diolah panel. */
  incomingFile: File | null;
  /** Dipanggil panel setelah berkas masuk ditangani, agar induk mengosongkannya. */
  onIncomingFileHandled: () => void;
  /** Unduh hasil lalu simpan ke pustaka. `saved: false` berarti simpan gagal. */
  onCommit: (output: StudioOutput) => Promise<{ saved: boolean }>;
  onSuccess: (message: string) => void;
  onOpenStoragePicker: (tool: StudioToolId) => void;
  /** Model AI hapus latar sudah pernah diunduh di perangkat ini. */
  bgModelReady: boolean;
  /** Dipanggil panel setelah model berhasil diunduh dan dipakai. */
  onBgModelReady: () => void;
}
