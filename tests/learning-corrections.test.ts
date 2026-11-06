import { describe, expect, it } from "vitest";
import { shipmentOf } from "@/lib/learning/export/costs";
import { EXPORT_SCENARIOS, exportScenario } from "@/lib/learning/export/scenarios";
import { damageIncident } from "@/lib/learning/export/scenarios/incidents";
import type { DecisionCtx } from "@/lib/learning/export/types";
import { computeQuote, customsBasisOf } from "@/lib/learning/logistics/calculator";
import { RATES } from "@/lib/learning/logistics/params";

/**
 * Regresión de las correcciones del Modo Aprendizaje del 06/11/2026 (fuentes en el propio calculator.ts):
 * 1. EE. UU. valora en aduana sobre el valor de transacción SIN flete ni seguro internacionales (19 U.S.C. §1401a;
 *    19 CFR §152.103); el transporte interior en origen sí entra salvo en EXW.
 * 2. Capital asegurado = 110 % del precio del contrato con transporte hasta destino (Incoterms® 2020, CIP/CIF A5), no
 *    del valor en fábrica.
 * 3. CIF exige como mínimo cláusulas (C); CIP, cláusulas (A). La prima y el texto de las incidencias lo reflejan.
 */
const sc = (id: string) => exportScenario(id)!;
const sum = (q: ReturnType<typeof computeQuote>, cs: string[]) => q.lines.filter((l) => cs.includes(l.concept)).reduce((a, l) => a + l.range.min, 0);
const PRE_ARRIVAL = ["recogida", "terminal_origen", "despacho_exportacion", "transporte_principal", "recargos_flete", "recargo_peligrosa", "transbordos"];

describe("valor en aduana de EE. UU. (base FOB)", () => {
  const s = shipmentOf(sc("aceitunas-nueva-york"));
  const r = sc("aceitunas-nueva-york").logistics.routes[0];
  it("el caso de Nueva York usa base FOB y los demás mercados fuera de la UE, CIF", () => {
    expect(s.market).toBe("US");
    expect(customsBasisOf("US")).toBe("FOB");
    expect(customsBasisOf("JP")).toBe("CIF");
  });
  it("excluye flete y seguro internacionales, incluye los costes en origen", () => {
    const q = computeQuote(s, r, "CIP");
    const expected = s.cargo.valueEur + sum(q, ["recogida", "terminal_origen", "despacho_exportacion"]);
    expect(q.taxes!.customsValue.min).toBeCloseTo(expected, 0);
    // Mutación conceptual: si se sumara el flete principal, la base sería mayor.
    expect(q.taxes!.customsValue.min).toBeLessThan(expected + sum(q, ["transporte_principal"]));
  });
  it("en EXW el transporte interior se factura aparte y no entra", () => {
    expect(computeQuote(s, r, "EXW").taxes!.customsValue.min).toBe(s.cargo.valueEur);
  });
  it("el Incoterm no cambia la base mientras incluya la entrega en origen (FCA = CIP = DDP)", () => {
    const v = (inc: string) => computeQuote(s, r, inc).taxes!.customsValue;
    expect(v("FCA")).toEqual(v("CIP"));
    expect(v("DDP")).toEqual(v("CIP"));
  });
});

describe("seguro: capital asegurado y cláusulas", () => {
  for (const id of ["vino-japon", "perfumes-dubai", "aceitunas-nueva-york"]) {
    const s = shipmentOf(sc(id));
    const r = sc(id).logistics.routes[0];
    it(`${id}: prima CIP = 110 % × (valor + transporte hasta destino) × tipo de cláusulas (A)`, () => {
      const q = computeQuote(s, r, "CIP");
      const insured = 1.1 * (s.cargo.valueEur + sum(q, PRE_ARRIVAL));
      const prima = q.lines.find((l) => l.concept === "seguro")!;
      expect(prima.range.min).toBeCloseTo((insured * RATES.insurancePct.min) / 100, 0);
      expect(prima.note).toMatch(/cláusulas \(A\)/);
      // Antes: 110 % del valor en fábrica. La nueva base es siempre mayor.
      expect(prima.range.min).toBeGreaterThan((1.1 * s.cargo.valueEur * RATES.insurancePct.min) / 100);
    });
    it(`${id}: CIF usa el tipo de cláusulas (C), más barato, y lo dice`, () => {
      const cif = computeQuote(s, r, "CIF").lines.find((l) => l.concept === "seguro")!;
      const cip = computeQuote(s, r, "CIP").lines.find((l) => l.concept === "seguro")!;
      expect(cif.range.max).toBeLessThan(cip.range.max);
      expect(cif.note).toMatch(/cláusulas \(C\)/);
    });
  }
  it("los tipos simulados de cláusulas (C) son menores que los de (A)", () => {
    expect(RATES.insurancePctClausesC.max).toBeLessThan(RATES.insurancePct.max);
    expect(RATES.insurancePctClausesC.min).toBeLessThan(RATES.insurancePct.min);
  });
});

describe("incidencia de daño: cobertura según el Incoterm", () => {
  const ctx = (incoterm: string): DecisionCtx => ({ scenario: sc("vino-japon"), answers: {} as DecisionCtx["answers"], settings: { incoterm, transport: sc("vino-japon").logistics.routes[0].id } });
  const feedback = (inc: string) => {
    const d = damageIncident({ variant: "Z", what: "las cajas", damagedPct: 10, reshipCost: 1000 });
    if (d.kind !== "single") throw new Error("tipo");
    const f = d.options.find((o) => o.id === "reservas")!.feedback;
    return typeof f === "function" ? f(ctx(inc)) : f;
  };
  it("CIP explica la cobertura amplia (cláusulas A)", () => expect(feedback("CIP")).toMatch(/cláusulas A/));
  it("CIF explica que la cobertura mínima (cláusulas C) no cubre roturas por manipulación", () => expect(feedback("CIF")).toMatch(/cláusulas C.*no roturas por manipulación/));
});

describe("coherencia de los casos", () => {
  it("las opciones de seguro hablan del 110 % del precio del contrato, no del valor de la mercancía", () => {
    const text = JSON.stringify(EXPORT_SCENARIOS, (_k, v) => (typeof v === "function" ? undefined : v));
    expect(text).not.toMatch(/110 % del valor/);
  });
});
