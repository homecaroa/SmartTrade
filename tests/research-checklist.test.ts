import { describe, expect, it } from "vitest";
import { ACCESS_LINKS } from "@/lib/market-access";
import { RESEARCH_STEPS } from "@/lib/research-checklist";
import { opportunitiesToCsv } from "@/lib/trade/csv";
import type { Opportunity } from "@/lib/trade/opportunities";

describe("siguientes pasos de investigación", () => {
  it("solo enlaza a las fuentes oficiales conocidas y no afirma haber verificado nada", () => {
    const ok = new Set(ACCESS_LINKS.map((l) => l.url));
    expect(RESEARCH_STEPS.every((s) => !s.sourceUrl || ok.has(s.sourceUrl))).toBe(true);
    expect(JSON.stringify(RESEARCH_STEPS)).not.toMatch(/verificad|validad|completad/i);
  });
  it("cubre requisitos, aranceles, origen, impuestos, competencia, canales y transporte", () => {
    expect(RESEARCH_STEPS.map((s) => s.id)).toEqual(["requisitos", "aranceles", "origen", "impuestos", "competencia", "canales", "financiacion", "transporte"]);
  });
  it("el paso de compradores enlaza a Trade Map sin integrarlo", () => {
    const c = RESEARCH_STEPS.find((s) => s.id === "canales")!;
    expect(c.sourceUrl).toBe("https://www.trademap.org/");
    expect(ACCESS_LINKS.find((l) => l.url === c.sourceUrl)!.purpose).toMatch(/Kompass.*Dun & Bradstreet.*cuenta del ITC/);
  });
  it("financiación y seguro: solo enlaces a los organismos públicos, por https y sin promesas", () => {
    const f = RESEARCH_STEPS.find((s) => s.id === "financiacion")!;
    expect(f.links!.map((l) => new URL(l.url).hostname).sort()).toEqual(["comercio.gob.es", "www.cesce.es", "www.cofides.es", "www.ico.es"]);
    expect(f.links!.every((l) => l.url.startsWith("https://"))).toBe(true);
    expect(JSON.stringify(f)).not.toMatch(/garantiz|asegura(mos|do)|aprobad|concede/i);
    expect(f.verify).toMatch(/no evalúa el riesgo/);
  });
  it("el paso de transporte no estima costes ni tiempos", () => {
    const t = RESEARCH_STEPS.find((s) => s.id === "transporte")!;
    expect(t.sourceUrl).toBeUndefined();
    expect(t.internalHref).toBe("/logistica");
    expect(t.verify).toMatch(/no estima/i);
  });
});

// Hasta el 06/11/2026 el CSV llevaba universo y percentiles de la puntuación; ahora lleva indicadores descriptivos,
// el puesto según la métrica elegida y en qué se basa el socio España.
describe("CSV descriptivo", () => {
  const o = { productCode: "220421", productName: "Vino", classification: "HS2022", marketCode: "DE", marketName: "Alemania", endYear: 2024, marketSize: 1000, currency: "EUR", yoyChange: 2, cagr: 3, cagrVolume: null, netWeightEndYear: null, spainValue: 20, spanishShare: 2, spanishShareChangePp: null, partnerBasis: "expedicion", spainExportsWorld: 5, complete: true, quality: "alta", source: "x", retrievedAt: "t", synthetic: false, importsSeries: [{ year: 2022, value: 1 }] } as unknown as Opportunity;
  it("cabecera sin puntuación ni percentiles y una celda por columna", () => {
    const [h, row] = opportunitiesToCsv([o], "crecimiento").replace("\uFEFF", "").trim().split("\r\n");
    expect(h).not.toMatch(/puntuacion|percentil|universo/);
    expect(h).toContain("metrica_orden");
    expect(h).toContain("socio_espana_es");
    expect(h.split(",")).toHaveLength(row.split(",").length);
    expect(row.startsWith("1,crecimiento,220421")).toBe(true);
  });
  it("los datos ausentes quedan vacíos (no ceros)", () => {
    const [h, row] = opportunitiesToCsv([o]).replace("\uFEFF", "").trim().split("\r\n");
    const cells = Object.fromEntries(h.split(",").map((k, i) => [k, row.split(",")[i]]));
    expect(cells.peso_neto_kg).toBe("");
    expect(cells.crecimiento_volumen_cagr_pct).toBe("");
    expect(cells.variacion_participacion_pp).toBe("");
  });
});
