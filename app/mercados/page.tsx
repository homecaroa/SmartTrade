import { MetricSwitch } from "@/components/metric-switch";
import { PartnerBasisNote } from "@/components/partner-basis-note";
import { ProductPicker } from "@/components/product-picker";
import { codeLabel, productLabel } from "@/lib/config/hs-catalog";
import type { RankMetric } from "@/lib/trade/ranking";
import Link from "next/link";
import { DataSourceLabel } from "@/components/data-source-label";
import { EmptyState } from "@/components/empty-state";
import { EntryPaths, SectorBanner } from "@/components/entry-paths";
import { ErrorState } from "@/components/error-state";
import { OpportunityTable } from "@/components/opportunity-table";
import { SearchForm } from "@/components/search-form";
import { OutsideBanner, SourceSwitch } from "@/components/source-switch";
import { getConfig } from "@/lib/config";
import { sectorFromQuery } from "@/lib/config/sectors";
import { parseQuery } from "@/lib/schemas/query";
import { getFilters, getRanking } from "@/lib/service";
import { isQueryError, SourceError } from "@/lib/sources/types";

type SP = Record<string, string | string[] | undefined>;

function href(base: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== undefined && v !== "" && v !== 0) p.set(k, String(v));
  const s = p.toString();
  return s ? `/mercados?${s}` : "/mercados";
}

export const metadata = { title: "Análisis de mercados · SmarTrade" };

export default async function Markets({ searchParams }: { searchParams: Promise<SP> }) {
  const parsed = parseQuery(await searchParams);
  if (!parsed.success) return <ErrorState message="Algún parámetro de búsqueda no es válido." hint={parsed.error.issues.map((i) => i.path.join(".")).join(", ")} />;
  const q = parsed.data;

  let cfg;
  try { cfg = getConfig(process.env, q.fuente); } catch (e) { return <ErrorState message={e instanceof Error ? e.message : "Configuración inválida"} />; }
  if (q.fuente === "fuera" && cfg.mode !== "comtrade") {
    return <ErrorState message="Los mercados fuera de la UE no están activados en este servidor." hint="Requiere el modo Eurostat Comext y una clave de UN Comtrade configurada por el administrador." />;
  }
  const outside = cfg.mode === "comtrade";
  const fuente = outside ? ("fuera" as const) : undefined;
  const filters = getFilters(cfg);
  const base = { fuente, q: q.q, producto: q.producto, market: q.market, year: q.year, minSize: q.minSize, minGrowth: q.minGrowth, sort: q.sort === "valor" ? undefined : q.sort, order: q.order === "desc" ? undefined : q.order, pageSize: q.pageSize === 20 ? undefined : q.pageSize };

  const form = (
    <SearchForm
      defaults={{ fuente, q: q.q, market: q.market, year: q.year ?? cfg.defaultYear, minSize: q.minSize, minGrowth: q.minGrowth, sort: q.sort, order: q.order }}
      markets={filters.markets} years={filters.years} productHint={filters.productInput}
    />
  );

  // En modos de datos reales no se consulta nada hasta que el usuario elige un producto o sector (evita un error al abrir la web)
  if (cfg.mode !== "demo" && !q.q) {
    return (
      <>
        {cfg.outsideAvailable && <SourceSwitch outside={outside} />}
        {outside && <OutsideBanner markets={filters.markets.map((m) => m.name)} />}
        <EntryPaths fuente={fuente} />
        <h2 className="pt-2 text-sm font-semibold text-slate-600">Búsqueda avanzada</h2>
        {form}
      </>
    );
  }

  let data;
  try {
    data = await getRanking(q, cfg);
  } catch (e) {
    // Tres casos distintos para el usuario: consulta no válida o código no reconocido, fallo del proveedor y error interno.
    if (e instanceof SourceError && isQueryError(e.kind)) return <>{form}<ErrorState title="Revisa el producto buscado" message={e.message} /></>;
    if (e instanceof SourceError) return <>{form}<ErrorState title="La fuente de datos no respondió correctamente" message={e.message} hint="Es un problema temporal del proveedor, no de tu búsqueda: inténtalo de nuevo más tarde. No se muestran datos inventados." /></>;
    return <>{form}<ErrorState title="Error interno de SmarTrade" message="Algo ha fallado en la aplicación al preparar los datos." hint="No es un problema de tu búsqueda ni significa que no haya datos." /></>;
  }

  const sortHref = (m: RankMetric) => href(base, { sort: m === "valor" ? undefined : m, order: undefined, page: undefined });
  const detailQuery = cfg.mode === "demo" ? "" : `?q=${encodeURIComponent(q.q ?? "")}${outside ? "&fuente=fuera" : ""}`;
  const exportHref = "/api/opportunities/export?" + (href({ ...base, producto: data.product?.code }).split("?")[1] ?? "");
  const sector = sectorFromQuery(q.q);
  const p = data.product;
  const basis = outside ? ("origen" as const) : ("expedicion" as const);
  const pageLink = (n: number) => href({ ...base, producto: p?.code }, { page: n === 1 ? undefined : n });

  return (
    <>
      {cfg.outsideAvailable && <SourceSwitch outside={outside} />}
      {outside && <OutsideBanner markets={filters.markets.map((m) => m.name)} />}
      {!q.q && <EntryPaths fuente={fuente} />}
      {form}
      {sector && <SectorBanner current={sector} onlyOne fuente={fuente} />}
      {data.products.length > 1 && p && <ProductPicker products={data.products} current={p.code} hrefFor={(code) => href({ ...base, sort: base.sort }, { producto: code, page: undefined })} />}

      {!p ? (
        <EmptyState title="Sin datos para esta búsqueda" hint="La fuente no devolvió importaciones para estos productos en el periodo elegido. Ausencia de datos no implica ausencia de comercio." />
      ) : (
        <>
          <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="titulo-resultados">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                {/* Un solo h1 por página: sin búsqueda, el h1 es el de la presentación (EntryPaths) y esto es un h2. */}
                <ResultsHeading as={q.q ? "h1" : "h2"}>{productLabel(p.code, p.name).title}: mercados de destino</ResultsHeading>
                <p className="text-sm text-slate-600">{codeLabel(p.code)} · periodo {data.years[0]}–{data.endYear} · {data.total} mercados con dato para esta métrica{data.withoutMetric.length ? `, ${data.withoutMetric.length} sin dato` : ""}</p>
              </div>
              {data.total > 0 && <a href={exportHref} className="rounded border px-3 py-1 text-sm hover:bg-slate-50">Exportar CSV</a>}
            </div>
            <DataSourceLabel info={data.info} />
            <MetricSwitch current={data.sort} hrefFor={sortHref} currency={outside ? "USD" : cfg.mode === "demo" ? "EUR (sintéticos)" : "EUR"} />
            <PartnerBasisNote basis={basis} />
            {data.info.warnings.length > 0 && (
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer">Avisos de la consulta ({data.info.warnings.length})</summary>
                <ul className="mt-1 list-disc pl-5">{data.info.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </details>
            )}
          </section>

          {data.pageOutOfRange ? (
            <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" role="status">
              <p className="font-medium">La página {data.page} no existe: hay {data.total} mercados en {data.pages} página{data.pages > 1 ? "s" : ""}.</p>
              <Link className="underline" href={pageLink(data.pages)}>Ir a la última página</Link>
            </section>
          ) : data.rows.length === 0 ? (
            <EmptyState title="Ningún mercado cumple los filtros con dato para esta métrica" hint="Prueba a quitar el mercado, bajar el tamaño o el crecimiento mínimos, o elige otra métrica." />
          ) : (
            <>
              <OpportunityTable rows={data.rows} offset={data.offset} sort={data.sort} sortHref={sortHref} detailQuery={detailQuery} q={q.q} fuente={fuente} years={data.years} partnerBasis={basis} />
              {data.pages > 1 && (
                <nav className="flex items-center justify-between text-sm" aria-label="Paginación">
                  {data.page > 1 ? <Link className="underline" href={pageLink(data.page - 1)}>← Anterior</Link> : <span />}
                  <span>Página {data.page} de {data.pages}</span>
                  {data.page < data.pages ? <Link className="underline" href={pageLink(data.page + 1)}>Siguiente →</Link> : <span />}
                </nav>
              )}
            </>
          )}

          {data.withoutMetric.length > 0 && (
            <details className="rounded-lg bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-medium">Mercados sin dato para esta métrica ({data.withoutMetric.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {data.withoutMetric.map((o) => (
                  <li key={o.id}><Link className="underline" href={`/oportunidad/${o.id}${detailQuery}`}>{o.marketName}</Link>: {o.missing.join("; ") || "sin dato para esta métrica"}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  );
}

function ResultsHeading({ as: Tag, children }: { as: "h1" | "h2"; children: React.ReactNode }) {
  return <Tag id="titulo-resultados" className="text-lg font-bold">{children}</Tag>;
}
