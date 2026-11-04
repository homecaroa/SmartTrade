import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shipmentOf } from "@/lib/learning/export/costs";
import { answerAndConfirm, chooseVariant, ctxOf, gradeAnswer, newSession, pendingDecision, resolve, variantOf, variantsOf, visibleDecisions, type ExportSession } from "@/lib/learning/export/engine";
import { evaluateExport } from "@/lib/learning/export/evaluation";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { INSURANCE_DEDUCTIBLE } from "@/lib/learning/export/scenarios/incidents";
import { assessRoutes } from "@/lib/learning/logistics/assess";
import type { ExportScenario } from "@/lib/learning/export/types";

/** Propuesta 3 (04/11/2026): banco de incidencias de viaje con variantes deterministas. Importes simulados. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sc = (id: string) => EXPORT_SCENARIOS.find((s) => s.id === id)!;

/** Juega el caso con la variante dada, eligiendo lo mejor salvo lo indicado en `over`. */
function play(s: ExportScenario, variant: string, over: Record<string, string | string[]> = {}): ExportSession {
  let x = chooseVariant(s, newSession(s.id, new Date(0)), variant);
  for (let i = 0; i < 50; i++) {
    const d = pendingDecision(s, x);
    if (!d) return x;
    const ctx = ctxOf(s, x.answers);
    const v = over[d.id] ?? (d.kind === "multi" ? resolve(d.docs, ctx).filter((o) => o.need === "obligatorio" || o.need === "recomendado").map((o) => o.id)
      : d.kind === "route" ? assessRoutes(shipmentOf(s)).best.id : d.kind === "justify" ? [s.logistics.decisiveReason] : resolve(d.best, ctx));
    x = answerAndConfirm(s, x, d.id, v);
  }
  throw new Error("El caso no termina");
}
const incidentLine = (x: ExportSession, s: ExportScenario) => evaluateExport(s, x).economics.lines.filter((l) => l.concept === "incidencia");

describe("variantes", () => {
  it("todos los casos tienen A (la original), B (daño) y C (retraso); los marítimos, también D (retirada tardía)", () => {
    expect(Object.fromEntries(EXPORT_SCENARIOS.map((s) => [s.id, variantsOf(s).join("")]))).toEqual({
      "aceite-alemania": "ABC", "recambios-marruecos": "ABC", "vino-japon": "ABCD", "aceitunas-nueva-york": "ABCD", "perfumes-dubai": "ABCD",
    });
  });
  it("cada variante muestra exactamente una incidencia, en la etapa de entrega y antes del cierre", () => {
    for (const s of EXPORT_SCENARIOS) for (const v of variantsOf(s)) {
      const x = play(s, v);
      const vis = visibleDecisions(s, x.answers);
      const inc = vis.filter((d) => d.incident);
      expect(inc, `${s.id}/${v}`).toHaveLength(1);
      expect(inc[0].stage).toBe("entrega");
      expect(vis.findIndex((d) => d.incident)).toBeLessThan(vis.findIndex((d) => d.id === "cierre"));
    }
  });
  it("sin elegir es la A, así las sesiones anteriores siguen igual; solo se elige antes de empezar", () => {
    const s = sc("vino-japon");
    const fresh = newSession(s.id);
    expect(variantOf(fresh.answers)).toBe("A");
    expect(visibleDecisions(s, fresh.answers).find((d) => d.incident)?.id).toBe("incidencia");
    const started = answerAndConfirm(s, fresh, "verificacion", "acceso");
    expect(chooseVariant(s, started, "B")).toBe(started);
    expect(() => chooseVariant(s, fresh, "Z")).toThrow();
    expect(() => chooseVariant(sc("aceite-alemania"), fresh, "D")).toThrow();
  });
});

describe("consecuencias según el Incoterm y el seguro", () => {
  it("daño con reservas: sin coste si el riesgo era del comprador; franquicia si era del vendedor y estaba asegurado; todo si no", () => {
    const s = sc("aceite-alemania");
    expect(incidentLine(play(s, "B", { incoterm: "FCA", incidencia_b: "reservas" }), s)).toEqual([]);
    expect(incidentLine(play(s, "B", { incoterm: "DAP", insurance: "si", incidencia_b: "reservas" }), s).map((l) => l.amount)).toEqual([INSURANCE_DEDUCTIBLE]);
    const x = play(s, "B", { incoterm: "DAP", insurance: "no", incidencia_b: "reservas" });
    expect(incidentLine(x, s)[0].amount).toBeCloseTo(evaluateExport(s, x).economics.revenue * 0.03, 2);
  });
  it("sin reservas: el comprador con el riesgo pide compartir la mitad; reponer sin reclamar es grave si el seguro lo cubría", () => {
    const s = sc("vino-japon");
    const x = play(s, "B", { incidencia_b: "sin_reservas" });
    expect(incidentLine(x, s)[0].amount).toBeCloseTo(evaluateExport(s, x).economics.revenue * 0.02 * 0.5, 2);
    const d = visibleDecisions(s, { variante: "B" }).find((y) => y.id === "incidencia_b")!;
    expect(gradeAnswer(s, d, { variante: "B", incoterm: "DDP", insurance: "si", incidencia_b: "reponer" })!.grade).toBe("grave");
    expect(gradeAnswer(s, d, { variante: "B", incoterm: "DDP", insurance: "no", incidencia_b: "reponer" })!.grade).toBe("razonable");
  });
  it("retraso: esperar sin avisar cuesta la penalización solo si el vendedor entrega en destino (reglas D)", () => {
    const s = sc("aceitunas-nueva-york");
    const d = play(s, "C", { incoterm: "DDP", incidencia_c: "esperar" });
    expect(incidentLine(d, s)[0].amount).toBeCloseTo(evaluateExport(s, d).economics.revenue * 0.005 * 5, 2);
    const c = play(s, "C", { incoterm: "CIP", incidencia_c: "esperar" });
    expect(incidentLine(c, s)).toEqual([]);
    expect(evaluateExport(s, c).review.find((r) => r.decisionId === "incidencia_c")!.grade).toBe("razonable");
    expect(incidentLine(play(s, "C", { incoterm: "DDP", incidencia_c: "notificar" }), s)).toEqual([]);
  });
  it("retirada tardía: asumirla cuesta días × tarifa × contenedores; repercutirla no cuesta", () => {
    const s = sc("vino-japon");
    expect(incidentLine(play(s, "D", { incidencia_d: "asumir" }), s)[0].amount).toBe(6 * 110 * 1);
    expect(incidentLine(play(s, "D", { incidencia_d: "repercutir" }), s)).toEqual([]);
  });
});

describe("punto de llamada: la pantalla", () => {
  it("el simulador muestra el selector, lo bloquea al empezar y admite ?variante= solo en un caso sin empezar", () => {
    const src = sinComentarios(readFileSync("components/learning/export-simulator.tsx", "utf8"));
    expect(src).toMatch(/<VariantPicker variants=\{variantsOf\(sc\)\} current=\{variantOf\(session\.answers\)\} locked=\{session\.confirmed\.length > 0\}/);
    expect(src).toMatch(/get\("variante"\)/);
    expect(src).toMatch(/!saved\.confirmed\.length && variantsOf\(sc\)\.includes\(v\)/);
    expect(evaluateExport(sc("vino-japon"), play(sc("vino-japon"), "C")).variant).toBe("C");
  });
});
