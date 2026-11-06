import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache/ttl-cache";
import { getConfig } from "@/lib/config";
import { parseQuery } from "@/lib/schemas/query";
import { getFullRanking, getOpportunityDetail, getRanking, parseHsCodes } from "@/lib/service";
import { opportunitiesToCsv } from "@/lib/trade/csv";
import { SourceError } from "@/lib/sources/types";

afterEach(() => { vi.restoreAllMocks(); clearCache(); });
const demoCfg = () => getConfig({ SMARTRADE_DATA_MODE: "demo" });
const q = (raw: Record<string, string>) => { const p = parseQuery(raw); if (!p.success) throw new Error("query"); return p.data; };

describe("flujo de búsqueda (demo, respuestas controladas)", () => {
  // Desde el 06/11/2026 no hay puntuación: cada fila es un mercado de UN producto con indicadores descriptivos.
  it("busca sin elegir sector y devuelve indicadores descriptivos de un producto, etiquetados como demo", async () => {
    const r = await getRanking(q({}), demoCfg());
    expect(r.info.synthetic).toBe(true);
    expect(r.info.mode).toBe("demo");
    expect(r.total).toBeGreaterThan(5);
    for (const o of r.rows) {
      expect(o).not.toHaveProperty("score");
      expect(o.productCode).toBe(r.product!.code);
      expect(o.source).toContain("DEMO");
    }
    expect(r.rows.length).toBeLessThanOrEqual(20);
  });

  it("un mercado sin la métrica no entra en la clasificación, pero se lista con su motivo", async () => {
    const r = await getRanking(q({ producto: "870323", sort: "crecimiento", pageSize: "50" }), demoCfg());
    expect(r.rows.some((o) => o.marketCode === "MX")).toBe(false); // valor inicial 0: CAGR no calculable
    const mx = r.withoutMetric.find((o) => o.marketCode === "MX")!;
    expect(mx.cagr).toBeNull();
    expect(mx.missing.join(" ")).toMatch(/Crecimiento no calculable/);
    const lap = await getRanking(q({ producto: "847130" }), demoCfg());
    expect(lap.rows.length).toBeGreaterThan(0); // sin exportaciones españolas ya no se excluye: es un dato informativo
    expect(lap.rows[0].spainExportsWorld).toBeNull();
  });

  it("filtros, orden y paginación", async () => {
    const byMarket = await getRanking(q({ market: "DE" }), demoCfg());
    expect(byMarket.rows.every((o) => o.marketCode === "DE")).toBe(true);
    const sorted = await getRanking(q({ sort: "crecimiento", order: "desc", pageSize: "50" }), demoCfg());
    const g = sorted.rows.map((o) => o.cagr!);
    expect(g).toEqual([...g].sort((a, b) => b - a));
    const p1 = await getRanking(q({ pageSize: "5", page: "1" }), demoCfg());
    expect(p1.pages).toBeGreaterThan(1);
    const p2 = await getRanking(q({ pageSize: "5", page: "2" }), demoCfg());
    expect(p1.rows[0].id).not.toBe(p2.rows[0].id);
    expect(p2.offset).toBe(5);
    const none = await getRanking(q({ q: "producto-inexistente" }), demoCfg());
    expect(none.rows).toHaveLength(0);
    expect(none.product).toBeNull();
  });

  it("las cifras y puestos de un mercado no cambian al filtrar ni al llegar por otro camino (lista, ficha con o sin búsqueda)", async () => {
    const all = await getRanking(q({ pageSize: "50" }), demoCfg());
    const de = await getRanking(q({ market: "DE" }), demoCfg());
    const id = de.rows[0].id;
    expect(all.rows.find((o) => o.id === id)!.marketSize).toBe(de.rows[0].marketSize);
    const a = await getOpportunityDetail(id, undefined, demoCfg());
    const b = await getOpportunityDetail(id, "vino", demoCfg());
    expect(a!.positions).toEqual(b!.positions);
    expect(a!.opportunity).toEqual(b!.opportunity);
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
    expect(d!.tariff).toBeUndefined(); // modo demo: nunca se consulta WITS
    expect(d!.positions.valor).toEqual({ position: 1, of: r.total }); // la primera fila por valor, entre los mercados del producto
    expect(d!.sameProduct.every((o) => o.productCode === r.rows[0].productCode)).toBe(true);
  });
});

describe("modos reales: errores sin inventar datos", () => {
  const comextCfg = () => getConfig({ SMARTRADE_DATA_MODE: "comext" });
  it("exige códigos HS válidos", async () => {
    expect(() => parseHsCodes("xyzzy")).toThrow(SourceError);
    expect(parseHsCodes("aceite de oliva")).toEqual(["150920", "150930"]);
    expect(parseHsCodes("220421, 150920")).toEqual(["220421", "150920"]);
    await expect(getRanking(q({}), comextCfg())).rejects.toMatchObject({ kind: "config" });
  });
  it("si la fuente falla y no hay caché ni datos guardados, propaga el error (no muestra datos)", async () => {
    // Desde el 30/10/2026 el repositorio trae datos guardados reales (data/snapshots) y con ellos la web SÍ muestra datos
    // aunque la fuente falle (ver tests/snapshots.test.ts). Esta prueba sigue comprobando la regla «sin datos, error y
    // nunca datos inventados» porque tests/setup.ts hace que las pruebas usen una carpeta de datos vacía.
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

describe("periodos incompletos", () => {
  it("rechaza años posteriores al último año completo (datos provisionales)", async () => {
    const future = new Date().getFullYear();
    await expect(getRanking({ ...q({}), year: future }, demoCfg())).rejects.toMatchObject({ kind: "config" });
    await expect(getRanking({ ...q({}), year: future }, demoCfg())).rejects.toThrow(/incompletos o provisionales/);
  });
});
