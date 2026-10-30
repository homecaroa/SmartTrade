import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INCOTERMS } from "@/lib/logistics/incoterms";
import { computeOperation, routeOf, shipmentOf } from "@/lib/learning/export/costs";
import { answerAndConfirm, gradeAnswer, newSession, pendingDecision } from "@/lib/learning/export/engine";
import { EXPORT_SCENARIOS, exportScenario } from "@/lib/learning/export/scenarios";
import type { ExportScenario } from "@/lib/learning/export/types";
import { validateOperation } from "@/lib/learning/export/validation";
import { applicability, MULTIMODAL_RULES, payerOf, SEA_ONLY_RULES } from "@/lib/learning/logistics/allocation";
import { assessRoutes, deadlineStatus, gradeJustification, justificationTruth } from "@/lib/learning/logistics/assess";
import { computeQuote, isEuShipment, transitDays } from "@/lib/learning/logistics/calculator";
import { airChargeableKg, containersNeeded, fillRate, lclRevenueTons, roadChargeableKg, trucksNeeded } from "@/lib/learning/logistics/capacity";
import { LOGISTICS_NOTICE } from "@/lib/learning/logistics/params";
import { mid } from "@/lib/learning/logistics/types";

/**
 * Logística integrada en las operaciones de exportación. Hasta el 30/10/2026 estas pruebas cubrían un «Laboratorio de
 * logística» con casos propios; el dueño decidió ese día no tener dos tipos de ejercicio y el motor pasó a la etapa
 * logística de cada operación. Las fórmulas son las mismas; cambian los datos (rutas de los cuatro casos) y el punto
 * de llamada (la exportación), que es lo que se comprueba aquí.
 */
const sc = (id: string) => exportScenario(id)!;
const ship = (id: string) => shipmentOf(sc(id));
const route = (id: string, r: string) => sc(id).logistics.routes.find((x) => x.id === r)!;
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("capacidad y unidades de cobro", () => {
  it("aéreo: peso tasable = máx(real, m³ × 166,7) sin error de coma flotante", () => {
    expect(airChargeableKg({ grossKg: 1100, volumeM3: 9 })).toBe(1500);
    expect(airChargeableKg({ grossKg: 2000, volumeM3: 9 })).toBe(2000);
    expect(airChargeableKg({ grossKg: 10, volumeM3: 0.3 })).toBe(50);
  });
  it("grupaje por carretera: 1 m³ = 333 kg", () => {
    expect(roadChargeableKg({ grossKg: 500, volumeM3: 3 })).toBe(999);
    expect(roadChargeableKg({ grossKg: 14_000, volumeM3: 30 })).toBe(14_000);
  });
  it("LCL: toneladas-volumen W/M = máx(t, m³)", () => {
    expect(lclRevenueTons({ grossKg: 3200, volumeM3: 9 })).toBe(9);
    expect(lclRevenueTons({ grossKg: 12_500, volumeM3: 9 })).toBe(12.5);
  });
  it("FCL: contenedores por volumen o por peso, lo que limite antes", () => {
    expect(containersNeeded({ grossKg: 14_000, volumeM3: 30 }, "20")).toBe(2);
    expect(containersNeeded({ grossKg: 14_000, volumeM3: 30 }, "40")).toBe(1);
    expect(containersNeeded({ grossKg: 30_000, volumeM3: 10 }, "20")).toBe(2);
    expect(containersNeeded({ grossKg: 100, volumeM3: 1 }, "20")).toBe(1);
  });
  it("camión completo: por palés, peso o volumen", () => {
    expect(trucksNeeded({ pallets: 20, grossKg: 17_000, volumeM3: 32 })).toBe(1);
    expect(trucksNeeded({ pallets: 40, grossKg: 10_000, volumeM3: 50 })).toBe(2);
    expect(trucksNeeded({ pallets: 20, grossKg: 30_000, volumeM3: 40 })).toBe(2);
    expect(fillRate({ pallets: 18, grossKg: 14_000, volumeM3: 30 }, "carretera")).toBeCloseTo(14_000 / 24_000, 6); // manda el peso
  });
});

describe("presupuesto logístico de cada caso", () => {
  const ALL = EXPORT_SCENARIOS.flatMap((s) => s.logistics.routes.flatMap((r) => INCOTERMS.map((i) => ({ s, r, code: i.code }))));
  it("ningún concepto aparece dos veces, los rangos son coherentes y los impuestos van aparte", () => {
    for (const { s, r, code } of ALL) {
      const q = computeQuote(shipmentOf(s), r, code);
      const concepts = q.lines.map((l) => l.concept);
      expect(new Set(concepts).size, `${s.id}/${r.id}/${code}`).toBe(concepts.length);
      for (const l of q.lines) { expect(l.range.min).toBeGreaterThanOrEqual(0); expect(l.range.min).toBeLessThanOrEqual(l.range.max); }
      expect(concepts as string[]).not.toContain("aranceles");
      expect(concepts as string[]).not.toContain("iva_importacion");
    }
  });
  it("el Incoterm reparte el coste pero no lo cambia: total = vendedor + comprador, igual en todas las reglas", () => {
    for (const s of EXPORT_SCENARIOS) for (const r of s.logistics.routes) {
      const base = computeQuote(shipmentOf(s), r, "DAP").logistics.total;
      for (const i of INCOTERMS) {
        const q = computeQuote(shipmentOf(s), r, i.code);
        expect(q.logistics.total).toEqual(base);
        expect(q.logistics.seller.min + q.logistics.buyer.min).toBeCloseTo(q.logistics.total.min, 1);
      }
    }
  });
  it("dentro de la UE no hay despachos ni impuestos; fuera, sí", () => {
    const de = ship("aceite-alemania");
    expect(isEuShipment(de)).toBe(true);
    const q = computeQuote(de, route("aceite-alemania", "camion_completo"), "DAP");
    expect(q.lines.map((l) => l.concept)).not.toContain("despacho_exportacion");
    expect(q.taxes).toBeNull();
    expect(computeQuote(ship("recambios-marruecos"), route("recambios-marruecos", "camion_ferry"), "DAP").taxes).not.toBeNull();
  });
  it("arancel = tipo × (valor + flete principal + seguro); el preferencial solo con prueba de origen", () => {
    const s = ship("recambios-marruecos");
    const r = route("recambios-marruecos", "camion_ferry");
    const sin = computeQuote(s, r, "DAP", { originProof: false });
    const main = sin.lines.find((l) => l.concept === "transporte_principal")!.range;
    const ins = sin.lines.find((l) => l.concept === "seguro")!.range;
    expect(sin.taxes!.duty.min).toBeCloseTo((s.cargo.valueEur + main.min + ins.min) * 0.1, 1);
    expect(computeQuote(s, r, "DAP", { originProof: true }).taxes!.duty.max).toBe(0);
  });
  it("sin acuerdo preferencial (Nueva York) la prueba de origen no rebaja el arancel", () => {
    const s = ship("aceitunas-nueva-york");
    const r = route("aceitunas-nueva-york", "fcl");
    expect(computeQuote(s, r, "CIP", { originProof: true }).taxes!.duty).toEqual(computeQuote(s, r, "CIP", { originProof: false }).taxes!.duty);
  });
  it("métricas: por kg, por palé, % logístico y plazo con la preparación", () => {
    for (const s of EXPORT_SCENARIOS) {
      const r = s.logistics.routes[0];
      const q = computeQuote(shipmentOf(s), r, "DAP");
      expect(q.perKg.min).toBeCloseTo(q.logistics.total.min / s.logistics.cargo.grossKg, 2);
      expect(q.perPallet.max).toBeCloseTo(q.logistics.total.max / s.logistics.cargo.pallets, 2);
      expect(q.logisticsPct.min).toBeCloseTo((q.logistics.total.min / (s.exwUnitPrice * s.quantity.units)) * 100, 2);
      expect(q.deliveryDays.max).toBe(transitDays(r).max + s.prepDays);
    }
  });
});

describe("liquidación de la operación con el valor central", () => {
  it("cada línea logística se liquida con el punto medio de su rango y lo dice", () => {
    const r = computeOperation(sc("vino-japon"), { incoterm: "CIP", transport: "fcl", documents: ["declaracion_origen"] });
    const logistic = r.lines.filter((l) => l.range);
    expect(logistic.length).toBeGreaterThan(5);
    for (const l of logistic) {
      expect(l.amount).toBeCloseTo(mid(l.range!), 2);
      expect(l.note).toMatch(/[Vv]alor central/);
    }
  });
  it("el seguro solo entra si la regla obliga (CIP) o el vendedor decide asegurar su riesgo (DAP)", () => {
    const has = (inc: string, insurance?: "si" | "no") => computeOperation(sc("aceitunas-nueva-york"), { incoterm: inc, transport: "fcl", insurance }).lines.some((l) => l.concept === "seguro");
    expect(has("CIP")).toBe(true);
    expect(has("DDP", "si")).toBe(true);
    expect(has("DDP", "no")).toBe(false);
    expect(has("FCA")).toBe(false);
  });
  it("si el transporte es del comprador se presupuesta con la ruta estándar del caso", () => {
    expect(routeOf(sc("vino-japon"), undefined).id).toBe("fcl");
    expect(computeOperation(sc("vino-japon"), { incoterm: "FCA" }).quote.routeId).toBe("fcl");
  });
});

describe("Incoterms frente a la ruta", () => {
  it("solo FAS, FOB, CFR y CIF son marítimas; el resto, multimodales", () => {
    expect([...SEA_ONLY_RULES].sort()).toEqual(["CFR", "CIF", "FAS", "FOB"]);
    expect(MULTIMODAL_RULES).toHaveLength(7);
  });
  it("una regla marítima con camión en ferry, avión o tren es contradicción; con contenedor, aviso", () => {
    expect(applicability("FOB", route("recambios-marruecos", "camion_ferry")).level).toBe("contradiccion");
    expect(applicability("CIF", route("vino-japon", "aereo")).level).toBe("contradiccion");
    expect(applicability("CFR", route("aceite-alemania", "tren")).level).toBe("contradiccion");
    expect(applicability("CIF", route("aceitunas-nueva-york", "fcl")).level).toBe("aviso");
    expect(applicability("CIP", route("aceitunas-nueva-york", "fcl")).level).toBe("ok");
  });
  it("la validación de la operación usa esa misma regla y el plazo de la ruta", () => {
    expect(validateOperation(sc("recambios-marruecos"), { incoterm: "FOB", transport: "camion_ferry" }).map((i) => i.severity)).toContain("contradiccion");
    expect(validateOperation(sc("aceitunas-nueva-york"), { incoterm: "CIF", transport: "fcl" }).map((i) => i.severity)).toContain("aviso");
    expect(validateOperation(sc("aceite-alemania"), { transport: "maritimo" }).some((i) => /plazo/.test(i.message))).toBe(true);
  });
  it("quién paga: recogida solo del comprador en EXW; última milla del vendedor solo en reglas D", () => {
    expect(INCOTERMS.filter((i) => payerOf("recogida", i.code) === "comprador").map((i) => i.code)).toEqual(["EXW"]);
    expect(INCOTERMS.filter((i) => payerOf("ultima_milla", i.code) === "vendedor").map((i) => i.code).sort()).toEqual(["DAP", "DDP", "DPU"]);
    expect(payerOf("seguro", "CIP")).toBe("vendedor");
    expect(payerOf("aranceles", "DDP")).toBe("vendedor");
  });
});

describe("valoración de rutas y justificación", () => {
  const BEST: Record<string, string> = { "aceite-alemania": "camion_completo", "recambios-marruecos": "camion_ferry", "vino-japon": "fcl", "aceitunas-nueva-york": "fcl" };
  it("la mejor ruta es la más barata DE LAS QUE LLEGAN, no la más barata a secas", () => {
    for (const s of EXPORT_SCENARIOS) expect(assessRoutes(shipmentOf(s)).best.id, s.id).toBe(BEST[s.id]);
    // Casablanca: el grupaje con ferry es más barato que el camión completo, pero solo llega si todo va bien.
    const m = assessRoutes(ship("recambios-marruecos")).all;
    expect(m.find((a) => a.route.id === "grupaje_ferry")!.cost).toBeLessThan(m.find((a) => a.route.id === "camion_ferry")!.cost);
    expect(m.find((a) => a.route.id === "grupaje_ferry")!.status).toBe("riesgo");
  });
  it("lo que no llega es error importante; pagar más de 3× sin necesidad, también", () => {
    expect(deadlineStatus(ship("aceite-alemania"), route("aceite-alemania", "maritimo"))).toBe("no_llega");
    for (const s of EXPORT_SCENARIOS) expect(assessRoutes(shipmentOf(s)).all.find((a) => a.route.modality === "aereo")!.grade, s.id).toBe("grave");
  });
  it("fuera de la UE se explican las alternativas no viables", () => {
    for (const id of ["recambios-marruecos", "vino-japon", "aceitunas-nueva-york"]) expect(ship(id).infeasible.length).toBeGreaterThan(0);
  });
  it("justificación: vacía o falsa es error; cierta sin el motivo decisivo, razonable", () => {
    const s = ship("recambios-marruecos");
    expect(gradeJustification(s, "camion_ferry", []).grade).toBe("grave");
    expect(justificationTruth(s, "camion_ferry").mas_barata).toBe(false);
    expect(gradeJustification(s, "camion_ferry", ["mas_barata"]).grade).toBe("grave");
    expect(gradeJustification(s, "camion_ferry", ["barata_que_cumple"]).grade).toBe("razonable");
    expect(gradeJustification(s, "camion_ferry", ["plazo", "barata_que_cumple"]).grade).toBe("correcta");
  });
});

describe("punto de llamada: la etapa logística de la operación", () => {
  const toLogistics = (s: ExportScenario) => {
    let ses = newSession(s.id, new Date(0));
    for (let i = 0; i < 20; i++) {
      const d = pendingDecision(s, ses)!;
      if (d.kind === "route") return ses;
      const best = d.kind === "single" ? (typeof d.best === "string" ? d.best : d.options[0].id) : [];
      ses = answerAndConfirm(s, ses, d.id, best);
    }
    throw new Error("No llega a la etapa logística");
  };
  it("en los cuatro casos se elige ruta y se justifica, y se corrige con el motor de logística", () => {
    for (const s of EXPORT_SCENARIOS) {
      let ses = toLogistics(s);
      expect(() => answerAndConfirm(s, ses, "transport", "teletransporte")).toThrow();
      const worstRoute = assessRoutes(shipmentOf(s)).all.find((a) => a.grade === "grave")!.route.id;
      const bad = answerAndConfirm(s, ses, "transport", worstRoute);
      expect(gradeAnswer(s, s.decisions.find((d) => d.id === "transport")!, bad.answers)!.grade).toBe("grave");
      ses = answerAndConfirm(s, ses, "transport", BEST_OF(s));
      expect(pendingDecision(s, ses)!.kind).toBe("justify");
      expect(() => answerAndConfirm(s, ses, "justificacion", ["inventado"])).toThrow();
      ses = answerAndConfirm(s, ses, "justificacion", [s.logistics.decisiveReason, "plazo"]);
      expect(gradeAnswer(s, s.decisions.find((d) => d.id === "justificacion")!, ses.answers)!.grade, s.id).toBe("correcta");
      expect(computeOperation(s, { incoterm: ses.answers.incoterm as string, transport: ses.answers.transport as string }).quote.routeId).toBe(BEST_OF(s));
    }
  });
});
const BEST_OF = (s: ExportScenario) => assessRoutes(shipmentOf(s)).best.id;

describe("integración: un solo tipo de ejercicio", () => {
  it("el laboratorio independiente ya no existe y sus enlaces redirigen a la portada", () => {
    expect(existsSync("app/aprendizaje/logistica")).toBe(false);
    expect(existsSync("components/learning/logistics-lab.tsx")).toBe(false);
    expect(sinComentarios(readFileSync("next.config.mjs", "utf8"))).toMatch(/source: "\/aprendizaje\/logistica\/:caso", destination: "\/aprendizaje"/);
    expect(sinComentarios(readFileSync("app/aprendizaje/page.tsx", "utf8"))).not.toMatch(/logistica/);
  });
  it("cubre los destinos pedidos: Alemania, Marruecos, EE. UU. y Japón, con dificultad progresiva", () => {
    expect(EXPORT_SCENARIOS.map((s) => s.destination)).toEqual(["DE", "MA", "JP", "US"]);
    expect(EXPORT_SCENARIOS.map((s) => s.difficulty)).toEqual(["básica", "media", "media", "avanzada"]);
  });
  it("la tabla de rutas lleva el aviso de estimaciones y muestra las opciones mezcladas", () => {
    expect(LOGISTICS_NOTICE).toBe("Estimaciones simuladas con fines educativos");
    const src = sinComentarios(readFileSync("components/learning/export-decision.tsx", "utf8"));
    expect(src).toMatch(/<LogisticsNotice/);
    expect(src).toMatch(/displayOrder\(shipment\.routes/);
    expect(src).not.toMatch(/shipment\.routes\.map\(/);
    expect(sinComentarios(readFileSync("components/learning/export-simulator.tsx", "utf8"))).toMatch(/<QuoteView/);
  });
});
