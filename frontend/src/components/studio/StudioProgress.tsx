"use client";

interface StudioProgressProps {
  label: string;
  percent: number;
  /** Keterangan tambahan di bawah bilah, mis. "Jangan tutup tab ini". */
  detail?: string;
}

/** Bilah kemajuan bersama untuk alat Studio yang berjalan lama. */
export default function StudioProgress({ label, percent, detail }: StudioProgressProps) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="font-semibold text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-brand">{value}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-[var(--brand-solid)] transition-[width] duration-300"
          style={{ width: `${Math.max(4, value)}%` }}
        />
      </div>
      {detail && <p className="mt-1.5 text-[11.5px] text-subtle">{detail}</p>}
    </div>
  );
}
