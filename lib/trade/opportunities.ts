import type { DataMode, TradeObservation } from "@/lib/schemas/trade";
import { annualChanges, cagr, spanishShare } from "@/lib/scoring/indicators";
import { scoreUniverse, type ScoreInput, type ScoreResult, type Weights, DEFAULT_WEIGHTS } from "@/lib/scoring/score";
import { checkCompatible, dedupeObservations } from "./normalize";

export type Quality = "alta" | "media" | "baja";

export interface YearValue {
  year: number;
  value: number | null;
}

export interface Opportunity {
  id: string;
  productCode: string;
  productName: string;
  classification: string | null;
  marketCode: string;
  marketName: string;
  endYear: number;
  currency: "EUR" | "USD" | null;
  importsSeries: YearValue[]; // importaciones totales del mercado
  spainSeries: YearValue[]; // importaciones del mercado procedentes de España
  marketSize: number | null;
  cagr: number | null;
  annualChanges: (number | null)[];
  spanishShare: number | null;
  spainExportsWorld: number | null;
  netWeightEndYear: number | null;
  /** CAGR del peso neto importado (aproxima el volumen). null si faltan pesos o no son positivos. */
  cagrVolume: number | null;
  /** true si el peso de algún año de la ventana lo estima la fuente (no es observado): valor unitario y crecimiento en volumen son orientativos. */
  weightEstimated: boolean;
  score: ScoreResult | null;
  complete: boolean;
  missing: string[];
  quality: Quality;
  source: string;
  retrievedAt: string;
  mode: DataMode;
  synthetic: boolean;
}

export interface BuildInput {
  observations: TradeObservation[];
  markets: { code: string; name: string }[];
  endYear: number;
  mode: DataMode;
  windowYears?: number;
  weights?: Weights;
}

export interface BuildResult {
  opportunities: Opportunity[];
  duplicatesRemoved: number;
  pairsWithoutData: number;
  /** Primeros pares "producto→mercado" sin ninguna observación (diagnóstico). */
  pairsWithoutDataList: string[];
}

const ORIGIN = "ES";

export function buildOpportunities(input: BuildInput): BuildResult {
  const { markets, endYear, mode } = input;
  const win = input.windowYears ?? 3;
  const years = Array.from({ length: win }, (_, i) => endYear - (win - 1) + i);
  const { unique, duplicates } = dedupeObservations(input.observations);

  // Índice: flow|reporter|partner|product -> año -> obs (ignora "unavailable")
  const idx = new Map<string, Map<number, TradeObservation>>();
  const products = new Map<string, string>();
  for (const o of unique) {
    if (o.status === "unavailable") continue;
    const k = [o.flow, o.reporterCode, o.partnerCode, o.productCode].join("|");
    if (!idx.has(k)) idx.set(k, new Map());
    idx.get(k)!.set(Number(o.period), o);
    products.set(o.productCode, o.productName ?? products.get(o.productCode) ?? o.productCode);
  }
  const get = (flow: string, rep: string, par: string, prod: string) => idx.get(`${flow}|${rep}|${par}|${prod}`);

  const opportunities: Opportunity[] = [];
  let pairsWithoutData = 0;
  const pairsWithoutDataList: string[] = [];

  for (const [productCode, productName] of products) {
    const exp = get("export", ORIGIN, "WORLD", productCode)?.get(endYear);
    for (const m of markets) {
      if (m.code === ORIGIN) continue;
      const world = get("import", m.code, "WORLD", productCode);
      const sp = get("import", m.code, ORIGIN, productCode);
      const worldObs = years.map((y) => world?.get(y));
      if (worldObs.every((o) => !o)) {
        pairsWithoutData++;
        if (pairsWithoutDataList.length < 12) pairsWithoutDataList.push(`${productCode}→${m.code}`);
        continue;
      }
      const spObs = years.map((y) => sp?.get(y));
      const used = [...worldObs, ...spObs, exp].filter((o): o is TradeObservation => !!o);
      const missing: string[] = [];

      const compat = checkCompatible(used);
      if (!compat.ok) missing.push(compat.reason);

      const worldVals = worldObs.map((o) => o?.tradeValue ?? null);
      const spVals = spObs.map((o) => o?.tradeValue ?? null);
      const missingYears = years.filter((_, i) => worldVals[i] === null);
      if (missingYears.length) missing.push(`Faltan importaciones del mercado en ${missingYears.join(", ")}`);

      const size = worldVals[win - 1];
      const growth = compat.ok ? cagr(worldVals[0], size, win - 1) : null;
      if (growth === null && missingYears.length === 0 && compat.ok) {
        missing.push("Crecimiento no calculable (valor inicial o final no positivo)");
      }
      const growthVolume = compat.ok ? cagr(worldObs[0]?.netWeight ?? null, worldObs[win - 1]?.netWeight ?? null, win - 1) : null;
      const share = compat.ok ? spanishShare(spVals[win - 1], size) : null;
      if (share === null && compat.ok) missing.push("Cuota española no calculable (faltan importaciones desde España o definiciones inconsistentes)");
      const expValue = exp?.tradeValue ?? null;
      if (expValue === null) missing.push("Sin datos de exportaciones españolas del producto al mundo");

      const complete = missing.length === 0 && size !== null && growth !== null && share !== null && expValue !== null;
      const estimated = used.some((o) => o.status === "estimated");
      const quality: Quality = !complete ? "baja" : estimated ? "media" : "alta";
      const ref = worldObs[win - 1] ?? worldObs.find(Boolean)!;

      opportunities.push({
        id: `${productCode}-${m.code}-${endYear}`,
        productCode,
        productName,
        classification: ref.productClassification,
        marketCode: m.code,
        marketName: m.name,
        endYear,
        currency: ref.currency,
        importsSeries: years.map((year, i) => ({ year, value: worldVals[i] })),
        spainSeries: years.map((year, i) => ({ year, value: spVals[i] })),
        marketSize: size,
        cagr: growth,
        annualChanges: annualChanges(worldVals),
        spanishShare: share,
        spainExportsWorld: expValue,
        netWeightEndYear: worldObs[win - 1]?.netWeight ?? null,
        cagrVolume: growthVolume,
        weightEstimated: worldObs.some((w) => w?.netWeightEstimated === true),
        score: null,
        complete,
        missing,
        quality,
        source: ref.source,
        retrievedAt: ref.retrievedAt,
        mode,
        synthetic: ref.synthetic,
      });
    }
  }

  const inputs: ScoreInput[] = opportunities
    .filter((o) => o.complete)
    .map((o) => ({
      id: o.id,
      productKey: o.productCode,
      size: o.marketSize!,
      cagr: o.cagr!,
      spanishImports: (o.marketSize! * o.spanishShare!) / 100,
      spainExports: o.spainExportsWorld!,
    }));
  const scores = scoreUniverse(inputs, input.weights ?? DEFAULT_WEIGHTS);
  for (const o of opportunities) o.score = scores.get(o.id) ?? null;

  return { opportunities, duplicatesRemoved: duplicates, pairsWithoutData, pairsWithoutDataList };
}
