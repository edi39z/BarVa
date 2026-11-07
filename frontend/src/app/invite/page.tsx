"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import InviteAccept from "@/components/InviteAccept";

function InviteFromQuery() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || undefined;
  return <InviteAccept token={token} />;
}

export default function InvitePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans">
      <Suspense
        fallback={<div className="text-zinc-400 text-xs">Memuat undangan...</div>}
      >
        <InviteFromQuery />
      </Suspense>
    </div>
  );
}
