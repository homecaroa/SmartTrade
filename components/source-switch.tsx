import Link from "next/link";

/** Selector de fuente: mercados de la UE (Eurostat, EUR) o fuera de la UE (UN Comtrade, USD). Rankings siempre separados. */
export function SourceSwitch({ outside }: { outside: boolean }) {
  const tab = (active: boolean) => `rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"}`;
  return (
    <nav aria-label="Fuente de datos" className="flex flex-wrap gap-2">
      <Link href="/" className={tab(!outside)}>Mercados de la UE · Eurostat (EUR)</Link>
      <Link href="/?fuente=fuera" className={tab(outside)}>Fuera de la UE · UN Comtrade (USD)</Link>
    </nav>
  );
}

export function OutsideBanner({ markets }: { markets: string[] }) {
  return (
    <section className="space-y-1 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
      <p><b>Mercados fuera de la UE (UN Comtrade).</b> Valores en dólares (USD), distintos del ranking de la UE (Eurostat, euros): no se mezclan y sus puntuaciones no son comparables entre sí.</p>
      <p className="text-xs text-slate-700">Mercados disponibles: {markets.join(", ")}. Cada país publica con distinto retraso: si falta el año final de un país, aparece como incompleto. Aranceles, reglas de origen y requisitos de importación son especialmente relevantes fuera de la UE y siguen pendientes de consulta en la ficha.</p>
    </section>
  );
}
