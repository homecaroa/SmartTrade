import { describe, expect, it } from "vitest";
import { LENSES, lensValue, percentileRank, quantile, scoreUniverse, winsorize, type ScoreInput } from "@/lib/scoring/score";

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

/**
 * Hasta el 03/11/2026 aquí se comprobaba la puntuación ponderada (pesos que suman 1, total = suma de aportes, caso
 * manual 0,35·90 + 0,30·90 + 0,20·50 + 0,15·90). Se sustituyó por dos rankings de un solo componente cada uno
 * (docs/methodology.md, validación histórica): ahora se comprueba que cada índice es exactamente su percentil.
 */
describe("dos rankings", () => {
  const universe = [1, 2, 3, 4, 5].map((n) => inp("p" + n, { size: n * 100, cagr: n * 3, spainExports: n * 10 }));
  const res = scoreUniverse(universe);

  it("cada índice es el percentil del componente que define su ranking, entre 0 y 100", () => {
    for (const r of res.values()) for (const lens of ["volumen", "potencial"] as const) {
      const c = r.components.find((x) => x.key === LENSES[lens].component)!;
      expect(lensValue(r, lens)).toBe(c.normalized);
      expect(r[lens]).toBeGreaterThanOrEqual(0);
      expect(r[lens]).toBeLessThanOrEqual(100);
    }
  });
  it("el crecimiento y la exportación no cambian ningún índice", () => {
    const flat = [1, 2, 3, 4, 5].map((n) => inp("p" + n, { size: n * 100, cagr: 50 - n * 9, spainExports: 500 - n * 10 }));
    const other = scoreUniverse(flat);
    for (const id of ["p1", "p3", "p5"]) {
      expect(other.get(id)!.volumen).toBe(res.get(id)!.volumen);
    }
  });
  it("es monótono en tamaño y reproducible", () => {
    expect(res.get("p5")!.volumen).toBeGreaterThan(res.get("p1")!.volumen);
    const again = scoreUniverse(universe);
    expect([...again.entries()]).toEqual([...res.entries()]);
  });
  it("calcula manualmente un caso", () => {
    const p5 = res.get("p5")!;
    // percentil de rango medio del máximo entre 5 = 90; con un solo mercado por producto no hay brecha de cuota (neutra: 50)
    expect(p5.volumen).toBeCloseTo(90);
    expect(p5.potencial).toBeCloseTo(50);
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
