import Link from "next/link";
import { notFound } from "next/navigation";
import { DataSourceLabel } from "@/components/data-source-label";
import { CompetitorsTable } from "@/components/competitors-table";
import { CountryContextCard } from "@/components/country-context";
import { ErrorState } from "@/components/error-state";
import { MarketAccess } from "@/components/market-access";
import { MarketCautions } from "@/components/market-cautions";
import { MarketChart } from "@/components/market-chart";
import { fmtTonnes } from "@/components/opportunity-table";
import { PartnerBasisNote } from "@/components/partner-basis-note";
import { PrintButton } from "@/components/print-button";
import { ResearchChecklist } from "@/components/research-checklist";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { MARKETS } from "@/lib/config/catalog";
import { codeLabel, nc8Entry, productLabel } from "@/lib/config/hs-catalog";
import { buildMarketAccess } from "@/lib/market-access";
import { getConfig } from "@/lib/config";
import { idSchema } from "@/lib/schemas/query";
import { getOpportunityDetail, spanishOriginWarning } from "@/lib/service";
import { SourceError } from "@/lib/sources/types";
import { readMarket } from "@/lib/trade/diagnosis";
import { METRICS } from "@/lib/trade/ranking";

const signed = (v: number | null, unit = "%") => (v === null ? "n.d." : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), 1)} ${unit}`);

/**
 * Ficha de diagnóstico descriptivo de un producto en un mercado (desde el 06/11/2026; antes mostraba los índices de
 * los rankings retirados). Bloques: lectura, tamaño, evolución, presencia española, proveedores, comparación con los
 * demás mercados del MISMO producto, contexto, acceso al mercado y comprobaciones pendientes. Las cifras dependen solo
 * del producto, el mercado y el periodo: no de la búsqueda de la que se venga.
 */
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
  const years = o.importsSeries.map((p) => p.year);
  const series = o.importsSeries.map((p, i) => ({ label: String(p.year), value: p.value, value2: o.spainSeries[i].value }));
  const access = buildMarketAccess({ marketCode: o.marketCode, marketName: o.marketName, productCode: o.productCode, synthetic: d.info.synthetic, tariff: d.tariff });
  const reading = readMarket(o);
  const pl = productLabel(o.productCode, o.productName);
  const card = "rounded-lg bg-white p-4 shadow-sm space-y-3";
  const back = fuente === "fuera" ? `/?${q ? `q=${encodeURIComponent(q.slice(0, 80))}&` : ""}fuente=fuera` : q ? `/?q=${encodeURIComponent(q.slice(0, 80))}` : "/";
  const pos = (m: keyof typeof d.positions) => (d.positions[m] ? `${d.positions[m]!.position}.º de ${d.positions[m]!.of}` : "sin dato");
  const links = [
    ["ICEX · estadísticas", "https://www.icex.es/es/estadisticas"],
    ["Access2Markets (aranceles y requisitos)", "https://trade.ec.europa.eu/access-to-markets/es/home"],
    ["Eurostat Comext", "https://ec.europa.eu/eurostat/web/international-trade-in-goods/database"],
    ["UN Comtrade", "https://comtradeplus.un.org/"],
  ];

  return (
    <>
      <div className="flex items-center justify-between print:hidden">
        <Link href={back} className="text-sm underline">← Volver a los mercados</Link>
        <PrintButton />
      </div>
      <div className="hidden print:block text-xs text-slate-600">
        SmarTrade · Diagnóstico de mercado · Generado el {new Date().toLocaleDateString("es-ES")} ·{" "}
        {d.info.synthetic ? "DATOS DE DEMOSTRACIÓN SINTÉTICOS: no usar para decisiones comerciales" : `Fuente: ${o.source}`}. Descripción estadística, no recomendación.
      </div>

      <section className={card} aria-labelledby="titulo-ficha">
        <h1 id="titulo-ficha" className="text-xl font-bold">{pl.title} → {o.marketName}</h1>
        {pl.sourceDescription && <p className="text-xs text-slate-500">Descripción de la fuente: {pl.sourceDescription}</p>}
        <p className="text-sm text-slate-600">{codeLabel(o.productCode)} · Clasificación {o.classification} · Periodo {years[0]}–{o.endYear} · Calidad de los datos: <b>{o.quality}</b></p>
        {nc8Entry(o.productCode)?.spanishOrigin && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{spanishOriginWarning([pl.title])}</p>}
        <DataSourceLabel info={d.info} />
      </section>

      <section className={card} aria-labelledby="lectura">
        <h2 id="lectura" className="text-lg font-semibold">Lectura del mercado</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">{reading.sentences.map((s) => <li key={s}>{s}</li>)}</ul>
        <MarketCautions cautions={reading.cautions} />
        <p className="text-xs text-slate-500">Texto generado con reglas fijas a partir de los datos de esta ficha. Describe lo que muestran las estadísticas; no es una recomendación ni una previsión.</p>
      </section>

      <section className={card} aria-labelledby="tamano">
        <h2 id="tamano" className="text-lg font-semibold">Tamaño del mercado</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-600">Importaciones {o.endYear}</dt><dd className="text-lg font-bold">{fmtMoney(o.marketSize, o.currency)}</dd><dd className="text-xs text-slate-600">{pos("valor")} mercados por valor</dd></div>
          <div><dt className="text-slate-600">Variación {o.endYear - 1}–{o.endYear}</dt><dd className="text-lg font-bold">{signed(o.yoyChange)}</dd></div>
          <div><dt className="text-slate-600">Volumen {o.endYear} (peso neto)</dt><dd className="text-lg font-bold">{fmtTonnes(o.netWeightEndYear)}</dd><dd className="text-xs text-slate-600">{o.netWeightEndYear === null ? "La fuente no publica peso" : `${pos("peso")} por volumen${o.weightEstimated ? " · peso estimado por la fuente" : ""}`}</dd></div>
          <div><dt className="text-slate-600">Valor unitario estadístico</dt><dd className="text-lg font-bold">{d.unitValue === null ? "n.d." : `${fmtNum(d.unitValue, 2)} ${cur}/kg`}</dd><dd className="text-xs text-slate-600">Valor / peso. No es un precio de venta.</dd></div>
        </dl>
        <p className="text-xs text-slate-500">Los puestos se cuentan entre los mercados con dato de este mismo producto y periodo ({METRICS.valor.label.toLowerCase()}: {d.positions.valor?.of ?? 0} mercados).</p>
      </section>

      <section className={card} aria-labelledby="evolucion">
        <h2 id="evolucion" className="text-lg font-semibold">Evolución {years[0]}–{o.endYear}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-600">Crecimiento anual compuesto en valor</dt><dd className="text-lg font-bold">{o.complete ? signed(o.cagr) : "n.d."}</dd><dd className="text-xs text-slate-600">{o.complete ? "((final / inicial)^(1/2) − 1) × 100. Evolución pasada, no previsión." : "Serie incompleta o no comparable: " + o.missing.join("; ")}</dd></div>
          <div><dt className="text-slate-600">Crecimiento anual compuesto en volumen</dt><dd className="text-lg font-bold">{signed(o.cagrVolume)}</dd><dd className="text-xs text-slate-600">Con el peso neto. Si difiere mucho del valor, influyen los precios o la composición del producto.</dd></div>
        </dl>
        <MarketChart type="line" data={series} unit={cur} label2={o.partnerBasis === "expedicion" ? "Expedido desde España" : "Origen España"} description={`Evolución de las importaciones de ${o.marketName}, ${years[0]}–${o.endYear}`} />
        <div className="overflow-x-auto">
          <table className="min-w-[32rem] text-sm">
            <caption className="text-left text-xs text-slate-600">Datos del gráfico. Importes en {cur}; «n.d.» = no disponible.</caption>
            <thead><tr className="border-b text-left text-xs text-slate-600"><th scope="col" className="pr-6">Año</th><th scope="col" className="pr-6">Importaciones</th><th scope="col" className="pr-6">Variación anual</th><th scope="col" className="pr-6">Peso neto</th><th scope="col">{o.partnerBasis === "expedicion" ? "Expedido desde España" : "Origen España"}</th></tr></thead>
            <tbody>{o.importsSeries.map((p, i) => (
              <tr key={p.year} className="border-b border-slate-100">
                <th scope="row" className="pr-6 text-left font-normal">{p.year}</th>
                <td className="pr-6 tabular-nums">{fmtMoney(p.value, o.currency)}</td>
                <td className="pr-6 tabular-nums">{i === 0 ? "—" : signed(o.annualChanges[i - 1])}</td>
                <td className="pr-6 tabular-nums">{fmtTonnes(o.weightSeries[i].value)}</td>
                <td className="tabular-nums">{fmtMoney(o.spainSeries[i].value, o.currency)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className={card} aria-labelledby="espana">
        <h2 id="espana" className="text-lg font-semibold">Presencia española</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-600">{o.partnerBasis === "expedicion" ? "Expedido desde España" : "Con origen España"} {o.endYear}</dt><dd className="text-lg font-bold">{fmtMoney(o.spainValue, o.currency)}</dd></div>
          <div><dt className="text-slate-600">Participación en las importaciones</dt><dd className="text-lg font-bold">{fmtPct(o.spanishShare)}</dd><dd className="text-xs text-slate-600">{pos("espana")} mercados por valor con socio España</dd></div>
          <div><dt className="text-slate-600">Variación de la participación {years[0]}–{o.endYear}</dt><dd className="text-lg font-bold">{signed(o.spanishShareChangePp, "puntos")}</dd></div>
          <div><dt className="text-slate-600">Exportaciones españolas del producto al mundo</dt><dd className="text-lg font-bold">{fmtMoney(o.spainExportsWorld, o.currency)}</dd><dd className="text-xs text-slate-600">Lo que declara España ({o.endYear}); otra declaración, no comparable con la del mercado.</dd></div>
        </dl>
        <PartnerBasisNote basis={o.partnerBasis} />
      </section>

      <section className={card} aria-labelledby="proveedores">
        <h2 id="proveedores" className="text-lg font-semibold">Países proveedores ({o.endYear})</h2>
        {d.supplierWarning && <p className="text-sm text-amber-800">{d.supplierWarning}</p>}
        {!d.competitors ? <p className="text-sm text-slate-600">Sin datos bilaterales compatibles para este mercado.</p> : (
          <CompetitorsTable a={d.competitors} currency={o.currency} euMarket={MARKETS.find((m) => m.code === o.marketCode)?.eu === true} />
        )}
        <p className="text-xs text-slate-500">Son países, no empresas: la estadística no identifica fabricantes ni compradores.</p>
      </section>

      <section className={card} aria-labelledby="otros-mercados">
        <h2 id="otros-mercados" className="text-lg font-semibold">El mismo producto en otros mercados ({o.endYear})</h2>
        <MarketChart type="bar" data={d.sameProduct.map((s) => ({ label: s.marketName, value: s.marketSize }))} unit={cur} description={`Importaciones de ${pl.title} por mercado en ${o.endYear}`} />
        <div className="overflow-x-auto">
          <table className="text-sm">
            <caption className="text-left text-xs text-slate-600">Los {d.sameProduct.length} mayores mercados con dato, por valor importado en {o.endYear} ({cur}).</caption>
            <thead><tr className="border-b text-left text-xs text-slate-600"><th scope="col" className="pr-6">Mercado</th><th scope="col" className="pr-6">Importaciones</th><th scope="col">Participación de España</th></tr></thead>
            <tbody>{d.sameProduct.map((s) => (
              <tr key={s.id} className={`border-b border-slate-100 ${s.id === o.id ? "font-semibold" : ""}`}>
                <th scope="row" className="pr-6 text-left font-normal">{s.marketName}</th>
                <td className="pr-6 tabular-nums">{fmtMoney(s.marketSize, s.currency)}</td>
                <td className="tabular-nums">{fmtPct(s.spanishShare)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {d.context && <CountryContextCard data={d.context} marketName={o.marketName} />}

      <MarketAccess info={access} />

      <ResearchChecklist />

      <section className={card} aria-labelledby="limitaciones">
        <h2 id="limitaciones" className="text-lg font-semibold">Fuentes y limitaciones</h2>
        <ul className="list-disc pl-5 text-sm text-slate-700">
          <li>Son estadísticas de comercio declarado: no miden rentabilidad, precios de venta, competitividad de una empresa ni demanda futura.</li>
          <li>{o.partnerBasis === "expedicion" ? "En los mercados de la UE el país socio es el de expedición, no necesariamente el de origen." : "El país socio es el de origen según la fuente."} Lo que declara el importador y lo que declara el exportador no siempre coincide.</li>
          <li>Aranceles, requisitos y costes logísticos no están verificados. Fuera de la UE solo se muestran los aranceles medios a 6 dígitos de la OMC.</li>
        </ul>
        <ul className="flex flex-wrap gap-4 text-sm">{links.map(([t, u]) => <li key={u}><a className="underline" href={u} target="_blank" rel="noopener noreferrer">{t}</a></li>)}</ul>
        <p className="text-xs text-slate-500"><Link className="underline" href="/metodologia">Metodología y fuentes</Link></p>
      </section>
    </>
  );
}
