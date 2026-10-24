import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, percentileRank, quantile, scoreUniverse, topContributors, winsorize, type ScoreInput } from "@/lib/scoring/score";

const inp = (id: string, o: Partial<ScoreInput> = {}): ScoreInput => ({ id, productKey: id, size: 100, cagr: 5, spanishImports: 10, spainExports: 50, ...o });

describe("normalización", () => {
  it("percentil por rango medio", () => {
    expect(percentileRank([10, 20, 30, 40], 10)).toBeCloseTo(12.5);
    expect(percentileRank([10, 20, 30, 40], 40)).toBeCloseTo(87.5);
    expect(percentileRank([5, 5, 5], 5)).toBeCloseTo(50);
  });
  it("cuantiles interpolados y winsorización robusta", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    const w = winsorize([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000]);
    expect(Math.max(...w)).toBeLessThan(1000);
    expect(w).toHaveLength(10);
  });
});

describe("puntuación ponderada", () => {
  const universe = [1, 2, 3, 4, 5].map((n) => inp("p" + n, { size: n * 100, cagr: n * 3, spainExports: n * 10 }));
  const res = scoreUniverse(universe);

  it("pesos suman 1 y total = suma de aportes", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (const r of res.values()) {
      expect(r.total).toBeCloseTo(r.components.reduce((s, c) => s + c.weight * c.normalized, 0));
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(100);
    }
  });
  it("es monótona y reproducible", () => {
    expect(res.get("p5")!.total).toBeGreaterThan(res.get("p1")!.total);
    const again = scoreUniverse(universe);
    expect([...again.entries()]).toEqual([...res.entries()]);
  });
  it("calcula manualmente un caso", () => {
    const p5 = res.get("p5")!;
    // percentil de rango medio del máximo entre 5 = 90; con un solo mercado por producto no hay brecha de cuota (neutra: 50)
    expect(p5.total).toBeCloseTo(0.35 * 90 + 0.3 * 90 + 0.2 * 50 + 0.15 * 90);
    expect(topContributors(p5, 1)[0].key).toBe("size");
  });
  it("crecimiento negativo no recibe puntuación alta", () => {
    const u = [inp("a", { cagr: -10 }), inp("b", { cagr: -20 }), inp("c", { cagr: -30 })];
    const r = scoreUniverse(u).get("a")!;
    expect(r.components.find((c) => c.key === "growth")!.normalized).toBeLessThanOrEqual(25);
  });
  it("sin exportaciones españolas observables no hay expansión demostrada", () => {
    const u = [inp("a", { spainExports: 0, spanishImports: 1e9 }), inp("b"), inp("c")];
    const c = scoreUniverse(u).get("a")!.components.find((x) => x.key === "expansion")!;
    expect(c.normalized).toBe(0);
    expect(c.note).toBeTruthy();
  });
  it("un valor extremo de crecimiento no distorsiona al resto", () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => inp("p" + n, { cagr: n }));
    const withOutlier = [...base, inp("x", { cagr: 1e6 })];
    const g = (m: Map<string, any>, id: string) => m.get(id).components.find((c: any) => c.key === "growth").normalized;
    const a = g(scoreUniverse(base), "p5");
    const b = g(scoreUniverse(withOutlier), "p5");
    expect(Math.abs(a - b)).toBeLessThan(10);
  });
  it("la posición exportadora usa un valor por producto", () => {
    const u = [inp("a1", { productKey: "A", spainExports: 10 }), inp("a2", { productKey: "A", spainExports: 10 }), inp("b1", { productKey: "B", spainExports: 20 })];
    expect(scoreUniverse(u).get("a1")!.productUniverseSize).toBe(2);
  });
});
