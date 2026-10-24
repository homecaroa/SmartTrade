import Link from "next/link";
import { DataSourceLabel } from "@/components/data-source-label";
import { EmptyState } from "@/components/empty-state";
import { EntryPaths, SectorBanner } from "@/components/entry-paths";
import { ErrorState } from "@/components/error-state";
import { OpportunityTable } from "@/components/opportunity-table";
import { SearchForm } from "@/components/search-form";
import { getConfig } from "@/lib/config";
import { sectorFromQuery } from "@/lib/config/sectors";
import { parseQuery } from "@/lib/schemas/query";
import { getFilters, getRanking } from "@/lib/service";
import { SourceError } from "@/lib/sources/types";

type SP = Record<string, string | string[] | undefined>;

function href(base: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== "" && v !== 0) p.set(k, String(v));
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const parsed = parseQuery(await searchParams);
  if (!parsed.success) return <ErrorState message="Algún parámetro de búsqueda no es válido." hint={parsed.error.issues.map((i) => i.path.join(".")).join(", ")} />;
  const q = parsed.data;

  let cfg;
  try { cfg = getConfig(); } catch (e) { return <ErrorState message={e instanceof Error ? e.message : "Configuración inválida"} />; }
  const filters = getFilters();
  const base = { q: q.q, market: q.market, year: q.year, minSize: q.minSize, minGrowth: q.minGrowth, sort: q.sort, order: q.order, pageSize: q.pageSize === 20 ? undefined : q.pageSize };

  const form = (
    <SearchForm
      defaults={{ q: q.q, market: q.market, year: q.year ?? cfg.defaultYear, minSize: q.minSize, minGrowth: q.minGrowth, sort: q.sort, order: q.order }}
      markets={filters.markets} years={filters.years} productHint={filters.productInput}
    />
  );

  // En modos de datos reales no se consulta nada hasta que el usuario elige un producto o sector (evita un error al abrir la web)
  if (cfg.mode !== "demo" && !q.q) {
    return (
      <>
        <EntryPaths />
        <h2 className="pt-2 text-sm font-semibold text-slate-600">Búsqueda avanzada</h2>
        {form}
      </>
    );
  }

  let data;
  try {
    data = await getRanking(q);
  } catch (e) {
    const msg = e instanceof SourceError ? e.message : "Error inesperado al calcular el ranking.";
    return <>{form}<ErrorState message={msg} hint={e instanceof SourceError && e.kind !== "config" ? "Inténtalo de nuevo más tarde. No se muestran datos inventados." : undefined} /></>;
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const sortHref = (s: "score" | "size" | "growth") => href(base, { sort: s, order: q.sort === s && q.order === "desc" ? "asc" : "desc", page: undefined });
  const detailQuery = cfg.mode === "demo" ? "" : `?q=${encodeURIComponent(q.q ?? "")}`;
  const exportHref = "/api/opportunities/export?" + href(base).split("?")[1];

  const sector = sectorFromQuery(q.q);

  return (
    <>
      {!q.q && <EntryPaths />}
      {form}
      {sector && <SectorBanner current={sector} onlyOne />}
      <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <b>{data.validCount}</b> oportunidades válidas · ventana {data.years[0]}–{data.endYear} · {data.incompleteCount} incompletas excluidas del ranking
          </p>
          {data.validCount > 0 && <a href={exportHref} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">Exportar CSV</a>}
        </div>
        <DataSourceLabel info={data.info} />
        {data.info.warnings.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-slate-500">{data.info.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
        <p className="text-xs text-slate-500">Los percentiles se calculan sobre {data.universeSize} oportunidades completas de esta carga de datos (antes de aplicar los filtros).</p>
      </section>

      {data.rows.length === 0 ? (
        <EmptyState title="No hay oportunidades que cumplan los criterios" hint="Prueba a ampliar el periodo, bajar el tamaño o crecimiento mínimos o quitar el mercado." />
      ) : (
        <>
          <OpportunityTable rows={data.rows} offset={data.offset} sortHref={sortHref} detailQuery={detailQuery} q={q.q} />
          <nav className="flex items-center justify-between text-sm" aria-label="Paginación">
            {data.page > 1 ? <Link className="underline" href={href(base, { page: data.page - 1 })}>← Anterior</Link> : <span />}
            <span>Página {data.page} de {pages}</span>
            {data.page < pages ? <Link className="underline" href={href(base, { page: data.page + 1 })}>Siguiente →</Link> : <span />}
          </nav>
        </>
      )}

      {data.incomplete.length > 0 && (
        <details className="rounded-lg bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium">Oportunidades incompletas excluidas del ranking ({data.incompleteCount})</summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {data.incomplete.map((o) => (
              <li key={o.id}><b>{o.productName}</b> ({o.productCode}) → {o.marketName}: {o.missing.join("; ")}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
