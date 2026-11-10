"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";
import InviteAccept from "@/components/InviteAccept";

function InviteTokenInner() {
  const params = useParams<{ token: string | string[] }>();
  const raw = params?.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  return <InviteAccept token={token} />;
}

export default function InviteTokenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4 text-fg">
      <Suspense
        fallback={<div className="text-[12px] text-muted">Memuat undangan…</div>}
      >
        <InviteTokenInner />
      </Suspense>
    </div>
  );
}
