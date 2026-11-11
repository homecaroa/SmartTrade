/**
 * Esqueleto de carga de las páginas que consultan datos (mercados, comparación, ficha de oportunidad).
 * Hasta el 11/11/2026 había un `app/loading.tsx` para toda la web. Con él, cualquier página empezaba a responder (200)
 * antes de saber si existía, y una ruta inexistente mostraba «no encontrada» con un 200: un «404 blando», como señaló
 * la auditoría de ese día. Ahora solo lo usan las páginas que tardan, y ninguna decide un 404 dentro de él.
 */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="h-24 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-64 animate-pulse rounded-lg bg-slate-200" />
      <span className="sr-only">Cargando datos…</span>
    </div>
  );
}
