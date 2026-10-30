import { describe, expect, it } from "vitest";
import { computeOperation, priceForIncoterm, shipmentOf } from "@/lib/learning/export/costs";
import { assessRoutes } from "@/lib/learning/logistics/assess";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { answerAndConfirm, ctxOf, gradeDoc, isExportSession, newSession, pendingDecision, resolve, visibleDecisions, type ExportSession } from "@/lib/learning/export/engine";
import { evaluateExport } from "@/lib/learning/export/evaluation";
import { ACEITE_ALEMANIA } from "@/lib/learning/export/scenarios/aceite-alemania";
import { VINO_JAPON } from "@/lib/learning/export/scenarios/vino-japon";
import { validateOperation } from "@/lib/learning/export/validation";
import type { Decision, ExportScenario } from "@/lib/learning/export/types";

type Picker = (d: Decision, s: ExportSession) => string | string[];
/** Juega un caso entero eligiendo con `pick` (o con `overrides` por id de decisión). */
function play(sc: ExportScenario, overrides: Record<string, string | string[]> = {}, pick: Picker = bestPick(sc)): ExportSession {
  let s = newSession(sc.id, new Date(0));
  for (let i = 0; i < 40; i++) {
    const d = pendingDecision(sc, s);
    if (!d) return s;
    s = answerAndConfirm(sc, s, d.id, overrides[d.id] ?? pick(d, s));
  }
  throw new Error("El caso no termina");
}
function bestPick(sc: ExportScenario): Picker {
  return (d, s) => d.kind === "multi" ? resolve(d.docs, ctxOf(sc, s.answers)).filter((x) => x.need === "obligatorio" || x.need === "recomendado").map((x) => x.id)
    : d.kind === "route" ? assessRoutes(shipmentOf(sc)).best.id
    : d.kind === "justify" ? [sc.logistics.decisiveReason, "plazo"]
    : resolve(d.best, ctxOf(sc, s.answers));
}
function lastPick(sc: ExportScenario): Picker {
  return (d) => d.kind === "multi" || d.kind === "justify" ? [] : d.kind === "route" ? sc.logistics.routes[sc.logistics.routes.length - 1].id : d.options[d.options.length - 1].id;
}

describe("costes: reparto por Incoterm, sin contar dos veces", () => {
  it("el precio sale del escandallo: EXW + costes logísticos estándar del vendedor por unidad", () => {
    // Hasta el 30/10/2026 se comprobaba una cifra fija (50,61 €) porque cada caso tenía un coste de transporte exacto.
    // Desde que la logística sale del motor de rangos, se comprueba la fórmula: EXW + (costes del vendedor sin el
    // embalaje, a valor central, con la ruta estándar) / unidades.
    const r = computeOperation(ACEITE_ALEMANIA, { incoterm: "DAP", transport: "camion_completo", insurance: "si" });
    const sellerLogistics = r.lines.filter((l) => l.payer === "vendedor" && l.concept !== "embalaje").reduce((a, l) => a + l.amount, 0);
    expect(priceForIncoterm(ACEITE_ALEMANIA, "DAP")).toBeCloseTo(48 + sellerLogistics / 1000, 2);
    expect(priceForIncoterm(ACEITE_ALEMANIA, "EXW")).toBe(48);
    expect(priceForIncoterm(ACEITE_ALEMANIA, "FCA")).toBe(48); // puerta a puerta: sin recogida ni terminal en origen
    expect(priceForIncoterm(VINO_JAPON, "FCA")).toBeGreaterThan(33.6); // recogida hasta Valencia y despacho, del vendedor
  });
  it("quién paga cada tramo sale de la tabla de Incoterms", () => {
    const payer = (inc: string, concept: string) => computeOperation(VINO_JAPON, { incoterm: inc, transport: "fcl", packing: "termico", insurance: "si" }).lines.find((l) => l.concept === concept)?.payer;
    expect(payer("CIP", "transporte_principal")).toBe("vendedor");
    expect(payer("FCA", "transporte_principal")).toBe("comprador");
    expect(payer("EXW", "recogida")).toBe("comprador");
    expect(payer("FCA", "recogida")).toBe("vendedor");
    expect(payer("CIP", "ultima_milla")).toBe("comprador");
    expect(payer("DDP", "ultima_milla")).toBe("vendedor");
  });
  it("cada concepto aparece una sola vez y el margen es ingresos − producto − costes del vendedor", () => {
    for (const sc of EXPORT_SCENARIOS) for (const inc of sc.incoterms) {
      const r = computeOperation(sc, { incoterm: inc, insurance: "si", documents: ["declaracion_origen"] });
      const concepts = r.lines.map((l) => l.concept);
      expect(new Set(concepts).size).toBe(concepts.length);
      expect(r.margin).toBeCloseTo(r.revenue - r.productCost - r.sellerCosts, 2);
    }
  });
  it("dentro de la UE no hay despacho, aranceles ni IVA de importación", () => {
    const r = computeOperation(ACEITE_ALEMANIA, { incoterm: "DAP" });
    expect(r.lines.some((l) => ["despacho_exportacion", "despacho_importacion", "arancel", "iva_importacion"].includes(l.concept))).toBe(false);
    expect(r.vat).toBeNull();
    expect(r.customsValue).toBeNull();
  });
  it("fuera de la UE: arancel preferencial solo con prueba de origen, pagado por quien importa", () => {
    const con = computeOperation(VINO_JAPON, { incoterm: "CIP", documents: ["declaracion_origen"] });
    const sin = computeOperation(VINO_JAPON, { incoterm: "CIP", documents: [] });
    expect(con.lines.find((l) => l.concept === "arancel")).toBeUndefined(); // 0 % → no hay línea
    const duty = sin.lines.find((l) => l.concept === "arancel")!;
    expect(duty.payer).toBe("comprador");
    expect(duty.amount).toBeCloseTo(0.15 * sin.customsValue!, 2);
  });
  it("el IVA de importación recuperable no es coste; en DDP sin registro sí lo es", () => {
    const cip = computeOperation(VINO_JAPON, { incoterm: "CIP", documents: ["declaracion_origen"] });
    expect(cip.vat).toMatchObject({ payer: "comprador", recoverable: true });
    expect(cip.lines.some((l) => l.concept === "iva_importacion")).toBe(false);
    const ddp = computeOperation(VINO_JAPON, { incoterm: "DDP", insurance: "si", documents: ["declaracion_origen"] });
    expect(ddp.vat).toMatchObject({ payer: "vendedor", recoverable: false });
    expect(ddp.lines.find((l) => l.concept === "iva_importacion")?.payer).toBe("vendedor");
  });
  it("los cálculos son reproducibles", () => {
    const s = { incoterm: "CIP", transport: "fcl", packing: "termico", payment: "cobro_documentario" as const, documents: ["declaracion_origen"] };
    expect(computeOperation(VINO_JAPON, s)).toEqual(computeOperation(VINO_JAPON, s));
  });
});

describe("motor de decisiones: itinerario adaptado al caso", () => {
  it("si el transporte lo contrata el comprador, no se pregunta el modo de transporte", () => {
    const s = play(ACEITE_ALEMANIA, { incoterm: "FCA" });
    expect(visibleDecisions(ACEITE_ALEMANIA, s.answers).some((d) => d.id === "transport")).toBe(false);
    expect(visibleDecisions(ACEITE_ALEMANIA, play(ACEITE_ALEMANIA).answers).some((d) => d.id === "transport")).toBe(true);
  });
  it("el seguro solo se pregunta cuando el riesgo del viaje es del vendedor sin obligación de asegurar", () => {
    expect(visibleDecisions(ACEITE_ALEMANIA, { incoterm: "DAP" }).some((d) => d.id === "insurance")).toBe(true);
    expect(visibleDecisions(VINO_JAPON, { incoterm: "CIP" }).some((d) => d.id === "insurance")).toBe(false); // obligatorio en CIP
    expect(visibleDecisions(VINO_JAPON, { incoterm: "FCA" }).some((d) => d.id === "insurance")).toBe(false);
  });
  it("en una venta intracomunitaria el DUA de exportación es un error; fuera de la UE, obligatorio (salvo EXW)", () => {
    const docsOf = (sc: ExportScenario, answers: Record<string, string>) => {
      const d = sc.decisions.find((x) => x.id === "documents")!;
      return d.kind === "multi" ? resolve(d.docs, ctxOf(sc, answers)) : [];
    };
    expect(docsOf(ACEITE_ALEMANIA, { incoterm: "DAP" }).find((x) => x.id === "dua_exportacion")?.need).toBe("incorrecto");
    expect(docsOf(VINO_JAPON, { incoterm: "CIP" }).find((x) => x.id === "dua_exportacion")?.need).toBe("obligatorio");
    expect(docsOf(VINO_JAPON, { incoterm: "EXW" }).find((x) => x.id === "dua_exportacion")?.need).toBe("innecesario");
  });
  it("una decisión confirmada no cambia; las opciones inválidas o fuera de turno se rechazan", () => {
    let s = newSession(ACEITE_ALEMANIA.id);
    s = answerAndConfirm(ACEITE_ALEMANIA, s, "verificacion", "vies");
    expect(answerAndConfirm(ACEITE_ALEMANIA, s, "verificacion", "nada").answers.verificacion).toBe("vies");
    expect(() => answerAndConfirm(ACEITE_ALEMANIA, s, "requisito", "no-existe")).toThrow();
    expect(() => answerAndConfirm(ACEITE_ALEMANIA, newSession(ACEITE_ALEMANIA.id), "transport", "aereo")).toThrow(/no aplica/);
  });
  it("la nota de los documentos sigue reglas visibles", () => {
    const docs = [
      { id: "a", label: "A", need: "obligatorio" as const, explain: "x" }, { id: "b", label: "B", need: "recomendado" as const, explain: "x" },
      { id: "c", label: "C", need: "innecesario" as const, explain: "x" }, { id: "d", label: "D", need: "incorrecto" as const, explain: "x" },
    ];
    expect(gradeDoc(docs, ["a", "b"]).grade).toBe("correcta");
    expect(gradeDoc(docs, ["a"]).grade).toBe("razonable");
    expect(gradeDoc(docs, ["a", "b", "c"]).grade).toBe("razonable");
    expect(gradeDoc(docs, ["b"]).grade).toBe("grave");
    expect(gradeDoc(docs, ["a", "b", "d"]).grade).toBe("grave");
  });
  it("las sesiones de otro caso o versión se ignoran", () => {
    const s = newSession("aceite-alemania");
    expect(isExportSession(s, "aceite-alemania")).toBe(true);
    expect(isExportSession(s, "vino-japon")).toBe(false);
    expect(isExportSession({ ...s, v: 1 }, "aceite-alemania")).toBe(false); // v1: secuencia anterior a la etapa de rutas
    expect(isExportSession(null, "aceite-alemania")).toBe(false);
  });
});

describe("incidencias y efecto económico", () => {
  it("callar ante el retraso cuesta 3 días de penalización; avisar, 1 (si el transporte es del vendedor)", () => {
    const cost = (s: ExportSession) => evaluateExport(ACEITE_ALEMANIA, s).economics.lines.find((l) => l.concept === "incidencia")?.amount ?? 0;
    const avisar = cost(play(ACEITE_ALEMANIA, { incidencia: "avisar" }));
    const callar = cost(play(ACEITE_ALEMANIA, { incidencia: "callar" }));
    expect(avisar).toBeCloseTo(0.005 * priceForIncoterm(ACEITE_ALEMANIA, "DAP") * 1000, 2);
    expect(callar).toBeCloseTo(3 * avisar, 1);
    expect(cost(play(ACEITE_ALEMANIA, { incoterm: "FCA", incidencia: "avisar" }))).toBe(0); // transporte del comprador
  });
  it("sin declaración de origen el vendedor compensa el arancel; en DDP no se cuenta dos veces", () => {
    const docsSinOrigen = ["factura", "packing_list", "bl", "dua_exportacion"];
    const cip = evaluateExport(VINO_JAPON, play(VINO_JAPON, { documents: docsSinOrigen }));
    const comp = cip.economics.lines.find((l) => l.concept === "ajuste_comercial")!;
    const sinOrigen = computeOperation(VINO_JAPON, { incoterm: "CIP", documents: [] });
    expect(comp.amount).toBeCloseTo(sinOrigen.lines.find((l) => l.concept === "arancel")!.amount, 2);
    const ddp = evaluateExport(VINO_JAPON, play(VINO_JAPON, { incoterm: "DDP", documents: docsSinOrigen }));
    expect(ddp.economics.lines.filter((l) => l.concept === "ajuste_comercial")).toHaveLength(0);
    expect(ddp.economics.lines.find((l) => l.concept === "arancel")?.payer).toBe("vendedor");
  });
});

describe("evaluación: conocimientos y economía por separado", () => {
  it("el camino recomendado saca 100 y un margen cercano al objetivo; el peor, nota baja y peor margen", () => {
    // Hasta el 30/10/2026 se exigía que el peor camino diera pérdidas. Con el caso de Nueva York ya no es cierto: el peor
    // camino elige EXW, donde el vendedor no paga transporte, y el margen sigue positivo aunque la nota sea casi cero
    // (precisamente lo que el simulador quiere enseñar: margen y conocimientos van por separado). Se exige peor margen.
    for (const sc of EXPORT_SCENARIOS) {
      const best = evaluateExport(sc, play(sc));
      expect(best.knowledge.pct).toBe(100);
      expect(best.graveErrors).toHaveLength(0);
      expect(best.issues).toHaveLength(0);
      expect(Math.abs(best.marginVsTarget)).toBeLessThan(2);
      const worst = evaluateExport(sc, play(sc, {}, lastPick(sc)));
      expect(worst.knowledge.pct).toBeLessThan(30);
      expect(worst.economics.margin).toBeLessThan(best.economics.margin);
    }
  });
  it("una decisión arriesgada puede subir el margen y bajar la nota a la vez", () => {
    const best = evaluateExport(ACEITE_ALEMANIA, play(ACEITE_ALEMANIA));
    const cheapPacking = evaluateExport(ACEITE_ALEMANIA, play(ACEITE_ALEMANIA, { packing: "basico" }));
    expect(cheapPacking.economics.margin).toBeGreaterThan(best.economics.margin);
    expect(cheapPacking.knowledge.pct).toBeLessThan(best.knowledge.pct);
    expect(cheapPacking.graveErrors.map((r) => r.decisionId)).toContain("packing");
  });
  it("las reglas de validación detectan contradicciones entre decisiones", () => {
    expect(validateOperation(ACEITE_ALEMANIA, { incoterm: "CIF", transport: "camion_completo" }).map((i) => i.severity)).toContain("contradiccion");
    expect(validateOperation(ACEITE_ALEMANIA, { documents: ["dua_exportacion"] })[0].severity).toBe("contradiccion");
    expect(validateOperation(ACEITE_ALEMANIA, { transport: "maritimo" }).some((i) => /plazo/.test(i.message))).toBe(true);
    expect(validateOperation(VINO_JAPON, { incoterm: "DDP" }).some((i) => /DDP/.test(i.message))).toBe(true);
    expect(validateOperation(ACEITE_ALEMANIA, { incoterm: "DAP", transport: "camion_completo", packing: "protegido", insurance: "si", payment: "anticipo_30_70" })).toEqual([]);
  });
});
