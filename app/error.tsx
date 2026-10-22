"use client";
import { ErrorState } from "@/components/error-state";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorState message="Se ha producido un error inesperado." hint={error.digest ? `Referencia: ${error.digest}` : undefined} />
      <button onClick={reset} className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Reintentar</button>
    </div>
  );
}
