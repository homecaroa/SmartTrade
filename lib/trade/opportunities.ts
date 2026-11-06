import type { DataMode, TradeObservation } from "@/lib/schemas/trade";
import { annualChanges, cagr, spanishShare } from "@/lib/scoring/indicators";
import { MARKETS } from "@/lib/config/catalog";
import { checkCompatible, dedupeObservations } from "./normalize";

/**
 * Diagnóstico descriptivo producto × mercado (desde el 06/11/2026). Sustituye a los dos rankings por percentiles
 * («Mercados grandes» y «Potencial de cuota»), retirados porque no superaban a reglas triviales en su propia validación
 * histórica (ver docs/methodology.md). Aquí NO hay puntuación: cada indicador es independiente, en su unidad, y se
 * calcula solo con los datos de ese producto y ese mercado, así que no depende de qué más se haya buscado.
 *
 * Ausente ≠ cero: un indicador que no puede calcularse es null («n.d.»).
 */
export type Quality = "alta" | "media" | "baja";

/**
 * Qué significa el país socio en la fuente. Eurostat Comext asigna las importaciones INTRA-UE al Estado miembro de
 * EXPEDICIÓN (no necesariamente al de origen) y las extra-UE al país de origen (metadatos ESMS de Eurostat). UN Comtrade
 * usa el país de origen. Por eso «desde España» en un mercado de la UE significa «expedido desde España».
 */
export type PartnerBasis = "expedicion" | "origen";

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
  importsSeries: YearValue[]; // importaciones totales del mercado (socio: mundo)
  spainSeries: YearValue[]; // importaciones del mercado con socio España (expedición u origen, ver partnerBasis)
  weightSeries: YearValue[]; // peso neto importado (kg), aproxima el volumen
  /** Importaciones del último año de la ventana. */
  marketSize: number | null;
  /** Variación del último año frente al anterior, en %. */
  yoyChange: number | null;
  /** Crecimiento anual compuesto de la ventana (en valor), en %. Solo con la serie completa y valores positivos. */
  cagr: number | null;
  annualChanges: (number | null)[];
  /** CAGR del peso neto importado (aproxima el volumen). null si faltan pesos o no son positivos. */
  cagrVolume: number | null;
  netWeightEndYear: number | null;
  /** true si el peso de algún año de la ventana lo estima la fuente: volumen y valor unitario son orientativos. */
  weightEstimated: boolean;
  /** Importaciones con socio España en el último año (valor bruto de la fuente). */
  spainValue: number | null;
  /** Participación de España en las importaciones del último año, en %. Ver partnerBasis antes de interpretarla. */
  spanishShare: number | null;
  /** Variación de esa participación entre el primer y el último año de la ventana, en puntos. */
  spanishShareChangePp: number | null;
  partnerBasis: PartnerBasis;
  /** Exportaciones españolas del producto al mundo (declaración de España), último año. Informativo. */
  spainExportsWorld: number | null;
  /** Serie de importaciones del mercado completa y comparable (los 3 años, misma clasificación y moneda). */
  complete: boolean;
  /** Datos que faltan o no se pueden comparar (explicación para el usuario). */
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
}

export interface BuildResult {
  opportunities: Opportunity[];
  duplicatesRemoved: number;
  pairsWithoutData: number;
  /** Primeros pares "producto→mercado" sin ninguna observación (diagnóstico). */
  pairsWithoutDataList: string[];
}

const ORIGIN = "ES";
const pct = (a: number | null, b: number | null) => (a !== null && b !== null && b > 0 ? (a / b - 1) * 100 : null);

export function partnerBasisOf(mode: DataMode, marketCode: string): PartnerBasis {
  if (mode === "comtrade") return "origen";
  return MARKETS.find((m) => m.code === marketCode)?.eu ? "expedicion" : "origen";
}

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
      const missing: string[] = [];

      // La comparabilidad se exige a la serie del mercado y a la de España (misma clasificación y moneda).
      const compat = checkCompatible([...worldObs, ...spObs].filter((o): o is TradeObservation => !!o));
      if (!compat.ok) missing.push(compat.reason);

      const worldVals = worldObs.map((o) => o?.tradeValue ?? null);
      const spVals = spObs.map((o) => o?.tradeValue ?? null);
      const weights = worldObs.map((o) => o?.netWeight ?? null);
      const missingYears = years.filter((_, i) => worldVals[i] === null);
      if (missingYears.length) missing.push(`Faltan importaciones del mercado en ${missingYears.join(", ")}`);

      const size = worldVals[win - 1];
      // CAGR solo con la serie completa: entre los extremos con un año ausente parecería un dato que no es.
      const growth = compat.ok && missingYears.length === 0 ? cagr(worldVals[0], size, win - 1) : null;
      if (growth === null && missingYears.length === 0 && compat.ok) missing.push("Crecimiento no calculable (valor inicial o final no positivo)");
      const growthVolume = compat.ok && weights.every((w) => w !== null) ? cagr(weights[0], weights[win - 1], win - 1) : null;
      const share = compat.ok ? spanishShare(spVals[win - 1], size) : null;
      const share0 = compat.ok ? spanishShare(spVals[0], worldVals[0]) : null;
      if (spVals[win - 1] === null) missing.push(`Sin importaciones registradas con socio España en ${endYear} (puede ser comercio nulo, confidencial o no publicado)`);
      if (compat.ok && spVals[win - 1] !== null && size !== null && size > 0 && share === null)
        missing.push("Las importaciones con socio España superan al total del mercado (definiciones inconsistentes en la fuente): participación no calculable");
      // Las exportaciones españolas se muestran con la moneda del mercado: si la fuente las da en otra, no se muestran
      // (EUR y USD nunca se mezclan ni se convierten).
      const expComparable = !exp || exp.currency === (worldObs[win - 1] ?? worldObs.find(Boolean))!.currency;
      if (!expComparable) missing.push("Exportaciones españolas al mundo en otra moneda: no se muestran");
      const expValue = expComparable ? exp?.tradeValue ?? null : null;

      const complete = compat.ok && missingYears.length === 0;
      const used = [...worldObs, ...spObs].filter((o): o is TradeObservation => !!o);
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
        weightSeries: years.map((year, i) => ({ year, value: weights[i] })),
        marketSize: size,
        yoyChange: compat.ok ? pct(size, worldVals[win - 2] ?? null) : null,
        cagr: growth,
        annualChanges: annualChanges(worldVals),
        cagrVolume: growthVolume,
        netWeightEndYear: weights[win - 1],
        weightEstimated: worldObs.some((w) => w?.netWeightEstimated === true),
        spainValue: spVals[win - 1],
        spanishShare: share,
        spanishShareChangePp: share !== null && share0 !== null ? share - share0 : null,
        partnerBasis: partnerBasisOf(mode, m.code),
        spainExportsWorld: expValue,
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

  return { opportunities, duplicatesRemoved: duplicates, pairsWithoutData, pairsWithoutDataList };
}
