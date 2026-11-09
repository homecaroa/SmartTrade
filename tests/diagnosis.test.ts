import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpportunities, type Opportunity } from "@/lib/trade/opportunities";
import { EXCEPTIONAL_GROWTH_CAGR, PRICE_EFFECT_GAP_PP, readMarket } from "@/lib/trade/diagnosis";
import { ob, pairObs } from "./helpers";

/**
 * Lectura descriptiva del mercado (06/11/2026). Sustituye a las etiquetas por percentiles (tests/labels.test.ts, retirado
 * con el score): frases deterministas a partir de los indicadores y avisos con su base. Se comprueba que no haga juicios
 * comerciales, que describa el pasado sin presentarlo como previsión y que avise de la expedición.
 */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const markets = [{ code: "DE", name: "Alemania" }, { code: "NL", name: "Países Bajos" }, { code: "US", name: "Estados Unidos" }];
const opp = (o: Parameters<typeof pairObs>[0], mode: "comext" | "comtrade" = "comext"): Opportunity =>
  buildOpportunities({ observations: pairObs(o), markets, endYear: o.endYear ?? 2024, mode }).opportunities.find((x) => x.marketCode === (o.market ?? "DE"))!;

describe("lectura del mercado", () => {
  it("describe tamaño, variación, evolución y forma de la serie con cifras, sin juicios comerciales", () => {
    const r = readMarket(opp({ world: [100e6, 90e6, 120e6], spain: [10e6, 9e6, 12e6], exportES: 1e9 }));
    const text = r.sentences.join(" ");
    expect(text).toMatch(/Alemania importó .* en 2024 \(\+33,3 % respecto a 2023\)/);
    expect(text).toMatch(/Entre 2022 y 2024 crecieron/);
    expect(text).toMatch(/no una previsión/);
    expect(text).toMatch(/cayeron en 2023 .* y se recuperaron en 2024/);
    expect(text).not.toMatch(/oportunidad|potencial|recomend|excelente|merece la pena|atractiv/i);
  });
  it("en un mercado de la UE dice que España es el país de EXPEDICIÓN; fuera de la UE (Comtrade), de origen", () => {
    expect(readMarket(opp({ world: [100, 100, 100], spain: [10, 10, 10], exportES: 1 })).sentences.join(" ")).toMatch(/EXPEDIDA desde España.*no permite identificar por sí solo el origen/);
    expect(readMarket(opp({ market: "US", world: [100, 100, 100], spain: [10, 10, 10], exportES: 1 }, "comtrade")).sentences.join(" ")).toMatch(/Con origen España/);
  });
  it("estable si |CAGR| < 1 %; sin dato de España lo dice sin inventar ceros", () => {
    const r = readMarket(opp({ world: [100, 100.5, 101], spain: [null, null, null], exportES: 1 }));
    expect(r.sentences.join(" ")).toMatch(/prácticamente estables/);
    expect(r.sentences.join(" ")).toMatch(/No constan importaciones con socio España/);
  });
  it("serie incompleta: sin frase de crecimiento y con aviso que explica qué falta", () => {
    const r = readMarket(opp({ world: [100, null, 120], spain: [1, 1, 1], exportES: 1 }));
    expect(r.sentences.join(" ")).not.toMatch(/Entre 2022 y 2024/);
    expect(r.cautions.find((c) => c.key === "incompleta")!.detail).toMatch(/Faltan importaciones del mercado en 2023/);
  });
});

describe("avisos", () => {
  it("crecimiento excepcional a partir del umbral, no antes", () => {
    const g = (end: number) => readMarket(opp({ world: [100, 120, end], spain: [1, 1, 1], exportES: 1 })).cautions.some((c) => c.key === "excepcional");
    expect(EXCEPTIONAL_GROWTH_CAGR).toBe(30);
    expect(g(169.1)).toBe(true); // CAGR ≈ 30,04 %
    expect(g(168)).toBe(false); // CAGR ≈ 29,6 %
  });
  it("posible efecto precio solo si hay pesos y el valor crece 15+ puntos más que el peso", () => {
    const w = (p: string, v: number, kg: number | null) => ob({ period: p, reporterCode: "DE", partnerCode: "WORLD", tradeValue: v, netWeight: kg });
    const o = (kg: (number | null)[]) => buildOpportunities({ observations: [w("2022", 100, kg[0]), w("2023", 120, kg[1]), w("2024", 144, kg[2])], markets, endYear: 2024, mode: "comext" }).opportunities[0];
    expect(PRICE_EFFECT_GAP_PP).toBe(15);
    expect(readMarket(o([100, 100, 100])).cautions.some((c) => c.key === "precio")).toBe(true); // 20 % frente a 0 %
    expect(readMarket(o([100, 110, 121])).cautions.some((c) => c.key === "precio")).toBe(false); // 20 % frente a 10 %
    expect(readMarket(o([null, null, null])).cautions.some((c) => c.key === "precio")).toBe(false);
  });
  it("Países Bajos (puerto de entrada) lleva aviso de reexpedición; Alemania no", () => {
    expect(readMarket(opp({ market: "NL", world: [1, 1, 1], spain: [1, 1, 1], exportES: 1 })).cautions.some((c) => c.key === "transito")).toBe(true);
    expect(readMarket(opp({ world: [1, 1, 1], spain: [1, 1, 1], exportES: 1 })).cautions.some((c) => c.key === "transito")).toBe(false);
  });
  it("una DOP exclusivamente española (Rioja, NC8) avisa de que su participación no mide competencia", () => {
    expect(readMarket(opp({ product: "22042176", world: [1, 1, 1], spain: [1, 1, 1], exportES: 1, cls: "NC8-HS2022" })).cautions.some((c) => c.key === "dop")).toBe(true);
  });
});

describe("punto de llamada: la interfaz", () => {
  it("la ficha y la tabla muestran la lectura y los avisos con su explicación visible (no solo en un tooltip)", () => {
    const ficha = sinComentarios(readFileSync("app/oportunidad/[id]/page.tsx", "utf8"));
    expect(ficha).toMatch(/const reading = readMarket\(o\)/);
    expect(ficha).toMatch(/<MarketCautions cautions=\{reading\.cautions\} \/>/);
    expect(ficha).toMatch(/<PartnerBasisNote basis=\{o\.partnerBasis\} \/>/);
    const cautions = sinComentarios(readFileSync("components/market-cautions.tsx", "utf8"));
    expect(cautions).toMatch(/\{c\.detail\}/);
    expect(cautions).not.toMatch(/title=\{/);
  });
  it("no queda rastro visible del score retirado en páginas ni componentes del análisis", () => {
    for (const f of ["app/mercados/page.tsx", "app/oportunidad/[id]/page.tsx", "app/comparar/page.tsx", "app/guia/page.tsx", "components/opportunity-table.tsx", "components/search-form.tsx", "components/entry-paths.tsx", "lib/compare.ts", "lib/trade/csv.ts"]) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/Potencial de cuota|Mercados grandes|percentil|ScoreBadge|LensSwitch|\.score\b|Buscar oportunidades/);
    }
  });
});
