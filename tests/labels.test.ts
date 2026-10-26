import { describe, expect, it } from "vitest";
import { describeOpportunity, HIGH_PERCENTILE, shortTags, SPANISH_PRESENCE_SHARE, TAG_LEGEND } from "@/lib/scoring/labels";
import { LOW_EXPORT_PERCENTILE, type ComponentKey } from "@/lib/scoring/score";
import type { Opportunity } from "@/lib/trade/opportunities";

const W = { size: 0.35, growth: 0.3, expansion: 0.2, export: 0.15 } as const;
function opp(p: Partial<Record<ComponentKey, number>> = {}, o: Partial<Opportunity> = {}): Opportunity {
  const n = { size: 50, growth: 50, expansion: 50, export: 50, ...p };
  const components = (Object.keys(W) as ComponentKey[]).map((key) => ({ key, label: key, weight: W[key], normalized: n[key], contribution: W[key] * n[key], note: null }));
  const total = components.reduce((a, c) => a + c.contribution, 0);
  return { complete: true, quality: "alta", cagr: 4, annualChanges: [3, 5], spanishShare: 2, score: { total, components, universeSize: 40, productUniverseSize: 10 }, ...o } as unknown as Opportunity;
}
const keys = (o: Opportunity) => describeOpportunity(o).tags.map((t) => t.key);

describe("etiquetas en lenguaje llano", () => {
  it("umbral percentil alto: 75 sí, 74 no", () => {
    expect(keys(opp({ size: HIGH_PERCENTILE }))).toContain("grande");
    expect(keys(opp({ size: HIGH_PERCENTILE - 1 }))).not.toContain("grande");
  });
  it("«Crece rápido» exige crecimiento positivo", () => {
    expect(keys(opp({ growth: 90 }))).toContain("crece");
    expect(keys(opp({ growth: 90 }, { cagr: -3 }))).not.toContain("crece");
  });
  it("crecimiento negativo → «En retroceso»; positivo con año negativo → «irregular»", () => {
    expect(keys(opp({}, { cagr: -3, annualChanges: [-1, -2] }))).toContain("retroceso");
    expect(keys(opp({}, { cagr: 5, annualChanges: [-4, 15] }))).toContain("irregular");
    expect(keys(opp({}, { cagr: 5, annualChanges: [3, 7] }))).not.toContain("irregular");
  });
  it("«Hueco de cuota» solo con percentil de expansión alto", () => {
    expect(keys(opp({ expansion: 80 }))).toContain("hueco");
    expect(keys(opp({ expansion: 40 }))).not.toContain("hueco");
  });
  it("«Hueco de cuota» depende de la brecha de cuota (percentil de expansión) y exige cuota calculable", () => {
    expect(keys(opp({ expansion: 91 }, { spanishShare: 11.4 }))).toContain("hueco");
    expect(keys(opp({ expansion: 91 }, { spanishShare: null }))).not.toContain("hueco");
  });
  it("poca exportación española y datos con reservas son precauciones", () => {
    expect(keys(opp({ export: LOW_EXPORT_PERCENTILE }))).toContain("pocaexpo");
    expect(keys(opp({}, { quality: "media" }))).toContain("reservas");
    expect(TAG_LEGEND.filter((t) => ["pocaexpo", "reservas", "retroceso", "irregular"].includes(t.key)).every((t) => t.tone === "caution")).toBe(true);
  });
  it("presencia española por cuota mínima; cuota nula no genera etiqueta", () => {
    expect(keys(opp({}, { spanishShare: SPANISH_PRESENCE_SHARE }))).toContain("presencia");
    expect(keys(opp({}, { spanishShare: null }))).not.toContain("presencia");
  });
  it("sin puntuación o incompleta: sin etiquetas ni frase", () => {
    expect(describeOpportunity(opp({}, { complete: false }))).toEqual({ tags: [], why: "" });
    expect(describeOpportunity(opp({}, { score: null }))).toEqual({ tags: [], why: "" });
  });
  it("la frase nombra los dos mayores aportes y añade las precauciones", () => {
    const d = describeOpportunity(opp({ size: 100, growth: 100, expansion: 0, export: 0 }, { cagr: -1 }));
    expect(d.why).toContain("su gran mercado y su crecimiento");
    expect(d.why).toContain("en retroceso");
  });
  it("no promete rentabilidad ni éxito y no modifica la puntuación", () => {
    const o = opp({ size: 95, growth: 95, expansion: 95, export: 95 });
    const before = JSON.stringify(o);
    const d = describeOpportunity(o);
    expect(JSON.stringify(o)).toBe(before);
    expect(JSON.stringify([d, TAG_LEGEND])).not.toMatch(/rentab|garantiz|seguro|éxito/i);
  });
  it("la tabla muestra como máximo 3 etiquetas y conserva una precaución", () => {
    const d = describeOpportunity(opp({ size: 90, growth: 90, expansion: 90, export: 90 }, { quality: "baja", spanishShare: 20 }));
    const s = shortTags(d.tags);
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s.some((t) => t.tone === "caution")).toBe(true);
  });
});

describe("crecimiento excepcional y efecto precio", () => {
  it("avisa de crecimiento excepcional a partir del umbral, no antes", () => {
    expect(keys(opp({}, { cagr: 30 }))).toContain("excepcional");
    expect(keys(opp({}, { cagr: 29.9 }))).not.toContain("excepcional");
    expect(keys(opp({}, { cagr: -40 }))).not.toContain("excepcional");
  });
  it("avisa de posible efecto precio solo si hay pesos y el valor crece 15+ puntos más que el peso", () => {
    expect(keys(opp({}, { cagr: 28, cagrVolume: 5 } as Partial<Opportunity>))).toContain("precio");
    expect(keys(opp({}, { cagr: 28, cagrVolume: 20 } as Partial<Opportunity>))).not.toContain("precio");
    expect(keys(opp({}, { cagr: 28, cagrVolume: null } as Partial<Opportunity>))).not.toContain("precio");
  });
  it("las dos son precauciones y aparecen en la frase", () => {
    const d = describeOpportunity(opp({}, { cagr: 45, cagrVolume: 10 } as Partial<Opportunity>));
    expect(d.tags.filter((t) => ["excepcional", "precio"].includes(t.key)).every((t) => t.tone === "caution")).toBe(true);
    expect(d.why).toContain("crecimiento excepcional");
    expect(d.why).toContain("posible efecto precio");
  });
});
