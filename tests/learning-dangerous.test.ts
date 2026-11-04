import { describe, expect, it } from "vitest";
import { computeOperation, routeOf, shipmentOf } from "@/lib/learning/export/costs";
import { answerAndConfirm, ctxOf, gradeAnswer, newSession, pendingDecision, resolve, visibleDecisions, type ExportSession } from "@/lib/learning/export/engine";
import { evaluateExport } from "@/lib/learning/export/evaluation";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { PERFUMES_DUBAI as P } from "@/lib/learning/export/scenarios/perfumes-dubai";
import { BATERIAS_MEXICO as B } from "@/lib/learning/export/scenarios/baterias-mexico";
import { assessRoutes } from "@/lib/learning/logistics/assess";
import { computeQuote } from "@/lib/learning/logistics/calculator";
import { DANGEROUS } from "@/lib/learning/logistics/params";
import type { MultiDecision } from "@/lib/learning/export/types";

/** Propuesta 4 (04/11/2026): mercancía peligrosa dentro de las operaciones. Caso de perfumes (UN 1266, clase 3). */
function play(over: Record<string, string | string[]> = {}): ExportSession {
  let x = newSession(P.id, new Date(0));
  for (let i = 0; i < 50; i++) {
    const d = pendingDecision(P, x);
    if (!d) return x;
    const ctx = ctxOf(P, x.answers);
    const v = over[d.id] ?? (d.kind === "multi" ? resolve(d.docs, ctx).filter((o) => o.need === "obligatorio" || o.need === "recomendado").map((o) => o.id)
      : d.kind === "route" ? assessRoutes(shipmentOf(P)).best.id : d.kind === "justify" ? [P.logistics.decisiveReason, "plazo"] : resolve(d.best, ctx));
    x = answerAndConfirm(P, x, d.id, v);
  }
  throw new Error("El caso no termina");
}
const docsFor = (answers: Record<string, string>) => resolve((P.decisions.find((d) => d.id === "documents") as MultiDecision).docs, ctxOf(P, answers));

describe("el motor logístico con mercancía peligrosa", () => {
  it("solo el caso de perfumes lleva carga peligrosa, identificada con número ONU, clase y grupo de embalaje", () => {
    expect(EXPORT_SCENARIOS.filter((s) => s.logistics.cargo.dangerous).map((s) => s.id)).toEqual(["perfumes-dubai", "baterias-mexico"]);
    expect(P.logistics.cargo).toMatchObject({ goods: "peligrosa", dangerous: { un: "UN 1266", hazardClass: "3" } });
  });
  it("recargo por mercancía peligrosa según la modalidad, pagado por quien paga el flete; en los demás casos no hay", () => {
    const sur = (route: string, inc = "CIP") => computeQuote(shipmentOf(P), routeOf(P, route), inc).lines.find((l) => l.concept === "recargo_peligrosa");
    expect(sur("fcl")!.range).toEqual(DANGEROUS.perContainer);
    expect(sur("lcl")!.range).toEqual({ min: DANGEROUS.perRevenueTon.min * 9, max: DANGEROUS.perRevenueTon.max * 9 }); // 9 m³ > 2,4 t
    expect(sur("aereo")!.range).toEqual(DANGEROUS.airPerShipment);
    expect(sur("fcl", "FCA")!.payer).toBe("comprador");
    for (const s of EXPORT_SCENARIOS.filter((x) => !x.logistics.cargo.dangerous)) for (const r of s.logistics.routes)
      expect(computeQuote(shipmentOf(s), r, "CIP").lines.some((l) => l.concept === "recargo_peligrosa"), s.id).toBe(false);
  });
  it("la mejor ruta es el contenedor: el grupaje es más barato pero no asegura el plazo y el avión de carga cuesta más del triple", () => {
    const a = assessRoutes(shipmentOf(P)).all;
    expect(a.find((x) => x.route.id === "fcl")!.grade).toBe("correcta");
    expect(a.find((x) => x.route.id === "lcl")).toMatchObject({ status: "riesgo", grade: "razonable" });
    expect(a.find((x) => x.route.id === "aereo")!.grade).toBe("grave");
  });
});

describe("decisiones propias de la mercancía peligrosa", () => {
  it("la reserva como peligrosa solo se pregunta si el transporte es del vendedor; ocultarla es grave y cuesta", () => {
    expect(visibleDecisions(P, { incoterm: "FCA" }).some((d) => d.id === "reserva_peligrosa")).toBe(false);
    const x = play({ reserva_peligrosa: "general" });
    const ev = evaluateExport(P, x);
    expect(ev.review.find((r) => r.decisionId === "reserva_peligrosa")!.grade).toBe("grave");
    expect(ev.economics.lines.some((l) => l.label.includes("Rechazo en terminal"))).toBe(true);
  });
  it("documentos: declaración de mercancías peligrosas siempre; certificado de arrumazón solo en contenedor completo; por avión, la declaración IATA", () => {
    const fcl = docsFor({ incoterm: "CIP", transport: "fcl" });
    expect(fcl.find((d) => d.id === "dgd")).toMatchObject({ need: "obligatorio", label: expect.stringMatching(/IMDG/) });
    expect(fcl.find((d) => d.id === "arrumazon")!.need).toBe("obligatorio");
    expect(docsFor({ incoterm: "CIP", transport: "lcl" }).find((d) => d.id === "arrumazon")!.need).toBe("innecesario");
    expect(docsFor({ incoterm: "CIP", transport: "aereo" }).find((d) => d.id === "dgd")!.label).toMatch(/IATA/);
  });
  it("el número ONU no es el código arancelario; la incidencia A ocurre con cualquier Incoterm (el etiquetado es del expedidor)", () => {
    const d = P.decisions.find((x) => x.id === "clasificacion")!;
    expect(gradeAnswer(P, d, { clasificacion: "1266" })!.grade).toBe("grave");
    expect(visibleDecisions(P, { incoterm: "FCA" }).some((x) => x.id === "incidencia")).toBe(true);
  });
  it("lo que es norma se marca «verificar»; el número ONU y la clase, real con su fuente", () => {
    expect(P.facts.find((f) => f.label === "Mercancía peligrosa")!.prov).toMatchObject({ kind: "real", source: expect.stringMatching(/ONU/) });
    for (const l of ["Grupo de embalaje", "Normas de transporte"]) expect(P.facts.find((f) => f.label === l)!.prov.kind).toBe("verificar");
  });
  it("jugado bien, el caso cumple su margen objetivo y no deja contradicciones", () => {
    const ev = evaluateExport(P, play());
    expect(ev.knowledge.pct).toBe(100);
    expect(ev.economics.marginPct).toBeGreaterThanOrEqual(P.targetMarginPct);
    expect(ev.issues.filter((i) => i.severity === "contradiccion")).toEqual([]);
    expect(computeOperation(P, ctxOf(P, play().answers).settings).lines.some((l) => l.concept === "recargo_peligrosa")).toBe(true);
  });
});

describe("baterías de litio (UN 3480, clase 9)", () => {
  const sc = B;
  function playB(over: Record<string, string | string[]> = {}): ExportSession {
    let x = newSession(sc.id, new Date(0));
    for (let i = 0; i < 50; i++) {
      const d = pendingDecision(sc, x);
      if (!d) return x;
      const ctx = ctxOf(sc, x.answers);
      const v = over[d.id] ?? (d.kind === "multi" ? resolve(d.docs, ctx).filter((o) => o.need === "obligatorio" || o.need === "recomendado").map((o) => o.id)
        : d.kind === "route" ? assessRoutes(shipmentOf(sc)).best.id : d.kind === "justify" ? [sc.logistics.decisiveReason, "plazo"] : resolve(d.best, ctx));
      x = answerAndConfirm(sc, x, d.id, v);
    }
    throw new Error("El caso no termina");
  }
  it("comparte la reserva como peligrosa con el caso de perfumes y añade lo propio del litio", () => {
    expect(sc.decisions.find((d) => d.id === "reserva_peligrosa")).toBe(P.decisions.find((d) => d.id === "reserva_peligrosa"));
    const d = sc.decisions.find((x) => x.id === "requisito")!;
    expect(gradeAnswer(sc, d, { requisito: "carga_30" })!.grade).toBe("correcta");
    expect(gradeAnswer(sc, d, { requisito: "pasajeros" })!.grade).toBe("grave");
  });
  it("el resumen de ensayos 38.3 y la prueba de origen son obligatorios; sin prueba de origen se compensa el arancel general", () => {
    const docs = resolve((sc.decisions.find((d) => d.id === "documents") as MultiDecision).docs, ctxOf(sc, { incoterm: "DAP", transport: "fcl" }));
    for (const id of ["ensayos_383", "prueba_origen", "dgd", "arrumazon"]) expect(docs.find((d) => d.id === id)!.need, id).toBe("obligatorio");
    const withProof = playB(), without = playB({ documents: docs.filter((d) => d.need === "obligatorio" && d.id !== "prueba_origen").map((d) => d.id) });
    const comp = evaluateExport(sc, without).economics.lines.find((l) => l.label.startsWith("Compensación al comprador"));
    expect(comp!.amount).toBeGreaterThan(0);
    expect(evaluateExport(sc, withProof).economics.lines.some((l) => l.label.startsWith("Compensación al comprador"))).toBe(false);
  });
  it("jugado bien cumple su margen; mandar la batería dañada es grave y cuesta", () => {
    const ev = evaluateExport(sc, playB());
    expect(ev.knowledge.pct).toBe(100);
    expect(ev.economics.marginPct).toBeGreaterThanOrEqual(sc.targetMarginPct);
    const bad = evaluateExport(sc, playB({ incidencia: "enviar" }));
    expect(bad.review.find((r) => r.decisionId === "incidencia")!.grade).toBe("grave");
    expect(bad.economics.margin).toBeLessThan(ev.economics.margin);
  });
});
