import Link from "next/link";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { Opportunity } from "@/lib/trade/opportunities";
import { productLabel } from "@/lib/config/hs-catalog";
import { describeOpportunity, shortTags } from "@/lib/scoring/labels";
import { ScoreBadge } from "./opportunity-score";
import { OpportunityTags } from "./opportunity-tags";

const Q: Record<Opportunity["quality"], string> = {
  alta: "bg-emerald-100 text-emerald-800",
  media: "bg-amber-100 text-amber-800",
  baja: "bg-red-100 text-red-800",
};

export function OpportunityTable({
  rows, offset, sortHref, detailQuery, q, fuente,
}: {
  rows: Opportunity[];
  offset: number;
  sortHref: (sort: "score" | "size" | "growth") => string;
  detailQuery: string;
  q?: string;
  fuente?: string;
}) {
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500";
  return (
    <form action="/comparar" method="get" className="space-y-2">
      {q && <input type="hidden" name="q" value={q} />}
      {fuente === "fuera" && <input type="hidden" name="fuente" value="fuera" />}
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className={th}><span className="sr-only">Comparar</span></th><th className={th}>#</th><th className={th}>Producto</th><th className={th}>Mercado</th>
            <th className={th}><Link href={sortHref("size")} className="underline">Importaciones</Link></th>
            <th className={th}><Link href={sortHref("growth")} className="underline">Crecimiento (CAGR)</Link></th>
            <th className={th}>Cuota española</th>
            <th className={th}><Link href={sortHref("score")} className="underline">Puntuación</Link></th>
            <th className={th}>Calidad</th><th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((o, i) => {
            const d = describeOpportunity(o);
            const pl = productLabel(o.productCode, o.productName);
            return (
            <tr key={o.id} className="hover:bg-slate-50">
              <td className="px-3 py-2">{o.complete && <input type="checkbox" name="id" value={o.id} aria-label={`Comparar ${pl.title} en ${o.marketName}`} />}</td>
              <td className="px-3 py-2">{offset + i + 1}</td>
              <td className="px-3 py-2"><div className="max-w-xs truncate font-medium" title={pl.sourceDescription ?? pl.title}>{pl.title}</div><div className="text-xs text-slate-500">HS {o.productCode} · {o.classification}</div></td>
              <td className="px-3 py-2"><div className="font-medium">{o.marketName}</div><div className="mt-1"><OpportunityTags tags={shortTags(d.tags)} /></div><div className="mt-1 max-w-xs text-xs text-slate-500">{d.why}</div></td>
              <td className="px-3 py-2">{fmtMoney(o.marketSize, o.currency)}<div className="text-xs text-slate-400">{o.endYear}</div></td>
              <td className="px-3 py-2">{fmtPct(o.cagr)}</td>
              <td className="px-3 py-2">{fmtPct(o.spanishShare)}</td>
              <td className="px-3 py-2">{o.score && <ScoreBadge score={o.score} />}</td>
              <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${Q[o.quality]}`}>{o.quality}</span></td>
              <td className="px-3 py-2"><Link className="text-indigo-700 underline" href={`/oportunidad/${o.id}${detailQuery}`}>Detalle</Link></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button className="rounded bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">Comparar seleccionados</button>
        <span className="text-xs text-slate-500">Marca de 2 a 5 resultados de esta página.</span>
      </div>
    </form>
  );
}
