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
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4 text-fg">
      <Suspense
        fallback={<div className="text-[12px] text-muted">Memuat undangan…</div>}
      >
        <InviteFromQuery />
      </Suspense>
    </div>
  );
}
