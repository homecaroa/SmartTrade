import Link from "next/link";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import type { Opportunity } from "@/lib/trade/opportunities";
import { readMarket } from "@/lib/trade/diagnosis";
import { METRICS, type RankMetric } from "@/lib/trade/ranking";
import { MarketCautions } from "./market-cautions";

const signed = (v: number | null) => (v === null ? "n.d." : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), 1)} %`);
const tone = (v: number | null) => (v === null || Math.abs(v) < 0.05 ? "text-slate-700" : v > 0 ? "text-emerald-800" : "text-rose-800");
export const fmtTonnes = (kg: number | null) => (kg === null ? "n.d." : kg >= 1000 ? `${fmtNum(kg / 1000, 0)} t` : `${fmtNum(kg, 0)} kg`);

/**
 * Mercados de UN producto ordenados por una métrica descriptiva (desde el 06/11/2026; antes, por índices de los
 * rankings retirados). Cada columna es un dato en su unidad; «n.d.» = dato no disponible, nunca cero.
 */
export function OpportunityTable({
  rows, offset, sort, sortHref, detailQuery, q, fuente, years, partnerBasis,
}: {
  rows: Opportunity[];
  offset: number;
  sort: RankMetric;
  sortHref: (m: RankMetric) => string;
  detailQuery: string;
  q?: string;
  fuente?: string;
  years: number[];
  partnerBasis: "expedicion" | "origen";
}) {
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600";
  const head = (m: RankMetric, label: string) => (
    <th className={th} scope="col" aria-sort={sort === m ? "descending" : undefined}>
      <Link href={sortHref(m)} className={sort === m ? "text-indigo-800 underline" : "underline"}>{label}</Link>
    </th>
  );
  const cur = rows[0]?.currency ?? "";
  const end = years[years.length - 1];
  return (
    <form action="/comparar" method="get" className="space-y-2">
      {q && <input type="hidden" name="q" value={q} />}
      {fuente === "fuera" && <input type="hidden" name="fuente" value="fuera" />}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <caption className="px-3 pt-3 text-left text-xs text-slate-600">
            Mercados ordenados por <b>{METRICS[sort].label.toLowerCase()}</b> ({METRICS[sort].unit(cur)}), {years[0]}–{end}. Importes en {cur || "la moneda de la fuente"}.
          </caption>
          <thead className="border-b bg-slate-50">
            <tr>
              <th className={th} scope="col"><span className="sr-only">Comparar</span></th>
              <th className={th} scope="col">#</th>
              <th className={th} scope="col">Mercado</th>
              {head("valor", `Importaciones ${end}`)}
              <th className={th} scope="col">Variación {end - 1}–{end}</th>
              {head("crecimiento", `Crecimiento anual ${years[0]}–${end}`)}
              {head("peso", `Volumen ${end}`)}
              {head("espana", partnerBasis === "expedicion" ? "Expedido desde España" : "Con origen España")}
              <th className={th} scope="col">Participación de España</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((o, i) => {
              const cautions = readMarket(o).cautions;
              return (
                <tr key={o.id} className="align-top hover:bg-slate-50">
                  <td className="px-3 py-2"><input type="checkbox" name="id" value={o.id} aria-label={`Comparar ${o.marketName}`} /></td>
                  <td className="px-3 py-2 tabular-nums">{offset + i + 1}</td>
                  <td className="px-3 py-2">
                    <Link className="font-medium text-indigo-800 underline" href={`/oportunidad/${o.id}${detailQuery}`}>{o.marketName}</Link>
                    <div className="mt-1"><MarketCautions cautions={cautions} compact /></div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtMoney(o.marketSize, o.currency)}</td>
                  <td className={`px-3 py-2 tabular-nums ${tone(o.yoyChange)}`}>{signed(o.yoyChange)}</td>
                  <td className={`px-3 py-2 tabular-nums ${tone(o.complete ? o.cagr : null)}`}>{o.complete ? signed(o.cagr) : "n.d."}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtTonnes(o.netWeightEndYear)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtMoney(o.spainValue, o.currency)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtPct(o.spanishShare)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button className="rounded bg-indigo-700 px-3 py-1.5 font-semibold text-white hover:bg-indigo-800">Comparar seleccionados</button>
        <span className="text-xs text-slate-600">Marca de 2 a 5 mercados de esta página.</span>
      </div>
    </form>
  );
}
