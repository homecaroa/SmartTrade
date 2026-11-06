import type { Opportunity } from "./opportunities";

/**
 * Clasificaciones DESCRIPTIVAS (desde el 06/11/2026). Sustituyen a los rankings por percentiles. Reglas:
 * - Siempre dentro de UN producto y con UNA métrica: nunca se ordenan productos distintos entre sí.
 * - Cada métrica en su unidad (valor en la moneda de la fuente, crecimiento en %, peso en kg). Sin percentiles.
 * - Solo entran los mercados con esa métrica disponible; el crecimiento exige la serie completa de 3 años.
 * - El crecimiento es histórico: no es una previsión.
 */
export type RankMetric = "valor" | "crecimiento" | "peso" | "espana";

export const METRICS: Record<RankMetric, { label: string; unit: (cur: string) => string; explain: string }> = {
  valor: { label: "Valor de las importaciones", unit: (c) => c || "moneda de la fuente", explain: "Importaciones del producto por el mercado en el último año de la ventana, desde todos los países." },
  crecimiento: { label: "Crecimiento anual compuesto", unit: () => "% anual", explain: "CAGR de las importaciones en valor entre el primer y el último año de la ventana: ((final / inicial)^(1/2) − 1) × 100. Es crecimiento pasado, no una previsión. Solo mercados con los 3 años y valores positivos." },
  peso: { label: "Volumen importado (peso neto)", unit: () => "kg", explain: "Peso neto importado en el último año. Aproxima el volumen; no todos los países lo publican y a veces es una estimación de la fuente." },
  espana: { label: "Importaciones con socio España", unit: (c) => c || "moneda de la fuente", explain: "Valor que el mercado declara con socio España en el último año. En los mercados de la UE es lo EXPEDIDO desde España, no necesariamente de origen español." },
};

export interface RankFilters {
  market?: string;
  minSizeM?: number; // millones de la moneda de la fuente
  minGrowth?: number; // %
  sort: RankMetric;
  order: "asc" | "desc";
}

export const metricValue = (o: Opportunity, m: RankMetric): number | null =>
  m === "valor" ? o.marketSize : m === "crecimiento" ? (o.complete ? o.cagr : null) : m === "peso" ? o.netWeightEndYear : o.spainValue;

/** Mercados de UN producto ordenados por una métrica. Desempate por código de mercado: reproducible. */
export function rankMarkets(all: Opportunity[], productCode: string, f: RankFilters): { rows: Opportunity[]; withoutMetric: Opportunity[] } {
  const ofProduct = all.filter((o) => o.productCode === productCode);
  const passes = (o: Opportunity) => {
    if (f.market && o.marketCode !== f.market) return false;
    if (f.minSizeM && (o.marketSize ?? 0) < f.minSizeM * 1e6) return false;
    if (f.minGrowth !== undefined && (o.cagr ?? -Infinity) < f.minGrowth) return false;
    return true;
  };
  const filtered = ofProduct.filter(passes);
  const rows = filtered.filter((o) => metricValue(o, f.sort) !== null);
  const dir = f.order === "asc" ? 1 : -1;
  rows.sort((a, b) => dir * (metricValue(a, f.sort)! - metricValue(b, f.sort)!) || a.marketCode.localeCompare(b.marketCode));
  return { rows, withoutMetric: filtered.filter((o) => metricValue(o, f.sort) === null) };
}

export interface Position { position: number; of: number }

/** Puesto de una oportunidad entre los mercados de SU producto, por cada métrica (sin filtros). Estable por definición. */
export function positionsFor(all: Opportunity[], id: string): Record<RankMetric, Position | null> {
  const o = all.find((x) => x.id === id);
  const out = { valor: null, crecimiento: null, peso: null, espana: null } as Record<RankMetric, Position | null>;
  if (!o) return out;
  for (const m of Object.keys(METRICS) as RankMetric[]) {
    const { rows } = rankMarkets(all, o.productCode, { sort: m, order: "desc" });
    const i = rows.findIndex((r) => r.id === id);
    out[m] = i >= 0 ? { position: i + 1, of: rows.length } : null;
  }
  return out;
}
