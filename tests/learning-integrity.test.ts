import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { MARKETS } from "@/lib/config/catalog";
import { INCOTERMS } from "@/lib/logistics/incoterms";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { NEGOTIATION_SCENARIOS } from "@/lib/learning/negotiation/scenarios";
import { PAYMENT_TERMS } from "@/lib/learning/payments";
import { SIMULATED_NOTICE } from "@/lib/learning/provenance";

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const LEARNING_SOURCES = [...files("lib/learning"), ...files("components/learning"), ...files("app/aprendizaje")];
/** Quita comentarios para no dar por buena una regla solo porque se explica en prosa. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("datos de los escenarios", () => {
  it("usan productos, mercados e Incoterms que existen en SmarTrade", () => {
    for (const sc of [...EXPORT_SCENARIOS, ...NEGOTIATION_SCENARIOS]) expect(HS_CATALOG.some((e) => e.code === sc.hs6), sc.id).toBe(true);
    for (const sc of EXPORT_SCENARIOS) { expect(MARKETS.some((m) => m.code === sc.destination)).toBe(true); for (const i of sc.incoterms) expect(INCOTERMS.some((x) => x.code === i)).toBe(true); }
    for (const sc of NEGOTIATION_SCENARIOS) { expect(MARKETS.some((m) => m.code === sc.market)).toBe(true); for (const i of sc.allowedIncoterms) expect(INCOTERMS.some((x) => x.code === i)).toBe(true); for (const p of sc.allowedPayments) expect(PAYMENT_TERMS.some((t) => t.id === p)).toBe(true); }
  });
  it("hay casos intracomunitarios y de fuera de la UE", () => {
    const eu = EXPORT_SCENARIOS.map((sc) => MARKETS.find((m) => m.code === sc.destination)?.eu);
    expect(eu).toContain(true);
    expect(eu).toContain(false);
  });
  it("las empresas se identifican como ficticias y cada dato lleva su procedencia", () => {
    for (const sc of [...EXPORT_SCENARIOS, ...NEGOTIATION_SCENARIOS]) {
      expect(sc.company.name).toMatch(/ficticia/);
      expect(sc.buyer.name).toMatch(/ficticia/);
      expect(sc.facts.length).toBeGreaterThan(3);
      for (const f of sc.facts) expect(["real", "supuesto", "estimacion", "verificar"]).toContain(f.prov.kind);
      for (const f of sc.facts.filter((x) => x.prov.kind === "real")) expect(f.prov.source).toBeTruthy();
    }
  });
  it("cada caso de exportación tiene al menos una incidencia y todas sus etapas", () => {
    for (const sc of EXPORT_SCENARIOS) {
      expect(sc.decisions.filter((d) => d.incident).length).toBeGreaterThanOrEqual(1);
      for (const st of ["ficha", "preparacion", "contrato", "logistica", "documentacion", "aduanas", "entrega"]) expect(sc.decisions.some((d) => d.stage === st), `${sc.id}:${st}`).toBe(true);
      for (const d of sc.decisions) if (d.kind === "single" && typeof d.best === "string") expect(d.options.some((o) => o.id === d.best), d.id).toBe(true);
    }
  });
  it("las prioridades del comprador suman 1 y la preparación tiene punto de retirada", () => {
    for (const sc of NEGOTIATION_SCENARIOS) {
      expect(Object.values(sc.hidden.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(sc.prep.some((q) => q.kind === "walkaway")).toBe(true);
      for (const q of sc.prep) if (q.kind === "options") expect(q.options.some((o) => o.id === q.best)).toBe(true);
    }
  });
});

describe("separación y ausencia de servicios externos", () => {
  it("el Modo Aprendizaje no llama a la red ni a ninguna API de IA", () => {
    for (const f of LEARNING_SOURCES) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|generativelanguage|gemini|tavily|Math\.random/i);
    }
  });
  it("el análisis de mercados no importa nada del Modo Aprendizaje", () => {
    for (const f of [...files("lib").filter((p) => !p.startsWith(path.join("lib", "learning"))), ...files("app").filter((p) => !p.startsWith(path.join("app", "aprendizaje")) && !p.endsWith("layout.tsx"))]) {
      expect(sinComentarios(readFileSync(f, "utf8")), f).not.toMatch(/learning/);
    }
  });
  it("las pantallas muestran las opciones con el orden mezclado, no en el orden de los datos", () => {
    for (const f of ["components/learning/export-decision.tsx", "components/learning/negotiation-simulator.tsx"]) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      expect(src, f).toMatch(/displayOrder\(/);
      expect(src, f).not.toMatch(/\b(d|q)\.options\.map\(|resolve\(d\.docs, ctx\)\.map\(/);
    }
  });
  it("el aviso de datos simulados aparece en la portada, en cada simulador y en cada resumen", () => {
    for (const f of ["app/aprendizaje/page.tsx", "components/learning/export-simulator.tsx", "components/learning/negotiation-simulator.tsx", "components/learning/export-summary.tsx", "components/learning/negotiation-summary.tsx"]) {
      expect(sinComentarios(readFileSync(f, "utf8")), f).toMatch(/<SimulatedNotice/);
    }
    expect(SIMULATED_NOTICE).toBe("Datos simulados con fines educativos");
  });
});
