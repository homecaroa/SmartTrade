import { describe, expect, it } from "vitest";
import { shipmentOf } from "@/lib/learning/export/costs";
import { answerAndConfirm, ctxOf, gradeAnswer, isExportSession, newSession, pendingDecision, resolve, visibleDecisions, type ExportSession } from "@/lib/learning/export/engine";
import { evaluateExport } from "@/lib/learning/export/evaluation";
import { fxCost, fxOutcome } from "@/lib/learning/export/fx";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { assessRoutes } from "@/lib/learning/logistics/assess";
import type { ExportScenario, FxSetup } from "@/lib/learning/export/types";

/** Propuesta 1 (04/11/2026): divisa de facturación y riesgo de cambio. Tipos simulados y fijos por caso. */
const USD: FxSetup = { currency: "USD", quoteRate: 1.1, collectionRate: 1.16, forwardRate: 1.106, buyerDiscountPct: 2 };

function play(sc: ExportScenario, currency: string): ExportSession {
  let s = newSession(sc.id, new Date(0));
  for (let i = 0; i < 40; i++) {
    const d = pendingDecision(sc, s);
    if (!d) return s;
    const ctx = ctxOf(sc, s.answers);
    const v = d.id === "currency" ? currency : d.kind === "multi" ? resolve(d.docs, ctx).filter((x) => x.need !== "innecesario" && x.need !== "incorrecto").map((x) => x.id)
      : d.kind === "route" ? assessRoutes(shipmentOf(sc)).best.id : d.kind === "justify" ? [sc.logistics.decisiveReason] : resolve(d.best, ctx);
    s = answerAndConfirm(sc, s, d.id, v);
  }
  throw new Error("El caso no termina");
}

describe("fórmulas", () => {
  it("sin cobertura: euros cobrados = factura ÷ tipo al cobrar; con seguro, ÷ tipo a plazo", () => {
    const o = fxOutcome(USD, 100_000, "divisa");
    expect(o.invoice).toBe(110_000);
    expect(o.collectedEur).toBeCloseTo(110_000 / 1.16, 2);
    expect(o.difference).toBeCloseTo(100_000 - 110_000 / 1.16, 2); // ≈ 5.172 € de pérdida
    expect(fxOutcome(USD, 100_000, "divisa_cubierta").difference).toBeCloseTo(100_000 - 110_000 / 1.106, 2); // ≈ 542 €
    expect(fxOutcome(USD, 100_000, "eur").difference).toBe(0);
  });
  it("en euros no hay diferencia de cambio, pero el comprador pide su descuento", () => {
    expect(fxCost(USD, 100_000, "eur")).toMatchObject({ concept: "ajuste_comercial", amount: 2000, payer: "vendedor" });
  });
  it("los puntos a plazo pueden favorecer: con el yen el seguro da una pequeña ganancia (importe negativo)", () => {
    const jp = EXPORT_SCENARIOS.find((s) => s.id === "vino-japon")!.fx!;
    expect(fxCost(jp, 100_000, "divisa_cubierta")!.amount).toBeLessThan(0);
  });
});

describe("en los casos", () => {
  it("solo preguntan la divisa los casos con fx (Japón y Nueva York), no los de la UE ni Marruecos", () => {
    const asks = EXPORT_SCENARIOS.filter((sc) => visibleDecisions(sc, {}).some((d) => d.id === "currency")).map((sc) => sc.id).sort();
    expect(asks).toEqual(["aceitunas-nueva-york", "vino-japon"]);
    for (const sc of EXPORT_SCENARIOS) expect(!!sc.fx).toBe(asks.includes(sc.id));
  });
  it("punto de llamada: la elección cambia la liquidación y el margen de la operación", () => {
    for (const id of ["aceitunas-nueva-york", "vino-japon"]) {
      const sc = EXPORT_SCENARIOS.find((s) => s.id === id)!;
      const ev = (c: string) => evaluateExport(sc, play(sc, c)).economics;
      const open = ev("divisa"), hedged = ev("divisa_cubierta"), eur = ev("eur");
      const line = (r: typeof open) => r.lines.find((l) => l.concept === "diferencia_cambio");
      expect(line(open)?.amount, id).toBeCloseTo(fxOutcome(sc.fx!, open.revenue, "divisa").difference, 2);
      expect(line(eur)).toBeUndefined();
      expect(open.margin, id).toBeLessThan(hedged.margin); // en el caso el euro se aprecia: sin cubrir se pierde
      expect(eur.lines.some((l) => l.label.includes("riesgo de cambio"))).toBe(true);
    }
  });
  it("se califica la gestión del riesgo: cubrir es lo correcto y dejar la posición abierta, un error grave", () => {
    const sc = EXPORT_SCENARIOS.find((s) => s.id === "vino-japon")!;
    const d = visibleDecisions(sc, {}).find((x) => x.id === "currency")!;
    const g = (c: string) => gradeAnswer(sc, d, { currency: c })!.grade;
    expect([g("divisa_cubierta"), g("eur"), g("divisa")]).toEqual(["correcta", "razonable", "grave"]);
  });
  it("las sesiones guardadas antes de la pregunta (v2) se descartan", () => {
    const s = newSession("vino-japon");
    expect(isExportSession(s, "vino-japon")).toBe(true);
    expect(isExportSession({ ...s, v: 2 }, "vino-japon")).toBe(false);
  });
});
