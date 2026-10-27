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
    expect(RESEARCH_STEPS.map((s) => s.id)).toEqual(["requisitos", "aranceles", "origen", "impuestos", "competencia", "canales", "transporte"]);
  });
  it("el paso de transporte no estima costes ni tiempos", () => {
    const t = RESEARCH_STEPS.find((s) => s.id === "transporte")!;
    expect(t.sourceUrl).toBeUndefined();
    expect(t.internalHref).toBe("/logistica");
    expect(t.verify).toMatch(/no estima/i);
  });
});

describe("CSV con metadatos de interpretación", () => {
  const o = { productCode: "220421", productName: "Vino", classification: "HS2022", marketCode: "DE", marketName: "Alemania", endYear: 2024, marketSize: 1, currency: "EUR", cagr: 3, spanishShare: 2, spainExportsWorld: 5, quality: "alta", source: "x", retrievedAt: "t", synthetic: false, importsSeries: [{ year: 2022, value: 1 }], score: { total: 50, universeSize: 40, productUniverseSize: 10, components: [{ key: "size", normalized: 80 }, { key: "growth", normalized: 60 }, { key: "expansion", normalized: 70 }, { key: "export", normalized: 90 }] } } as unknown as Opportunity;
  it("incluye ventana, universo y percentiles de cada componente", () => {
    const [h, row] = opportunitiesToCsv([o]).replace("\uFEFF", "").trim().split("\r\n");
    expect(h).toContain("universo_oportunidades");
    expect(h.split(",")).toHaveLength(row.split(",").length);
    expect(row.endsWith("2022,40,10,80,60,70,90,")).toBe(true);
  });
  it("sin puntuación deja los metadatos vacíos (no ceros)", () => {
    const row = opportunitiesToCsv([{ ...o, score: null } as Opportunity]).replace("\uFEFF", "").trim().split("\r\n")[1];
    expect(row.endsWith("2022,,,,,,,")).toBe(true);
  });
});
