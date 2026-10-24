/**
 * Algoritmo de puntuación 0-100 (ver docs/methodology.md).
 * Expansión de cuota: brecha de penetración respecto a la cuota española de referencia del producto (independiente del tamaño).
 * Universo de percentiles: oportunidades COMPLETAS de la carga de datos (antes de aplicar filtros del usuario).
 * Sin componente disponible no hay puntuación: no se imputan ceros ni se redistribuyen pesos.
 */

export type ComponentKey = "size" | "growth" | "expansion" | "export";

export interface Weights {
  size: number;
  growth: number;
  expansion: number;
  export: number;
}

export const DEFAULT_WEIGHTS: Weights = { size: 0.35, growth: 0.3, expansion: 0.2, export: 0.15 };

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  size: "Tamaño del mercado",
  growth: "Crecimiento de importaciones",
  expansion: "Potencial de cuota española",
  export: "Posición exportadora de España",
};

/** Umbrales documentados. */
export const WINSOR_LOW = 5;
export const WINSOR_HIGH = 95;
export const NEGATIVE_GROWTH_CAP = 25;
export const LOW_EXPORT_PERCENTILE = 25;
/** Fracción de la mediana de mercado del producto usada como «masa» de contracción de la cuota (ver penetrationGap). */
export const SHRINK_FRACTION = 0.1;

/**
 * Brecha de penetración de la cuota española, independiente del tamaño del mercado:
 *   cuota contraída = (importaciones desde España + m·cuota_ref) / (importaciones totales + m)
 *   brecha = 1 − cuota contraída / cuota_ref
 * donde cuota_ref es la cuota española del producto sumando todos los mercados del universo y m = SHRINK_FRACTION × mediana
 * del tamaño de los mercados del producto. La contracción evita que mercados muy pequeños, con cuotas inestables,
 * obtengan brechas extremas. brecha > 0: cuota inferior a la de referencia; < 0: superior. Devuelve null si cuota_ref ≤ 0.
 */
export function penetrationGap(spanishImports: number, size: number, refShare: number, mass: number): number | null {
  if (!(refShare > 0) || !(size >= 0) || !(mass >= 0) || size + mass === 0) return null;
  const shrunk = (spanishImports + mass * refShare) / (size + mass);
  return 1 - shrunk / refShare;
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantile: conjunto vacío");
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Percentil por rango medio (0-100). Empates comparten rango. */
export function percentileRank(values: number[], v: number): number {
  if (values.length === 0) return NaN;
  let less = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) less++;
    else if (x === v) equal++;
  }
  return ((less + 0.5 * equal) / values.length) * 100;
}

export function winsorize(values: number[], low = WINSOR_LOW, high = WINSOR_HIGH): number[] {
  if (values.length === 0) return [];
  const s = [...values].sort((a, b) => a - b);
  const lo = quantile(s, low / 100);
  const hi = quantile(s, high / 100);
  return values.map((v) => Math.min(hi, Math.max(lo, v)));
}

export interface ScoreInput {
  id: string;
  productKey: string;
  size: number; // importaciones del mercado
  cagr: number; // %
  spanishImports: number; // importaciones del mercado procedentes de España
  spainExports: number; // exportaciones españolas del producto al mundo
}

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  raw: number;
  normalized: number;
  weight: number;
  contribution: number;
  note?: string;
}

export interface ScoreResult {
  total: number;
  components: ScoreComponent[];
  universeSize: number;
  productUniverseSize: number;
}

export function scoreUniverse(inputs: ScoreInput[], weights: Weights = DEFAULT_WEIGHTS): Map<string, ScoreResult> {
  const out = new Map<string, ScoreResult>();
  if (inputs.length === 0) return out;

  const sizes = inputs.map((i) => i.size);
  const growthW = winsorize(inputs.map((i) => i.cagr));

  // Referencia por producto: cuota española agregada y masa de contracción
  const prod = new Map<string, { imp: number; es: number; sizes: number[] }>();
  for (const i of inputs) {
    const p = prod.get(i.productKey) ?? { imp: 0, es: 0, sizes: [] };
    p.imp += i.size;
    p.es += i.spanishImports;
    p.sizes.push(i.size);
    prod.set(i.productKey, p);
  }
  const gaps = inputs.map((i) => {
    const p = prod.get(i.productKey)!;
    const mass = SHRINK_FRACTION * quantile([...p.sizes].sort((x, y) => x - y), 0.5);
    return penetrationGap(i.spanishImports, i.size, p.imp > 0 ? p.es / p.imp : 0, mass);
  });
  const gapVals = gaps.filter((g): g is number => g !== null);

  // Universo de exportación: un valor por producto (evita ponderar por nº de mercados)
  const byProduct = new Map<string, number>();
  for (const i of inputs) byProduct.set(i.productKey, i.spainExports);
  const exportVals = [...byProduct.values()];

  inputs.forEach((inp, idx) => {
    const sizeN = percentileRank(sizes, inp.size);

    let growthN = percentileRank(growthW, growthW[idx]);
    let growthNote: string | undefined;
    if (inp.cagr <= 0 && growthN > NEGATIVE_GROWTH_CAP) {
      growthN = NEGATIVE_GROWTH_CAP;
      growthNote = "Crecimiento nulo o negativo: componente limitado a " + NEGATIVE_GROWTH_CAP;
    }

    const exportN = percentileRank(exportVals, inp.spainExports);

    const gap = gaps[idx];
    let expansionN = gap === null ? 0 : percentileRank(gapVals, gap);
    let expansionNote: string | undefined;
    if (gap === null) {
      expansionN = 0;
      expansionNote = "España no vende este producto en ninguno de los mercados analizados: sin cuota de referencia";
    }
    if (inp.spainExports <= 0) {
      expansionN = 0;
      expansionNote = "España no registra exportaciones observables del producto: sin oportunidad exportadora demostrada";
    } else if (exportN < LOW_EXPORT_PERCENTILE && expansionN > LOW_EXPORT_PERCENTILE) {
      expansionN = LOW_EXPORT_PERCENTILE;
      expansionNote = "Exportaciones españolas del producto bajas: componente limitado a " + LOW_EXPORT_PERCENTILE;
    }

    const mk = (key: ComponentKey, raw: number, normalized: number, note?: string): ScoreComponent => ({
      key,
      label: COMPONENT_LABELS[key],
      raw,
      normalized,
      weight: weights[key],
      contribution: weights[key] * normalized,
      note,
    });
    const components = [
      mk("size", inp.size, sizeN),
      mk("growth", inp.cagr, growthN, growthNote),
      mk("expansion", gap ?? 0, expansionN, expansionNote),
      mk("export", inp.spainExports, exportN),
    ];
    out.set(inp.id, {
      total: components.reduce((s, c) => s + c.contribution, 0),
      components,
      universeSize: inputs.length,
      productUniverseSize: exportVals.length,
    });
  });
  return out;
}

/** Componentes ordenados por su aportación a la puntuación. */
export function topContributors(score: ScoreResult, n = 2): ScoreComponent[] {
  return [...score.components].sort((a, b) => b.contribution - a.contribution).slice(0, n);
}
