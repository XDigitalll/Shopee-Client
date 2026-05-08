"use client";

import { useEffect } from "react";

import { ClientStateCard } from "@/components/client-feedback-state";

export default function ClientSegmentError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <ClientStateCard
        title="Algo falhou nesta pagina"
        message="Houve um erro inesperado a montar esta area. Tenta novamente sem sair da tua conta."
      />
      <div className="mt-4">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-2xl px-5 py-3 text-sm font-black text-white transition"
          style={{ background: "#E8431A", fontFamily: "'Sora', sans-serif" }}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
