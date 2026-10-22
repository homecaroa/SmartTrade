export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="h-24 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
      <span className="sr-only">Cargando oportunidades…</span>
    </div>
  );
}
