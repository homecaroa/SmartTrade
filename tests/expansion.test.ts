import { describe, expect, it } from "vitest";
import { penetrationGap, percentileRank, scoreUniverse, type ScoreInput } from "@/lib/scoring/score";

const mk = (id: string, size: number, spanishImports: number, o: Partial<ScoreInput> = {}): ScoreInput => ({ id, productKey: "P", size, cagr: 5, spanishImports, spainExports: 100, ...o });
const exp = (u: ScoreInput[], id: string) => scoreUniverse(u).get(id)!.components.find((c) => c.key === "expansion")!;
const size = (u: ScoreInput[], id: string) => scoreUniverse(u).get(id)!.components.find((c) => c.key === "size")!;

// Generador determinista (LCG) para universos sintéticos reproducibles
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }
function spearman(a: number[], b: number[]) {
  const r = (x: number[]) => x.map((v) => percentileRank(x, v));
  const ra = r(a), rb = r(b), m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = m(ra), mb = m(rb);
  let n = 0, da = 0, db = 0;
  ra.forEach((v, i) => { n += (v - ma) * (rb[i] - mb); da += (v - ma) ** 2; db += (rb[i] - mb) ** 2; });
  return n / Math.sqrt(da * db);
}

describe("expansión de cuota: brecha de penetración", () => {
  it("no depende del tamaño: misma cuota con tamaños muy distintos → misma expansión", () => {
    const u = [mk("a", 1000, 100), mk("b", 10000, 1000), mk("c", 100000, 10000), mk("d", 500, 50)];
    const e = ["a", "b", "c", "d"].map((id) => exp(u, id).normalized);
    expect(new Set(e).size).toBe(1);
    expect(size(u, "c").normalized).toBeGreaterThan(size(u, "a").normalized);
  });
  it("a igual tamaño, menor cuota española → mayor expansión", () => {
    const u = [mk("baja", 1000, 20), mk("media", 1000, 100), mk("alta", 1000, 300)];
    expect(exp(u, "baja").normalized).toBeGreaterThan(exp(u, "media").normalized);
    expect(exp(u, "media").normalized).toBeGreaterThan(exp(u, "alta").normalized);
  });
  it("la referencia es por producto: la misma cuota no es brecha si coincide con la media de su producto", () => {
    const u = [mk("a1", 1000, 50, { productKey: "A" }), mk("a2", 1000, 50, { productKey: "A" }), mk("b1", 1000, 500, { productKey: "B" }), mk("b2", 1000, 500, { productKey: "B" })];
    expect(penetrationGap(50, 1000, 0.05, 0)).toBeCloseTo(0);
    expect(new Set(["a1", "a2", "b1", "b2"].map((id) => exp(u, id).normalized)).size).toBe(1);
  });
  it("contrae las cuotas de mercados muy pequeños (evita brechas extremas por ruido)", () => {
    expect(penetrationGap(0, 1, 0.1, 0)).toBeCloseTo(1); // sin contracción: brecha máxima
    expect(penetrationGap(0, 1, 0.1, 50)!).toBeLessThan(0.1); // con contracción, casi neutra
    expect(penetrationGap(0, 1000, 0.1, 50)!).toBeGreaterThan(0.9); // un mercado grande sin presencia sí es brecha clara
  });
  it("sin cuota de referencia (España no vende el producto en ningún mercado) → 0 con aviso", () => {
    const u = [mk("a", 1000, 0), mk("b", 2000, 0), mk("c", 3000, 0)];
    const c = exp(u, "a");
    expect(c.normalized).toBe(0);
    expect(c.note).toMatch(/ninguno de los mercados/);
    expect(penetrationGap(0, 100, 0, 10)).toBeNull();
  });
  it("conserva las reglas de exportación: sin exportaciones observables no hay expansión", () => {
    const u = [mk("a", 1000, 10, { spainExports: 0 }), mk("b", 1000, 100), mk("c", 1000, 300)];
    expect(exp(u, "a").normalized).toBe(0);
  });
  it("es reproducible y no cambia los pesos", () => {
    const u = [mk("a", 1000, 20), mk("b", 2000, 100), mk("c", 3000, 600)];
    expect([...scoreUniverse(u).entries()]).toEqual([...scoreUniverse(u).entries()]);
    const r = scoreUniverse(u).get("a")!;
    expect(r.components.map((c) => c.weight)).toEqual([0.35, 0.3, 0.2, 0.15]);
  });
  it("en un universo sintético con cuotas independientes del tamaño, tamaño y expansión ya no son redundantes", () => {
    const rnd = rng(42);
    const u: ScoreInput[] = [];
    for (let p = 0; p < 6; p++)
      for (let m = 0; m < 25; m++) {
        const sz = Math.exp(rnd() * 6) * 1e6;
        u.push(mk(`p${p}m${m}`, sz, sz * (0.01 + rnd() * 0.15), { productKey: `p${p}`, spainExports: (p + 1) * 1e8 }));
      }
    const res = scoreUniverse(u);
    const s = u.map((i) => res.get(i.id)!.components.find((c) => c.key === "size")!.normalized);
    const e = u.map((i) => res.get(i.id)!.components.find((c) => c.key === "expansion")!.normalized);
    expect(Math.abs(spearman(s, e))).toBeLessThan(0.3);
  });
});
