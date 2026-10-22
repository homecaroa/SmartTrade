import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache/ttl-cache";
import { getConfig } from "@/lib/config";
import { parseQuery } from "@/lib/schemas/query";
import { getFullRanking, getOpportunityDetail, getRanking, parseHsCodes, productUniverseWarnings, universeWarnings } from "@/lib/service";
import { opportunitiesToCsv } from "@/lib/trade/csv";
import { SourceError } from "@/lib/sources/types";

afterEach(() => { vi.restoreAllMocks(); clearCache(); });
const demoCfg = () => getConfig({ SMARTRADE_DATA_MODE: "demo" });
const q = (raw: Record<string, string>) => { const p = parseQuery(raw); if (!p.success) throw new Error("query"); return p.data; };

describe("flujo de búsqueda (demo, respuestas controladas)", () => {
  it("busca sin elegir sector, puntúa y explica la puntuación", async () => {
    const r = await getRanking(q({}), demoCfg());
    expect(r.info.synthetic).toBe(true);
    expect(r.info.mode).toBe("demo");
    expect(r.validCount).toBeGreaterThan(10);
    expect(r.incompleteCount).toBeGreaterThan(0); // portátiles sin exportaciones; MX coches con valor inicial 0
    for (const o of r.rows) {
      expect(o.score!.components).toHaveLength(4);
      expect(o.score!.total).toBeGreaterThanOrEqual(0);
      expect(o.source).toContain("DEMO");
    }
    expect(r.rows.length).toBeLessThanOrEqual(20);
  });

  it("excluye incompletas del ranking y explica el motivo", async () => {
    const r = await getRanking(q({ pageSize: "50" }), demoCfg());
    expect(r.rows.some((o) => o.productCode === "847130")).toBe(false);
    const inc = r.incomplete.find((o) => o.productCode === "847130")!;
    expect(inc.missing.join(" ")).toMatch(/exportaciones españolas/);
    const mx = r.incomplete.find((o) => o.productCode === "870323" && o.marketCode === "MX");
    expect(mx?.cagr).toBeNull();
  });

  it("filtros, orden y paginación", async () => {
    const byMarket = await getRanking(q({ market: "DE" }), demoCfg());
    expect(byMarket.rows.every((o) => o.marketCode === "DE")).toBe(true);
    const sorted = await getRanking(q({ sort: "growth", order: "desc", pageSize: "50" }), demoCfg());
    const g = sorted.rows.map((o) => o.cagr!);
    expect(g).toEqual([...g].sort((a, b) => b - a));
    const p1 = await getRanking(q({ pageSize: "5", page: "1" }), demoCfg());
    const p2 = await getRanking(q({ pageSize: "5", page: "2" }), demoCfg());
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
    expect(p2.offset).toBe(5);
    const none = await getRanking(q({ q: "producto-inexistente" }), demoCfg());
    expect(none.rows).toHaveLength(0);
  });

  it("la puntuación no cambia al filtrar (universo estable) y es reproducible", async () => {
    const all = await getRanking(q({ pageSize: "50" }), demoCfg());
    const de = await getRanking(q({ market: "DE" }), demoCfg());
    const id = de.rows[0].id;
    expect(all.rows.find((o) => o.id === id)?.score?.total ?? de.rows[0].score!.total).toBeCloseTo(de.rows[0].score!.total);
    const again = await getRanking(q({ market: "DE" }), demoCfg());
    expect(again.rows.map((o) => o.id)).toEqual(de.rows.map((o) => o.id));
  });

  it("exporta CSV de los resultados filtrados", async () => {
    const { ranked } = await getFullRanking(q({ market: "FR", minSize: "500" }), demoCfg());
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((o) => o.marketCode === "FR" && o.marketSize! >= 500e6)).toBe(true);
    const csv = opportunitiesToCsv(ranked);
    expect(csv.trim().split("\r\n")).toHaveLength(ranked.length + 1);
  });

  it("detalle: serie histórica, proveedores y comparación", async () => {
    const r = await getRanking(q({}), demoCfg());
    const d = await getOpportunityDetail(r.rows[0].id, undefined, demoCfg());
    expect(d!.opportunity.importsSeries).toHaveLength(3);
    expect(d!.suppliers.length).toBeGreaterThan(0);
    expect(d!.top3Concentration).not.toBeNull();
    expect(d!.sameProduct.length).toBeGreaterThan(1);
    expect(d!.rank).toBe(1);
  });
});

describe("modos reales: errores sin inventar datos", () => {
  const comextCfg = () => getConfig({ SMARTRADE_DATA_MODE: "comext" });
  it("exige códigos HS válidos", async () => {
    expect(() => parseHsCodes("aceite")).toThrow(SourceError);
    expect(parseHsCodes("220421, 150920")).toEqual(["220421", "150920"]);
    await expect(getRanking(q({}), comextCfg())).rejects.toMatchObject({ kind: "config" });
  });
  it("si la fuente falla y no hay caché, propaga el error (no muestra datos)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("sin red"));
    await expect(getRanking(q({ q: "220421" }), comextCfg())).rejects.toMatchObject({ kind: "network" });
  });
  it("Comtrade sin clave devuelve error de configuración", async () => {
    const cfg = getConfig({ SMARTRADE_DATA_MODE: "comtrade" });
    await expect(getRanking(q({ q: "220421" }), cfg)).rejects.toMatchObject({ kind: "config" });
  });
  it("configuración inválida falla claramente", () => {
    expect(() => getConfig({ SMARTRADE_DATA_MODE: "otro" })).toThrow(/inválido/);
  });
});

describe("aviso de universo pequeño", () => {
  it("avisa con menos de 10 oportunidades completas y no con 10 o más", () => {
    expect(universeWarnings(3)[0]).toMatch(/Universo pequeño/);
    expect(universeWarnings(0)).toHaveLength(1);
    expect(universeWarnings(10)).toEqual([]);
  });
  it("la demo (universo amplio) no genera el aviso", async () => {
    const r = await getRanking(q({}), demoCfg());
    expect(r.info.warnings.some((w) => w.includes("Universo pequeño"))).toBe(false);
  });
});

describe("periodos incompletos", () => {
  it("rechaza años posteriores al último año completo (datos provisionales)", async () => {
    const future = new Date().getFullYear();
    await expect(getRanking({ ...q({}), year: future }, demoCfg())).rejects.toMatchObject({ kind: "config" });
    await expect(getRanking({ ...q({}), year: future }, demoCfg())).rejects.toThrow(/incompletos o provisionales/);
  });
});

describe("aviso de pocos productos (posición exportadora)", () => {
  it("avisa con menos de 10 productos y no con 10 o más", () => {
    expect(productUniverseWarnings(2)[0]).toMatch(/solo 2 producto/);
    expect(productUniverseWarnings(9)).toHaveLength(1);
    expect(productUniverseWarnings(10)).toEqual([]);
    expect(productUniverseWarnings(0)).toEqual([]);
  });
  it("la demo (8 productos) lo muestra, porque es un universo pequeño", async () => {
    const r = await getRanking(q({}), demoCfg());
    expect(r.info.warnings.some((w) => w.includes("posición exportadora"))).toBe(true);
  });
});
