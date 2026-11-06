import { describe, expect, it } from "vitest";
import { buildOpportunities } from "@/lib/trade/opportunities";
import { csvCell, opportunitiesToCsv } from "@/lib/trade/csv";
import { positionsFor, rankMarkets } from "@/lib/trade/ranking";
import { ob, pairObs } from "./helpers";

const markets = [{ code: "DE", name: "Alemania" }, { code: "FR", name: "Francia" }, { code: "IT", name: "Italia" }];
const build = (obs: ReturnType<typeof pairObs>) => buildOpportunities({ observations: obs, markets, endYear: 2024, mode: "demo" });

describe("construcción de oportunidades", () => {
  it("calcula indicadores de un par completo", () => {
    const { opportunities } = build(pairObs({ world: [1000, 1100, 1210], spain: [100, 110, 121], exportES: 5000 }));
    const o = opportunities[0];
    expect(o.complete).toBe(true);
    expect(o.cagr).toBeCloseTo(10);
    expect(o.spanishShare).toBeCloseTo(10);
    expect(o.marketSize).toBe(1210);
    expect(o.yoyChange).toBeCloseTo(10);
    expect(o.spainValue).toBe(121);
    expect(o.spanishShareChangePp).toBeCloseTo(0);
    expect(o.partnerBasis).toBe("expedicion"); // Alemania, UE: socio = país de expedición
  });

  // Desde el 06/11/2026 no hay puntuación: «completa» significa serie del mercado completa y comparable. Faltar las
  // exportaciones españolas o el dato con socio España ya no la invalida: ese indicador queda en n.d. y se explica.
  it("sin imputar ceros: un año intermedio ausente deja la serie incompleta; sin dato de España, el indicador queda n.d.", () => {
    const gap = build(pairObs({ world: [1, null, 3], spain: [1, 1, 1], exportES: 10 })).opportunities[0];
    expect(gap.complete).toBe(false);
    expect(gap.cagr).toBeNull();
    expect(gap.missing.join(" ")).toMatch(/Faltan importaciones del mercado en 2023/);
    const noSpain = build(pairObs({ world: [1, 2, 3], spain: [1, 1, null], exportES: 10 })).opportunities[0];
    expect(noSpain.complete).toBe(true);
    expect(noSpain.spainValue).toBeNull();
    expect(noSpain.spanishShare).toBeNull();
    expect(noSpain.missing.join(" ")).toMatch(/socio España/);
    const noExports = build(pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: null })).opportunities[0];
    expect(noExports.complete).toBe(true);
    expect(noExports.spainExportsWorld).toBeNull();
  });

  // Desde el 06/11/2026 «completa» es la serie del mercado: con valor inicial 0 está completa, pero el CAGR no es
  // matemáticamente válido y queda n.d. con su motivo (antes la oportunidad quedaba fuera del ranking).
  it("valor inicial cero: crecimiento no calculable (n.d. con motivo), aunque la serie esté completa", () => {
    const o = build(pairObs({ world: [0, 50, 100], spain: [0, 1, 2], exportES: 10 })).opportunities[0];
    expect(o.cagr).toBeNull();
    expect(o.complete).toBe(true);
    expect(o.missing.join(" ")).toMatch(/Crecimiento no calculable/);
  });

  it("clasificaciones distintas en la ventana invalidan la comparación si el código cambió (150920, nuevo en HS2022)", () => {
    const a = pairObs({ product: "150920", world: [1, 2, 3], spain: [1, 1, 1], exportES: 10, cls: "HS2022" });
    a[0] = { ...a[0], productClassification: "HS2017" };
    const o = build(a).opportunities[0];
    expect(o.complete).toBe(false);
    expect(o.missing.join(" ")).toMatch(/Clasificaciones/);
  });

  it("HS2017 + HS2022 se unen para un código del catálogo sin cambios (220421): serie completa", () => {
    const a = pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: 10, cls: "HS2022", endYear: 2022 });
    a[0] = { ...a[0], productClassification: "HS2017" };
    a[1] = { ...a[1], productClassification: "HS2017" };
    const o = buildOpportunities({ observations: a, markets, endYear: 2022, mode: "comext" }).opportunities[0];
    expect(o.complete).toBe(true);
    expect(o.cagr).not.toBeNull();
  });

  it("pares sin ninguna observación no se convierten en ceros", () => {
    const r = build(pairObs({ market: "DE", world: [1, 2, 3], spain: [1, 1, 1], exportES: 10 }));
    expect(r.opportunities).toHaveLength(1);
    expect(r.pairsWithoutData).toBe(2);
    expect(r.pairsWithoutDataList).toEqual(["150920→FR", "150920→IT"].map((x) => x.replace("150920", r.opportunities[0].productCode)));
  });

  it("descarta duplicados", () => {
    const obs = pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: 10 });
    expect(build([...obs, obs[0]]).duplicatesRemoved).toBe(1);
  });

  it("marca datos sintéticos y no mezcla con reales", () => {
    const o = build(pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: 10, synthetic: true })).opportunities[0];
    expect(o.synthetic).toBe(true);
    const mixed = pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: 10 });
    mixed[0] = { ...mixed[0], synthetic: true };
    expect(build(mixed).opportunities[0].complete).toBe(false);
  });
});

function universe() {
  const obs = [
    ...pairObs({ market: "DE", world: [1e8, 1.1e8, 1.3e8], spain: [1e6, 1e6, 2e6], exportES: 5e8 }),
    ...pairObs({ market: "FR", world: [5e7, 5e7, 5.2e7], spain: [5e6, 5e6, 5e6], exportES: null }),
    ...pairObs({ market: "IT", world: [2e8, 2.5e8, 3.5e8], spain: [2e6, 3e6, 4e6], exportES: null }),
    ...pairObs({ product: "150920", market: "DE", world: [9e9, 9e9, 9e9], spain: [1, 1, 1], exportES: null }), // otro producto, mucho mayor
  ];
  return buildOpportunities({ observations: obs, markets, endYear: 2024, mode: "demo" }).opportunities;
}

describe("clasificación descriptiva (desde el 06/11/2026: sin índices)", () => {
  const all = universe();
  it("ordena los mercados de UN producto por una métrica, sin mezclar otros productos", () => {
    const byValue = rankMarkets(all, "220421", { sort: "valor", order: "desc" }).rows.map((o) => o.marketCode);
    expect(byValue).toEqual(["IT", "DE", "FR"]); // 150920 (9.000 M) no aparece aunque sea mayor
    expect(rankMarkets(all, "220421", { sort: "valor", order: "asc" }).rows.map((o) => o.marketCode)).toEqual(["FR", "DE", "IT"]);
    expect(rankMarkets(all, "220421", { sort: "crecimiento", order: "desc" }).rows[0].marketCode).toBe("IT");
    expect(rankMarkets(all, "220421", { sort: "espana", order: "desc" }).rows.map((o) => o.marketCode)).toEqual(["FR", "IT", "DE"]);
  });
  it("los mercados sin la métrica no entran (el peso no se publica aquí) y se listan aparte", () => {
    const r = rankMarkets(all, "220421", { sort: "peso", order: "desc" });
    expect(r.rows).toHaveLength(0);
    expect(r.withoutMetric).toHaveLength(3);
  });
  it("filtra por mercado, tamaño mínimo y crecimiento mínimo", () => {
    expect(rankMarkets(all, "220421", { sort: "valor", order: "desc", market: "DE" }).rows).toHaveLength(1);
    expect(rankMarkets(all, "220421", { sort: "valor", order: "desc", minSizeM: 100 }).rows.map((o) => o.marketCode)).toEqual(["IT", "DE"]);
    expect(rankMarkets(all, "220421", { sort: "crecimiento", order: "desc", minGrowth: 20 }).rows.map((o) => o.marketCode)).toEqual(["IT"]);
  });
  it("el puesto de una oportunidad depende solo de su producto: añadir otro producto no lo cambia", () => {
    const only = buildOpportunities({ observations: universe().length ? pairObs({ market: "DE", world: [1e8, 1.1e8, 1.3e8], spain: [1e6, 1e6, 2e6], exportES: 5e8 }).concat(
      pairObs({ market: "FR", world: [5e7, 5e7, 5.2e7], spain: [5e6, 5e6, 5e6], exportES: null }), pairObs({ market: "IT", world: [2e8, 2.5e8, 3.5e8], spain: [2e6, 3e6, 4e6], exportES: null })) : [], markets, endYear: 2024, mode: "demo" }).opportunities;
    expect(positionsFor(all, "220421-DE-2024")).toEqual(positionsFor(only, "220421-DE-2024"));
    expect(positionsFor(all, "220421-DE-2024").valor).toEqual({ position: 2, of: 3 });
  });
});

describe("exportación CSV", () => {
  const rows = rankMarkets(universe(), "220421", { sort: "valor", order: "desc", minSizeM: 100 }).rows;
  it("exporta solo los resultados filtrados con cabecera, fuente y qué significa «España»", () => {
    const csv = opportunitiesToCsv(rows, "valor");
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines).toHaveLength(1 + rows.length);
    expect(lines[0]).toContain("codigo_producto");
    expect(lines[0]).toContain("socio_espana_es");
    expect(lines[0]).not.toMatch(/percentil|puntuacion/);
    expect(lines[1]).toContain("IT");
    expect(lines[1]).toContain("expedicion");
    expect(csv).toContain("fecha_obtencion");
  });
  it("escapa comillas y neutraliza fórmulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
  });
  it("marca los datos sintéticos", () => {
    const syn = buildOpportunities({ observations: pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: 10, synthetic: true }), markets, endYear: 2024, mode: "demo" }).opportunities;
    expect(opportunitiesToCsv(syn)).toContain("SI_DEMO_SINTETICO");
  });
});

describe("crecimiento en volumen", () => {
  const w = (period: string, value: number, weight: number | null) =>
    ob({ period, reporterCode: "DE", partnerCode: "WORLD", tradeValue: value, netWeight: weight });
  const sp = (period: string, value: number) => ob({ period, reporterCode: "DE", partnerCode: "ES", tradeValue: value });
  const ex = ob({ period: "2024", reporterCode: "ES", partnerCode: "WORLD", flow: "export", tradeValue: 5000 });

  it("calcula el CAGR del peso neto aparte del CAGR en valor", () => {
    const o = build([w("2022", 1000, 100), w("2023", 1100, 100), w("2024", 1210, 100), sp("2022", 100), sp("2023", 110), sp("2024", 121), ex]).opportunities[0];
    expect(o.cagr).toBeCloseTo(10);
    expect(o.cagrVolume).toBeCloseTo(0);
  });
  it("sin pesos disponibles es null, no cero", () => {
    const o = build([w("2022", 1000, null), w("2023", 1100, null), w("2024", 1210, null), sp("2022", 100), sp("2023", 110), sp("2024", 121), ex]).opportunities[0];
    expect(o.cagrVolume).toBeNull();
    expect(o.complete).toBe(true);
  });
});

describe("peso estimado", () => {
  const w = (period: string, value: number, estimated: boolean | null) =>
    ob({ period, reporterCode: "DE", partnerCode: "WORLD", tradeValue: value, netWeight: 100, netWeightEstimated: estimated });
  const sp = (period: string, value: number) => ob({ period, reporterCode: "DE", partnerCode: "ES", tradeValue: value });
  const ex = ob({ period: "2024", reporterCode: "ES", partnerCode: "WORLD", flow: "export", tradeValue: 5000 });
  it("marca weightEstimated si algún año lo estima la fuente", () => {
    const est = build([w("2022", 1000, false), w("2023", 1100, true), w("2024", 1210, false), sp("2022", 100), sp("2023", 110), sp("2024", 121), ex]).opportunities[0];
    expect(est.weightEstimated).toBe(true);
    const obs = build([w("2022", 1000, false), w("2023", 1100, null), w("2024", 1210, false), sp("2022", 100), sp("2023", 110), sp("2024", 121), ex]).opportunities[0];
    expect(obs.weightEstimated).toBe(false);
  });
});
