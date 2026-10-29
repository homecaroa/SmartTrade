import Link from "next/link";
import { notFound } from "next/navigation";
import { DataSourceLabel } from "@/components/data-source-label";
import { ErrorState } from "@/components/error-state";
import { MarketAccess } from "@/components/market-access";
import { OpportunityTags } from "@/components/opportunity-tags";
import { describeOpportunity } from "@/lib/scoring/labels";
import { MarketChart } from "@/components/market-chart";
import { PrintButton } from "@/components/print-button";
import { ResearchChecklist } from "@/components/research-checklist";
import { ScoreBreakdown } from "@/components/opportunity-score";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { productLabel } from "@/lib/config/hs-catalog";
import { buildMarketAccess } from "@/lib/market-access";
import { getConfig } from "@/lib/config";
import { idSchema } from "@/lib/schemas/query";
import { getOpportunityDetail } from "@/lib/service";
import { SourceError } from "@/lib/sources/types";

export default async function Detail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; fuente?: string }> }) {
  const { id } = await params;
  const { q, fuente } = await searchParams;
  if (!idSchema.safeParse(id).success) notFound();

  let d;
  try {
    d = await getOpportunityDetail(id, q?.slice(0, 80), getConfig(process.env, fuente));
  } catch (e) {
    return <ErrorState message={e instanceof SourceError ? e.message : "Error inesperado."} />;
  }
  if (!d) notFound();
  const o = d.opportunity;
  const cur = o.currency ?? "";
  const series = o.importsSeries.map((p, i) => ({ label: String(p.year), value: p.value, value2: o.spainSeries[i].value }));
  const links = [
    ["ICEX · estadísticas", "https://www.icex.es/es/estadisticas"],
    ["Access2Markets (aranceles y requisitos)", "https://trade.ec.europa.eu/access-to-markets/es/home"],
    ["Eurostat Comext", "https://ec.europa.eu/eurostat/fr/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database"],
    ["UN Comtrade", "https://uncomtrade.org/docs/un-comtrade-api/"],
  ];
  const access = buildMarketAccess({ marketCode: o.marketCode, marketName: o.marketName, productCode: o.productCode, synthetic: d.info.synthetic });
  const desc = describeOpportunity(o);
  const pl = productLabel(o.productCode, o.productName);
  const card = "rounded-lg bg-white p-4 shadow-sm space-y-2";

  return (
    <>
      <div className="flex items-center justify-between print:hidden">
        <Link href={fuente === "fuera" ? `/?${q ? `q=${encodeURIComponent(q.slice(0, 80))}&` : ""}fuente=fuera` : q ? `/?q=${encodeURIComponent(q.slice(0, 80))}` : "/"} className="text-sm underline">← Volver al ranking</Link>
        <PrintButton />
      </div>
      <div className="hidden print:block text-xs text-slate-600">
        SmarTrade · Ficha de investigación exportadora · Generada el {new Date().toLocaleDateString("es-ES")} ·{" "}
        {d.info.synthetic ? "DATOS DE DEMOSTRACIÓN SINTÉTICOS: no usar para decisiones comerciales" : `Fuente: ${o.source}`}. Indicador estadístico, no garantía de rentabilidad.
      </div>
      <section className={card}>
        <h1 className="text-xl font-bold">{pl.title} → {o.marketName}</h1>
        {pl.sourceDescription && <p className="text-xs text-slate-500">Descripción de la fuente: {pl.sourceDescription}</p>}
        <p className="text-sm text-slate-600">HS {o.productCode} · Clasificación {o.classification} · Ventana {o.importsSeries[0].year}–{o.endYear} · {d.rank ? `Posición ${d.rank} en el ranking por puntuación` : "Fuera del ranking (datos incompletos)"} · Calidad de datos: <b>{o.quality}</b></p>
        <DataSourceLabel info={d.info} />
        {!o.complete && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <b>Oportunidad incompleta, sin puntuación.</b>
            <ul className="list-disc pl-5">{o.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mt-1 text-xs">Ausencia de datos no significa ausencia de comercio.</p>
          </div>
        )}
      </section>

      {desc.tags.length > 0 && (
        <section className={card}>
          <h2 className="font-semibold">En pocas palabras</h2>
          <OpportunityTags tags={desc.tags} />
          <p className="text-sm text-slate-700">{desc.why}</p>
          <p className="text-xs text-slate-500">Resumen automático de los indicadores de abajo, con reglas fijas (pasa el ratón sobre una etiqueta para ver la regla). Las etiquetas «de esta búsqueda» comparan con los demás resultados cargados, no con el mercado mundial. No es una recomendación.</p>
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold">Indicadores</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-500">Importaciones {o.endYear}</dt><dd className="text-lg font-bold">{fmtMoney(o.marketSize, o.currency)}</dd></div>
          <div><dt className="text-slate-500">Crecimiento CAGR (2 intervalos)</dt><dd className="text-lg font-bold">{fmtPct(o.cagr)}</dd></div>
          <div><dt className="text-slate-500">Crecimiento en volumen (peso neto)</dt><dd className="text-lg font-bold">{fmtPct(o.cagrVolume)}</dd><dd className="text-xs text-slate-500">Aproxima el volumen: si el valor crece mucho más, puede haber efecto precio.</dd></div>
          <div><dt className="text-slate-500">Cuota española</dt><dd className="text-lg font-bold">{fmtPct(o.spanishShare)}</dd></div>
          <div><dt className="text-slate-500">Exportaciones españolas al mundo</dt><dd className="text-lg font-bold">{fmtMoney(o.spainExportsWorld, o.currency)}</dd></div>
          <div><dt className="text-slate-500">Concentración top-3 proveedores</dt><dd className="text-lg font-bold">{fmtPct(d.top3Concentration)}</dd></div>
          <div><dt className="text-slate-500">Valor unitario estadístico</dt><dd className="text-lg font-bold">{d.unitValue === null ? "n.d." : `${fmtNum(d.unitValue, 2)} ${cur}/kg`}</dd><dd className="text-xs text-slate-400">No es un precio de venta.</dd>{o.weightEstimated && <dd className="text-xs text-amber-700">Peso neto estimado por la fuente (no observado): orientativo, igual que el crecimiento en volumen.</dd>}</div>
        </dl>
        <p className="text-xs text-slate-500">Variaciones anuales: {o.annualChanges.map((c, i) => `${o.importsSeries[i + 1].year}: ${fmtPct(c)}`).join(" · ")}</p>
      </section>

      {o.score && <section className={card}><h2 className="font-semibold">Desglose de la puntuación</h2><ScoreBreakdown score={o.score} /></section>}

      <section className={card}>
        <h2 className="font-semibold">Evolución de las importaciones ({cur})</h2>
        <MarketChart type="line" data={series} unit={cur} label2="Procedentes de España" />
        <table className="text-sm"><thead><tr><th className="pr-6 text-left">Año</th><th className="pr-6 text-left">Importaciones</th><th className="text-left">Desde España</th></tr></thead>
          <tbody>{o.importsSeries.map((p, i) => <tr key={p.year}><td>{p.year}</td><td>{fmtMoney(p.value, o.currency)}</td><td>{fmtMoney(o.spainSeries[i].value, o.currency)}</td></tr>)}</tbody></table>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Comparación entre mercados (mismo producto, {o.endYear})</h2>
        <MarketChart type="bar" data={d.sameProduct.map((s) => ({ label: s.marketCode, value: s.marketSize }))} unit={cur} />
      </section>

      <section className={card}>
        <h2 className="font-semibold">Principales países proveedores ({o.endYear})</h2>
        {d.supplierWarning && <p className="text-sm text-amber-700">{d.supplierWarning}</p>}
        {d.suppliers.length === 0 ? <p className="text-sm text-slate-500">Sin datos bilaterales compatibles.</p> : (
          <ul className="text-sm">{d.suppliers.map((s) => <li key={s.code}>{s.name}: {fmtMoney(s.value, o.currency)} ({fmtPct(s.sharePct)})</li>)}</ul>
        )}
      </section>

      <MarketAccess info={access} />

      <ResearchChecklist buyersHref={`/compradores?hs=${o.productCode}&pais=${o.marketCode}`} />

      <section className={card}>
        <h2 className="font-semibold">Limitaciones y próximas comprobaciones</h2>
        <ul className="list-disc pl-5 text-sm text-slate-700">
          <li>Las estadísticas muestran comercio declarado, no rentabilidad ni capacidad productiva o competitividad de una empresa concreta.</li>
          <li>Esta aplicación no ha validado aranceles, requisitos de importación ni costes logísticos: solo enlaza a fuentes externas.</li>
          <li>Pendiente de investigar: requisitos de importación, aranceles aplicables, presupuestos de transporte, distribuidores y compradores, competidores y precios comerciales.</li>
        </ul>
        <ul className="flex flex-wrap gap-4 text-sm">{links.map(([t, u]) => <li key={u}><a className="underline" href={u} target="_blank" rel="noopener noreferrer">{t}</a></li>)}</ul>
      </section>
    </>
  );
}
