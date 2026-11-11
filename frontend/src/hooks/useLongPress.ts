"use client";

import { useCallback, useRef } from "react";

export interface LongPressPoint {
  x: number;
  y: number;
}

/**
 * Deteksi tekan-lama pada layar sentuh. Timer dibatalkan bila jari bergerak
 * lebih dari 10 px supaya menggulir daftar tidak memicu menu.
 */
export function useLongPress(onLongPress: (point: LongPressPoint) => void, delay = 450) {
  const timer = useRef<number | null>(null);
  const origin = useRef<LongPressPoint | null>(null);
  const fired = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") return;
      origin.current = { x: event.clientX, y: event.clientY };
      fired.current = false;
      timer.current = window.setTimeout(() => {
        const point = origin.current;
        if (!point) return;
        fired.current = true;
        timer.current = null;
        onLongPress(point);
      }, delay);
    },
    [delay, onLongPress]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = origin.current;
      if (!start || timer.current === null) return;
      if (Math.abs(event.clientX - start.x) > 10 || Math.abs(event.clientY - start.y) > 10) {
        cancelTimer();
      }
    },
    [cancelTimer]
  );

  const onPointerUp = useCallback(() => cancelTimer(), [cancelTimer]);

  /** Bernilai true sekali setelah long-press, agar klik berikutnya tidak membuka item. */
  const consumeLongPress = useCallback(() => {
    const value = fired.current;
    fired.current = false;
    return value;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave: onPointerUp,
    onPointerCancel: onPointerUp,
    consumeLongPress,
  };
}
