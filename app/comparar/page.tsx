import Link from "next/link";
import { DataSourceLabel } from "@/components/data-source-label";
import { ErrorState } from "@/components/error-state";
import { PrintButton } from "@/components/print-button";
import { buildComparison, parseCompareIds } from "@/lib/compare";
import { getConfig } from "@/lib/config";
import { getComparison } from "@/lib/service";
import { SourceError } from "@/lib/sources/types";

export const metadata = { title: "Comparar mercados · SmarTrade" };

export default async function Compare({ searchParams }: { searchParams: Promise<{ id?: string | string[]; q?: string; fuente?: string }> }) {
  const sp = await searchParams;
  const parsed = parseCompareIds(sp.id);
  const q = sp.q?.slice(0, 80);
  const fx = sp.fuente === "fuera" ? "fuente=fuera" : "";
  const back = q ? `/?q=${encodeURIComponent(q)}${fx ? `&${fx}` : ""}` : fx ? `/?${fx}` : "/";
  if (!parsed.ok) {
    return (
      <div className="space-y-3">
        <ErrorState message={parsed.error} />
        <Link href={back} className="text-sm underline">← Volver al ranking</Link>
      </div>
    );
  }

  let data;
  try {
    data = await getComparison(parsed.ids, q, getConfig(process.env, sp.fuente));
  } catch (e) {
    return <ErrorState message={e instanceof SourceError ? e.message : "Error inesperado."} />;
  }
  if (data.items.length < 2) {
    return (
      <div className="space-y-3">
        <ErrorState message="No se han encontrado al menos 2 de los resultados seleccionados con los datos actuales. Vuelve al ranking y selecciónalos de nuevo." />
        <Link href={back} className="text-sm underline">← Volver al ranking</Link>
      </div>
    );
  }

  const rows = buildComparison(data.items);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={back} className="text-sm underline">← Volver al ranking</Link>
        <PrintButton />
      </div>
      <div className="hidden print:block text-xs text-slate-600">
        SmarTrade · Comparación de mercados · Generada el {new Date().toLocaleDateString("es-ES")} ·{" "}
        {data.info.synthetic ? "DATOS DE DEMOSTRACIÓN SINTÉTICOS: no usar para decisiones comerciales" : "Fuente: Eurostat Comext u otra fuente oficial indicada abajo"}. Indicador estadístico, no garantía de rentabilidad.
      </div>
      <h1 className="text-xl font-bold">Comparación de mercados</h1>
      <DataSourceLabel info={data.info} />
      {data.missing.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">No se han podido cargar: {data.missing.join(", ")}.</p>
      )}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Indicador</th>
              {data.items.map(({ opp }) => (
                <th key={opp.id} className="px-3 py-2 text-left text-xs font-semibold text-slate-700">
                  <Link className="underline" href={`/oportunidad/${opp.id}?${[q ? `q=${encodeURIComponent(q)}` : "", fx].filter(Boolean).join("&")}`}>{opp.marketName} · HS {opp.productCode}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="px-3 py-2 text-left text-xs font-medium text-slate-600">{r.label}</th>
                {r.cells.map((c, i) => <td key={i} className="px-3 py-2 align-top">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>Los percentiles se calculan sobre {data.universeSize} oportunidades completas de esta búsqueda: no son comparables con los de otra búsqueda.</li>
        <li>La puntuación es una prioridad estadística para investigar, no una previsión de rentabilidad ni de éxito.</li>
        <li>«n.d.» significa dato no disponible, no cero. Comparar productos distintos exige cautela: sus mercados y unidades pueden no ser equivalentes.</li>
        <li>Aranceles, requisitos, impuestos y costes logísticos no están verificados: abre la ficha de cada mercado para ver qué falta comprobar.</li>
      </ul>
    </div>
  );
}
