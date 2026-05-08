"use client";

import { Logo } from "@/components/logo";

export function GlobalAppLoader() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-7"
      style={{ background: "#FFF8F5" }}
    >
      <Logo size="lg" />
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-7 w-7 rounded-full border-[3px] animate-spin"
          style={{ borderColor: "#E8431A", borderTopColor: "transparent" }}
        />
        <p
          className="text-sm"
          style={{ color: "#9CA3AF", fontFamily: "'DM Sans', sans-serif" }}
        >
          A preparar a tua sessão...
        </p>
      </div>
    </div>
  );
}
