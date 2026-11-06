import type { ContextLookup } from "@/lib/service";
import { EUROSTAT_SOURCE, OECD_SOURCE, type ContextValue } from "@/lib/sources/country-context";

const num = (v: number, d = 1) => v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v))} %`;
const people = (v: number) => (v >= 1e6 ? `${num(v / 1e6)} millones` : v.toLocaleString("es-ES"));
const tag = (v: ContextValue) => `${v.year}${v.provisional ? ", provisional" : ""}`;

/**
 * Contexto económico del país de destino (Eurostat en la UE, OCDE fuera). Informativo.
 * Las unidades del PIB por habitante difieren entre fuentes y no se convierten.
 */
export function CountryContextCard({ data, marketName }: { data: ContextLookup; marketName: string }) {
  const c = data.context;
  return (
    <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="contexto-pais">
      <h2 id="contexto-pais" className="font-semibold">Contexto económico de {marketName}</h2>
      {data.error ? (
        <p className="text-sm text-slate-600">No se pudo consultar ahora ({data.error}). Recarga la página dentro de un momento para reintentarlo.</p>
      ) : !c ? (
        <p className="text-sm text-slate-600">Sin datos de contexto para este país: SmarTrade usa Eurostat (UE) y la OCDE (sus miembros), y este mercado no está en ninguna de las dos.</p>
      ) : (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Crecimiento del PIB real</dt><dd className="text-lg font-bold">{c.growth ? pct(c.growth.value) : "n.d."}</dd>{c.growth && <dd className="text-xs text-slate-400">{tag(c.growth)}</dd>}</div>
            <div><dt className="text-slate-500">PIB por habitante</dt><dd className="text-lg font-bold">{c.gdpPerCapita ? `${num(c.gdpPerCapita.value, 0)} ${c.gdpPerCapita.unit === "EUR" ? "€" : "USD PPA"}` : "n.d."}</dd>{c.gdpPerCapita && <dd className="text-xs text-slate-400">{tag(c.gdpPerCapita)}{c.gdpPerCapita.unit === "USD_PPA" ? " · dólares a paridad de poder adquisitivo constante" : " · euros corrientes"}</dd>}</div>
            <div><dt className="text-slate-500">Población</dt><dd className="text-lg font-bold">{c.population ? people(c.population.value) : "n.d."}</dd>{c.population && <dd className="text-xs text-slate-400">{tag(c.population)}</dd>}</div>
          </dl>
          {c.growthForecasts.length > 0 && (
            <p className="text-sm">Previsión de crecimiento de la OCDE: {c.growthForecasts.map((f) => `${f.year}: ${pct(f.value)}`).join(" · ")}. <span className="text-xs text-slate-500">Son previsiones, no datos observados.</span></p>
          )}
          <p className="text-xs text-slate-500">Fuente: {c.source === "eurostat" ? EUROSTAT_SOURCE : OECD_SOURCE}. Las cifras de Eurostat y de la OCDE usan unidades distintas: no las compares entre países de la UE y de fuera. Contexto informativo.</p>
        </>
      )}
    </section>
  );
}
