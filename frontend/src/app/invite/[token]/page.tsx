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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans">
      <Suspense
        fallback={<div className="text-zinc-400 text-xs">Memuat undangan...</div>}
      >
        <InviteTokenInner />
      </Suspense>
    </div>
  );
}
