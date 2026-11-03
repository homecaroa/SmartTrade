import type { TradeObservation } from "@/lib/schemas/trade";
import { cagr } from "@/lib/scoring/indicators";
import { buildOpportunities, type Opportunity } from "@/lib/trade/opportunities";

/**
 * Validación histórica de los rankings («backtest»). Se calculan como si fuera el año T (ventana T−2..T, el mismo
 * algoritmo de la web) y se comparan con lo que pasó después, entre T y T+H:
 *   - crecimiento del mercado: CAGR de las importaciones totales T→T+H;
 *   - crecimiento de las ventas españolas: CAGR de las importaciones desde España T→T+H;
 *   - aumento de las ventas españolas: importaciones desde España en T+H − en T (en euros).
 * Métrica principal: correlación de rangos de Spearman DENTRO de cada producto (el orden de mercados que ve quien busca
 * su producto), con al menos MIN_MARKETS mercados evaluables. El crecimiento pasado se mide como referencia.
 * Historia: hasta el 03/11/2026 se medía también la puntuación única (0,35/0,30/0,20/0,15); sus resultados, que llevaron
 * a sustituirla por los dos rankings, están en docs/methodology.md.
 * Limitaciones: las parejas producto-mercado no son independientes (mismos países, mismo ciclo económico), así que no
 * se calculan p-valores; un periodo con shocks (2020–2022) puede no repetirse.
 */
export const MIN_MARKETS = 6;

export type OutcomeKey = "marketGrowth" | "spainGrowth" | "spainIncrease";
export type PredictorKey = "volumen" | "potencial" | "pastGrowth";
export const OUTCOME_LABEL: Record<OutcomeKey, string> = {
  marketGrowth: "Crecimiento posterior del mercado (CAGR)",
  spainGrowth: "Crecimiento posterior de las ventas españolas (CAGR)",
  spainIncrease: "Aumento posterior de las ventas españolas (€)",
};
export const PREDICTOR_LABEL: Record<PredictorKey, string> = { volumen: "Ranking «Mercados grandes» (tamaño)", potencial: "Ranking «Potencial de cuota»", pastGrowth: "Crecimiento pasado (referencia)" };

/** Rangos con empates promediados (1 = menor). */
export function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k].i] = avg;
    i = j + 1;
  }
  return r;
}

/** Correlación de Spearman (Pearson sobre rangos). null con menos de 3 pares o sin variación. */
export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

export interface EvaluatedPair {
  id: string;
  product: string;
  market: string;
  predictors: Record<PredictorKey, number>;
  outcomes: Record<OutcomeKey, number | null>;
}

export interface CellStats {
  /** Productos con al menos MIN_MARKETS mercados con resultado. */
  products: number;
  meanRho: number | null;
  medianRho: number | null;
  /** % de productos con correlación positiva. */
  positivePct: number | null;
  /** % de productos en que el tercio superior del ranking superó al tercio inferior (mediana del resultado). */
  topBeatsBottomPct: number | null;
}

export interface OriginResult {
  originYear: number;
  horizon: number;
  /** Oportunidades completas (con puntuación) en T. */
  scored: number;
  /** De ellas, con los datos de T+H necesarios. */
  evaluated: number;
  stats: Record<OutcomeKey, Record<PredictorKey, CellStats>>;
  pooled: Record<OutcomeKey, Record<PredictorKey, number | null>>;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function cell(pairs: EvaluatedPair[], pred: PredictorKey, out: OutcomeKey): CellStats {
  const byProduct = new Map<string, EvaluatedPair[]>();
  for (const p of pairs) if (p.outcomes[out] !== null) byProduct.set(p.product, [...(byProduct.get(p.product) ?? []), p]);
  const rhos: number[] = [];
  let beats = 0, comparable = 0;
  for (const ps of byProduct.values()) {
    if (ps.length < MIN_MARKETS) continue;
    const rho = spearman(ps.map((p) => p.predictors[pred]), ps.map((p) => p.outcomes[out]!));
    if (rho === null) continue;
    rhos.push(rho);
    const sorted = [...ps].sort((a, b) => b.predictors[pred] - a.predictors[pred]);
    const third = Math.floor(sorted.length / 3);
    const top = median(sorted.slice(0, third).map((p) => p.outcomes[out]!));
    const bottom = median(sorted.slice(-third).map((p) => p.outcomes[out]!));
    if (top !== null && bottom !== null) { comparable++; if (top > bottom) beats++; }
  }
  return {
    products: rhos.length,
    meanRho: rhos.length ? rhos.reduce((a, b) => a + b, 0) / rhos.length : null,
    medianRho: median(rhos),
    positivePct: rhos.length ? (rhos.filter((r) => r > 0).length / rhos.length) * 100 : null,
    topBeatsBottomPct: comparable ? (beats / comparable) * 100 : null,
  };
}

/** Une cada oportunidad puntuada en T con sus resultados en T+H (null si falta algún dato; ausente ≠ cero). */
export function evaluatePairs(opps: Opportunity[], observations: TradeObservation[], originYear: number, horizon: number): EvaluatedPair[] {
  const value = new Map<string, number>();
  for (const o of observations) {
    if (o.flow !== "import" || o.tradeValue === null || o.status === "unavailable") continue;
    value.set(`${o.reporterCode}|${o.partnerCode}|${o.productCode}|${o.period}`, o.tradeValue);
  }
  const v = (m: string, p: string, prod: string, y: number) => value.get(`${m}|${p}|${prod}|${y}`) ?? null;
  const end = originYear + horizon;
  return opps.filter((o) => o.score).map((o) => {
    const w0 = v(o.marketCode, "WORLD", o.productCode, originYear);
    const w1 = v(o.marketCode, "WORLD", o.productCode, end);
    const e0 = v(o.marketCode, "ES", o.productCode, originYear);
    const e1 = v(o.marketCode, "ES", o.productCode, end);
    return {
      id: o.id, product: o.productCode, market: o.marketCode,
      predictors: { volumen: o.marketSize!, potencial: o.score!.potencial, pastGrowth: o.cagr! },
      outcomes: {
        marketGrowth: cagr(w0, w1, horizon),
        spainGrowth: cagr(e0, e1, horizon),
        spainIncrease: e0 !== null && e1 !== null ? e1 - e0 : null,
      },
    };
  });
}

export function runBacktest(observations: TradeObservation[], markets: { code: string; name: string }[], originYear: number, horizon: number): OriginResult {
  const built = buildOpportunities({ observations, markets, endYear: originYear, mode: "comext" });
  const pairs = evaluatePairs(built.opportunities, observations, originYear, horizon);
  const outs: OutcomeKey[] = ["marketGrowth", "spainGrowth", "spainIncrease"];
  const preds: PredictorKey[] = ["volumen", "potencial", "pastGrowth"];
  const stats = Object.fromEntries(outs.map((o) => [o, Object.fromEntries(preds.map((p) => [p, cell(pairs, p, o)]))])) as OriginResult["stats"];
  const pooled = Object.fromEntries(outs.map((o) => {
    const ok = pairs.filter((p) => p.outcomes[o] !== null);
    return [o, Object.fromEntries(preds.map((p) => [p, spearman(ok.map((x) => x.predictors[p]), ok.map((x) => x.outcomes[o]!))]))];
  })) as OriginResult["pooled"];
  return { originYear, horizon, scored: pairs.length, evaluated: pairs.filter((p) => outs.some((o) => p.outcomes[o] !== null)).length, stats, pooled };
}
