import { describe, expect, it } from "vitest";
import { buildOpportunities } from "@/lib/trade/opportunities";
import { csvCell, opportunitiesToCsv } from "@/lib/trade/csv";
import { rankOpportunities } from "@/lib/trade/ranking";
import { pairObs } from "./helpers";

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
    expect(o.score).not.toBeNull();
  });

  it("sin puntuación completa si faltan datos esenciales (no imputa ceros)", () => {
    const cases: [string, ReturnType<typeof pairObs>][] = [
      ["exportaciones", pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: null })],
      ["año intermedio", pairObs({ world: [1, null, 3], spain: [1, 1, 1], exportES: 10 })],
      ["cuota", pairObs({ world: [1, 2, 3], spain: [1, 1, null], exportES: 10 })],
    ];
    for (const [name, obs] of cases) {
      const o = build(obs).opportunities[0];
      expect(o.complete, name).toBe(false);
      expect(o.score, name).toBeNull();
      expect(o.missing.length, name).toBeGreaterThan(0);
    }
  });

  it("valor inicial cero: crecimiento no calculable, queda incompleta", () => {
    const o = build(pairObs({ world: [0, 50, 100], spain: [0, 1, 2], exportES: 10 })).opportunities[0];
    expect(o.cagr).toBeNull();
    expect(o.complete).toBe(false);
  });

  it("clasificaciones distintas en la ventana invalidan la comparación", () => {
    const a = pairObs({ world: [1, 2, 3], spain: [1, 1, 1], exportES: 10, cls: "HS2022" });
    a[0] = { ...a[0], productClassification: "HS2017" };
    const o = build(a).opportunities[0];
    expect(o.complete).toBe(false);
    expect(o.missing.join(" ")).toMatch(/Clasificaciones/);
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
  ];
  // exportación española solo una vez (mismo producto)
  return buildOpportunities({ observations: obs.filter((o, i, a) => !(o.flow === "export" && a.findIndex((x) => x.flow === "export") !== i)), markets, endYear: 2024, mode: "demo" }).opportunities;
}

describe("filtros y ordenación del ranking", () => {
  const all = universe();
  it("solo entran oportunidades completas", () => expect(all.every((o) => o.complete)).toBe(true));
  it("ordena por puntuación, tamaño y crecimiento, de forma reproducible", () => {
    const bySize = rankOpportunities(all, { sort: "size", order: "desc" }).map((o) => o.marketCode);
    expect(bySize).toEqual(["IT", "DE", "FR"]);
    expect(rankOpportunities(all, { sort: "size", order: "asc" }).map((o) => o.marketCode)).toEqual(["FR", "DE", "IT"]);
    const g = rankOpportunities(all, { sort: "growth", order: "desc" });
    expect(g[0].marketCode).toBe("IT");
    expect(rankOpportunities(all, { sort: "score", order: "desc" })).toEqual(rankOpportunities(all, { sort: "score", order: "desc" }));
  });
  it("filtra por mercado, tamaño mínimo, crecimiento mínimo y texto", () => {
    expect(rankOpportunities(all, { sort: "score", order: "desc", market: "DE" })).toHaveLength(1);
    expect(rankOpportunities(all, { sort: "size", order: "desc", minSizeM: 100 }).map((o) => o.marketCode)).toEqual(["IT", "DE"]);
    expect(rankOpportunities(all, { sort: "growth", order: "desc", minGrowth: 20 }).map((o) => o.marketCode)).toEqual(["IT"]);
    expect(rankOpportunities(all, { sort: "score", order: "desc", q: "220421" })).toHaveLength(3);
    expect(rankOpportunities(all, { sort: "score", order: "desc", q: "zzz" })).toHaveLength(0);
  });
});

describe("exportación CSV", () => {
  const rows = rankOpportunities(universe(), { sort: "size", order: "desc", minSizeM: 100 });
  it("exporta solo los resultados filtrados con cabecera y fuente", () => {
    const csv = opportunitiesToCsv(rows);
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines).toHaveLength(1 + rows.length);
    expect(lines[0]).toContain("codigo_producto");
    expect(lines[1]).toContain("IT");
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
