import { describe, expect, it } from "vitest";
import { evaluatePairs, MIN_MARKETS, ranks, runBacktest, spearman } from "@/lib/backtest/ranking";
import { buildOpportunities } from "@/lib/trade/opportunities";
import { ob } from "./helpers";

describe("estadística del backtest", () => {
  it("rangos con empates promediados", () => {
    expect(ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });
  it("Spearman: monótona creciente 1, decreciente −1, sin variación o pocos datos null", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 1000])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 1000], [10, 20, 30, 40])).toBeCloseTo(1, 10); // valores extremos en los dos lados: cuenta el orden
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8, 10); // 1 − 6·4/(5·24)
  });
});

/**
 * Universo sintético: un producto en 8 mercados, 2019–2025. El mercado i crece un i % al año antes de 2022 y un i %
 * después: el crecimiento pasado predice perfectamente el futuro.
 */
function synthetic() {
  const markets = Array.from({ length: 8 }, (_, i) => ({ code: `M${i}`, name: `M${i}` }));
  const obs = [];
  for (let i = 0; i < 8; i++) for (let y = 2019; y <= 2025; y++) {
    const w = 1000 * (1 + i / 4) * Math.pow(1 + i / 100, y - 2019);
    obs.push(ob({ period: String(y), reporterCode: `M${i}`, partnerCode: "WORLD", tradeValue: w }));
    obs.push(ob({ period: String(y), reporterCode: `M${i}`, partnerCode: "ES", tradeValue: w * 0.1 }));
  }
  for (let y = 2019; y <= 2025; y++) obs.push(ob({ period: String(y), reporterCode: "ES", partnerCode: "WORLD", flow: "export", tradeValue: 5000 }));
  return { markets, obs };
}

describe("backtest del ranking", () => {
  it("une cada oportunidad puntuada con lo que pasó después; sin dato final, null (no cero)", () => {
    const { markets, obs } = synthetic();
    const opps = buildOpportunities({ observations: obs, markets, endYear: 2022, mode: "comext" }).opportunities;
    const pairs = evaluatePairs(opps, obs.filter((o) => !(o.reporterCode === "M0" && o.period === "2025")), 2022, 3);
    expect(pairs).toHaveLength(8);
    const m0 = pairs.find((p) => p.market === "M0")!;
    expect(m0.outcomes.marketGrowth).toBeNull();
    expect(m0.outcomes.spainIncrease).toBeNull();
    const m7 = pairs.find((p) => p.market === "M7")!;
    expect(m7.outcomes.marketGrowth).toBeCloseTo(7, 6);
  });
  it("si el crecimiento pasado predice el futuro, su correlación dentro del producto es 1", () => {
    const { markets, obs } = synthetic();
    const r = runBacktest(obs, markets, 2022, 3);
    expect(r.scored).toBe(8);
    expect(r.stats.marketGrowth.pastGrowth.products).toBe(1);
    expect(r.stats.marketGrowth.pastGrowth.meanRho).toBeCloseTo(1, 6);
    expect(r.stats.marketGrowth.pastGrowth.topBeatsBottomPct).toBe(100);
    expect(r.stats.marketGrowth.volumen.meanRho).toBeGreaterThan(0.9); // tamaño y crecimiento van en la misma dirección
  });
  it(`productos con menos de ${MIN_MARKETS} mercados evaluables no cuentan`, () => {
    const { markets, obs } = synthetic();
    const few = markets.slice(0, MIN_MARKETS - 1).map((m) => m.code);
    const r = runBacktest(obs.filter((o) => o.flow === "export" || few.includes(o.reporterCode)), markets, 2022, 3);
    expect(r.stats.marketGrowth.volumen.products).toBe(0);
    expect(r.stats.marketGrowth.volumen.meanRho).toBeNull();
  });
});
