import { describe, expect, it } from "vitest";
import { buildOpportunities } from "@/lib/trade/opportunities";
import { missingProductCodes, validateSourceObservations } from "@/lib/trade/normalize";
import { rankMarkets } from "@/lib/trade/ranking";
import { ob, pairObs } from "./helpers";

const markets = [{ code: "DE", name: "Alemania" }, { code: "FR", name: "Francia" }];
const build = (obs: ReturnType<typeof pairObs>) => buildOpportunities({ observations: obs, markets, endYear: 2024, mode: "comext" }).opportunities;
const one = (o: Parameters<typeof pairObs>[0]) => build(pairObs(o))[0];

// Desde el 06/11/2026 no hay puntuación. «complete» significa ahora «serie de importaciones completa y comparable»;
// lo que antes dejaba la oportunidad «sin puntuar» (valor final cero, España > total) se ve en el indicador concreto,
// que queda en null con su explicación en «missing».
describe("calidad de datos: casos límite", () => {
  it("valor final cero: tamaño 0 observado y crecimiento no calculable, explicado", () => {
    const o = one({ world: [100, 50, 0], spain: [1, 1, 0], exportES: 10 });
    expect(o.marketSize).toBe(0);
    expect(o.cagr).toBeNull();
    expect(o.spanishShare).toBeNull();
    expect(o.missing.join(" ")).toMatch(/Crecimiento no calculable/);
  });

  it("España mayor que el total (definiciones inconsistentes): sin participación y explicado", () => {
    const o = one({ world: [100, 100, 100], spain: [1, 1, 150], exportES: 10 });
    expect(o.spanishShare).toBeNull();
    expect(o.spanishShareChangePp).toBeNull();
    expect(o.missing.join(" ")).toMatch(/superan al total/);
  });

  it("cuota cero observada es válida (España exporta 0 al mercado), no es dato ausente", () => {
    const o = one({ world: [100, 110, 121], spain: [0, 0, 0], exportES: 10 });
    expect(o.spanishShare).toBe(0);
    expect(o.complete).toBe(true);
  });

  it("exportaciones españolas 0 observadas: se muestran como 0 (dato), no como ausentes", () => {
    const o = one({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 0 });
    expect(o.complete).toBe(true);
    expect(o.spainExportsWorld).toBe(0);
    expect(one({ world: [100, 110, 121], spain: [1, 1, 1], exportES: null }).spainExportsWorld).toBeNull();
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

  // Antes dejaba la oportunidad incompleta porque las exportaciones entraban en la puntuación; ahora son informativas,
  // así que la serie del mercado sigue siendo válida, pero el dato en otra moneda NO se muestra con la etiqueta equivocada.
  it("moneda de exportaciones distinta de la de importaciones: no se muestran y se explica", () => {
    const obs = pairObs({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 10 });
    const i = obs.findIndex((o) => o.flow === "export");
    obs[i] = { ...obs[i], currency: "USD" };
    const o = build(obs)[0];
    expect(o.spainExportsWorld).toBeNull();
    expect(o.missing.join(" ")).toMatch(/otra moneda/);
  });

  it("moneda de la serie de España distinta de la del mercado: incompleta", () => {
    const obs = pairObs({ world: [100, 110, 121], spain: [1, 1, 1], exportES: 10 });
    const i = obs.findIndex((o) => o.partnerCode === "ES");
    obs[i] = { ...obs[i], currency: "USD" };
    const o = build(obs)[0];
    expect(o.complete).toBe(false);
    expect(o.spanishShare).toBeNull();
    expect(o.missing.join(" ")).toMatch(/Monedas distintas/);
  });

  it("serie con solo 2 de 3 años: incompleta aunque haya crecimiento calculable entre extremos", () => {
    const o = one({ world: [100, null, 144], spain: [1, 1, 1], exportES: 10 });
    expect(o.complete).toBe(false);
    expect(o.cagr).toBeNull();
    expect(o.missing.join(" ")).toMatch(/Faltan importaciones del mercado en 2023/);
  });

  // Hasta el 06/11/2026 ninguna ventana que cruzara 2022 se combinaba, y los años finales 2022 y 2023 salían vacíos
  // para todos los productos. Ahora se une si el código no cambió entre HS2017 y HS2022 (tabla de correlación OMA).
  it("ventana que cruza la revisión HS2022: se une si el código no cambió, no si cambió", () => {
    const withCls = (end: number, product?: string) =>
      pairObs({ product, world: [100, 110, 121], spain: [1, 1, 1], exportES: 10, endYear: end }).map((o) => ({ ...o, productClassification: Number(o.period) >= 2022 ? "HS2022" : "HS2017" }));
    const bridged = buildOpportunities({ observations: withCls(2023), markets, endYear: 2023, mode: "comext" }).opportunities[0];
    expect(bridged.complete).toBe(true);
    expect(bridged.cagr).not.toBeNull();
    const changed = buildOpportunities({ observations: withCls(2023, "150920"), markets, endYear: 2023, mode: "comext" }).opportunities[0];
    expect(changed.complete).toBe(false);
    expect(changed.cagr).toBeNull();
    expect(changed.missing.join(" ")).toMatch(/Clasificaciones incompatibles.*cambió entre ediciones/);
    const homogeneous = buildOpportunities({ observations: withCls(2024, "150920"), markets, endYear: 2024, mode: "comext" }).opportunities[0];
    expect(homogeneous.complete).toBe(true);
  });

  it("producto o país sin cobertura no genera oportunidades ni ceros", () => {
    const { opportunities, pairsWithoutData } = buildOpportunities({ observations: [], markets, endYear: 2024, mode: "comext" });
    expect(opportunities).toEqual([]);
    expect(pairsWithoutData).toBe(0);
  });

  it("empates en un ranking se ordenan de forma determinista por id", () => {
    const mk = (m: string) => pairObs({ market: m, world: [100, 110, 121], spain: [10, 11, 12], exportES: 100 });
    const obs = [...mk("DE"), ...mk("FR").filter((o) => o.flow !== "export")];
    const opps = build(obs);
    const a = rankMarkets(opps, "220421", { sort: "valor", order: "desc" }).rows.map((o) => o.id);
    const b = rankMarkets([...opps].reverse(), "220421", { sort: "valor", order: "desc" }).rows.map((o) => o.id);
    expect(a).toHaveLength(2);
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
