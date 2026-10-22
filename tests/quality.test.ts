import { describe, expect, it } from "vitest";
import { buildOpportunities } from "@/lib/trade/opportunities";
import { missingProductCodes, validateSourceObservations } from "@/lib/trade/normalize";
import { rankOpportunities } from "@/lib/trade/ranking";
import { ob, pairObs } from "./helpers";

const markets = [{ code: "DE", name: "Alemania" }, { code: "FR", name: "Francia" }];
const build = (obs: ReturnType<typeof pairObs>) => buildOpportunities({ observations: obs, markets, endYear: 2024, mode: "comext" }).opportunities;
const one = (o: Parameters<typeof pairObs>[0]) => build(pairObs(o))[0];

describe("calidad de datos: casos límite", () => {
  it("valor final cero: tamaño 0 observado, crecimiento no calculable y sin puntuación", () => {
    const o = one({ world: [100, 50, 0], spain: [1, 1, 0], exportES: 10 });
    expect(o.marketSize).toBe(0);
    expect(o.cagr).toBeNull();
    expect(o.complete).toBe(false);
  });

  it("España mayor que el total (definiciones inconsistentes): sin cuota ni puntuación", () => {
    const o = one({ world: [100, 100, 100], spain: [1, 1, 150], exportES: 10 });
    expect(o.spanishShare).toBeNull();
    expect(o.complete).toBe(false);
  });

  it("cuota cero observada es válida (España exporta 0 al mercado), no es dato ausente", () => {
    const o = one({ world: [100, 110, 121], spain: [0, 0, 0], exportES: 10 });
    expect(o.spanishShare).toBe(0);
    expect(o.complete).toBe(true);
  });

  it("exportaciones españolas 0 observadas: completa, pero sin oportunidad exportadora demostrada", () => {
    const rows = [
      ...pairObs({ product: "111111", world: [100, 110, 121], spain: [1, 1, 1], exportES: 0 }),
      ...pairObs({ product: "222222", world: [100, 120, 150], spain: [1, 1, 1], exportES: 500 }),
      ...pairObs({ product: "333333", world: [90, 100, 130], spain: [1, 1, 1], exportES: 300 }),
    ];
    const opps = build(rows);
    const zero = opps.find((o) => o.productCode === "111111")!;
    expect(zero.complete).toBe(true);
    expect(zero.score!.components.find((c) => c.key === "expansion")!.normalized).toBe(0);
    expect(zero.score!.components.find((c) => c.key === "expansion")!.note).toMatch(/sin oportunidad exportadora demostrada/);
  });

  it("observaciones 'unavailable' se tratan como datos ausentes, no como 0", () => {
    const obs = pairObs({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 10 });
    obs[2] = { ...obs[2], tradeValue: null, status: "unavailable" };
    const o = build(obs)[0];
    expect(o.complete).toBe(false);
    expect(o.missing.join(" ")).toMatch(/Faltan importaciones/);
  });

  it("observaciones estimadas bajan la calidad a 'media'", () => {
    const obs = pairObs({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 10 });
    obs[1] = { ...obs[1], status: "estimated" };
    const o = build(obs)[0];
    expect(o.complete).toBe(true);
    expect(o.quality).toBe("media");
  });

  it("moneda de exportaciones distinta de la de importaciones: incompleta", () => {
    const obs = pairObs({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 10 });
    const i = obs.findIndex((o) => o.flow === "export");
    obs[i] = { ...obs[i], currency: "USD" };
    const o = build(obs)[0];
    expect(o.complete).toBe(false);
    expect(o.missing.join(" ")).toMatch(/Monedas distintas/);
  });

  it("serie con solo 2 de 3 años: incompleta aunque haya crecimiento calculable entre extremos", () => {
    const o = one({ world: [100, null, 144], spain: [1, 1, 1], exportES: 10 });
    expect(o.complete).toBe(false);
    expect(o.score).toBeNull();
  });

  it("ventana que cruza revisiones HS (2021→2022) no se combina; 2022-2024 sí es homogénea", () => {
    const withCls = (end: number) =>
      pairObs({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 10, endYear: end }).map((o) => ({ ...o, productClassification: Number(o.period) >= 2022 ? "HS2022" : "HS2017" }));
    const crossing = buildOpportunities({ observations: withCls(2023), markets, endYear: 2023, mode: "comext" }).opportunities[0];
    expect(crossing.complete).toBe(false);
    expect(crossing.missing.join(" ")).toMatch(/Clasificaciones incompatibles/);
    const homogeneous = buildOpportunities({ observations: withCls(2024), markets, endYear: 2024, mode: "comext" }).opportunities[0];
    expect(homogeneous.complete).toBe(true);
  });

  it("producto o país sin cobertura no genera oportunidades ni ceros", () => {
    const { opportunities, pairsWithoutData } = buildOpportunities({ observations: [], markets, endYear: 2024, mode: "comext" });
    expect(opportunities).toEqual([]);
    expect(pairsWithoutData).toBe(0);
  });

  it("empates de puntuación se ordenan de forma determinista por id", () => {
    const mk = (m: string) => pairObs({ market: m, world: [100, 110, 121], spain: [10, 11, 12], exportES: 100 });
    const obs = [...mk("DE"), ...mk("FR").filter((o) => o.flow !== "export")];
    const opps = build(obs);
    const a = rankOpportunities(opps, { sort: "score", order: "desc" }).map((o) => o.id);
    const b = rankOpportunities([...opps].reverse(), { sort: "score", order: "desc" }).map((o) => o.id);
    expect(a).toEqual(b);
  });
});

describe("validación de observaciones de la fuente", () => {
  it("descarta valores negativos y estructuras inválidas, y lo advierte", () => {
    const r = validateSourceObservations({ observations: [ob({}), ob({ tradeValue: -5 }), ob({ netWeight: -1 }), { x: 1 }], warnings: ["w"] });
    expect(r.observations).toHaveLength(1);
    expect(r.warnings[0]).toBe("w");
    expect(r.warnings[1]).toMatch(/3 observaciones inválidas/);
  });
  it("sin inválidas no añade avisos", () => {
    expect(validateSourceObservations({ observations: [ob({})], warnings: [] }).warnings).toEqual([]);
  });
});

describe("códigos sin datos (p. ej. HS eliminado en una revisión)", () => {
  it("detecta los códigos solicitados que no tienen ninguna observación", () => {
    const obs = [ob({ productCode: "220421" })];
    expect(missingProductCodes(["220421", "150910"], obs)).toEqual(["150910"]);
    expect(missingProductCodes(null, obs)).toEqual([]);
    expect(missingProductCodes([], obs)).toEqual([]);
  });
});
