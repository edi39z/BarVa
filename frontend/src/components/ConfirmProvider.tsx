"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmDialog, { type DialogTone } from "./ConfirmDialog";
import PromptDialog from "./PromptDialog";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface NotifyOptions {
  /** Bila kosong dipakai "Pemberitahuan". */
  title?: string;
  message: ReactNode;
  tone?: DialogTone;
  confirmLabel?: string;
}

export interface PromptOptions {
  title: string;
  message?: ReactNode;
  /** Label isian, mis. "Nama folder". */
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmApi {
  /** Tanya sebelum tindakan yang tidak bisa dibatalkan. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Beri tahu hasil operasi tanpa perlu dua pilihan. */
  notify: (options: NotifyOptions) => Promise<void>;
  /** Minta satu isian teks; `null` bila dibatalkan. */
  ask: (options: PromptOptions) => Promise<string | null>;
}

type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: "alert"; options: NotifyOptions; resolve: () => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

const ConfirmContext = createContext<ConfirmApi | null>(null);

/**
 * Menyediakan `confirm()` dan `notify()` berbasis promise untuk seluruh
 * aplikasi.
 *
 * Antrean dipakai karena satu dialog hanya bisa tampil pada satu waktu: bila
 * pesan kedua muncul saat dialog pertama masih terbuka (mis. beberapa unggahan
 * gagal berurutan), pesan itu menunggu sampai pengguna menutup yang pertama.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Request | null>(null);
  const queue = useRef<Request[]>([]);
  const active = useRef<Request | null>(null);
  const nextId = useRef(0);

  const enqueue = useCallback((request: Request) => {
    // `active` diperbarui sinkron supaya dua panggilan dalam satu tick tidak
    // sama-sama menganggap tidak ada dialog yang terbuka.
    if (active.current) {
      queue.current.push(request);
      return;
    }
    active.current = request;
    setCurrent(request);
  }, []);

  const confirm = useCallback<ConfirmApi["confirm"]>(
    (options) =>
      new Promise<boolean>((resolve) => {
        enqueue({ id: ++nextId.current, kind: "confirm", options, resolve });
      }),
    [enqueue]
  );

  const notify = useCallback<ConfirmApi["notify"]>(
    (options) =>
      new Promise<void>((resolve) => {
        enqueue({ id: ++nextId.current, kind: "alert", options, resolve });
      }),
    [enqueue]
  );

  const ask = useCallback<ConfirmApi["ask"]>(
    (options) =>
      new Promise<string | null>((resolve) => {
        enqueue({ id: ++nextId.current, kind: "prompt", options, resolve });
      }),
    [enqueue]
  );

  const settle = useCallback((value: boolean | string | null) => {
    const done = active.current;
    if (done) {
      if (done.kind === "confirm") done.resolve(value === true);
      else if (done.kind === "prompt") done.resolve(typeof value === "string" ? value : null);
      else done.resolve();
    }
    const next = queue.current.shift() ?? null;
    active.current = next;
    setCurrent(next);
  }, []);

  const api = useMemo<ConfirmApi>(() => ({ confirm, notify, ask }), [confirm, notify, ask]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {current && current.kind === "prompt" && (
        <PromptDialog
          key={current.id}
          title={current.options.title}
          message={current.options.message}
          label={current.options.label}
          defaultValue={current.options.defaultValue}
          placeholder={current.options.placeholder}
          confirmLabel={current.options.confirmLabel}
          cancelLabel={current.options.cancelLabel}
          onConfirm={(value) => settle(value)}
          onCancel={() => settle(null)}
        />
      )}
      {current && current.kind !== "prompt" && (
        <ConfirmDialog
          key={current.id}
          mode={current.kind}
          title={current.options.title ?? "Pemberitahuan"}
          message={current.options.message}
          tone={current.options.tone}
          confirmLabel={current.options.confirmLabel}
          cancelLabel={current.kind === "confirm" ? current.options.cancelLabel : undefined}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** Akses dialog keputusan. Harus dipakai di dalam `ConfirmProvider`. */
export function useConfirm(): ConfirmApi {
  const api = useContext(ConfirmContext);
  if (!api) {
    throw new Error("useConfirm harus dipakai di dalam ConfirmProvider");
  }
  return api;
}
