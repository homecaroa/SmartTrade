import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { MARKETS } from "@/lib/config/catalog";
import { INCOTERMS } from "@/lib/logistics/incoterms";
import { applicability, MULTIMODAL_RULES, payerOf, SEA_ONLY_RULES } from "@/lib/learning/logistics/allocation";
import { assessRoutes, deadlineStatus, gradeJustification, justificationTruth } from "@/lib/learning/logistics/assess";
import { computeQuote, isEuCase, transitDays } from "@/lib/learning/logistics/calculator";
import { airChargeableKg, containersNeeded, fillRate, lclRevenueTons, roadChargeableKg, trucksNeeded } from "@/lib/learning/logistics/capacity";
import { LOGISTICS_CASES, logisticsCase } from "@/lib/learning/logistics/cases";
import { evaluateLogistics, gradeIncoterm } from "@/lib/learning/logistics/evaluation";
import { LOGISTICS_NOTICE } from "@/lib/learning/logistics/params";
import { chooseIncident, chooseIncoterm, chooseRoute, isLogisticsSession, newLogisticsSession, next, type LogisticsSession } from "@/lib/learning/logistics/session";
import type { LogisticsCase } from "@/lib/learning/logistics/types";

const caso = (id: string) => logisticsCase(id)!;
const route = (c: LogisticsCase, id: string) => c.routes.find((r) => r.id === id)!;
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("capacidad y unidades de cobro", () => {
  it("aéreo: peso tasable = máx(real, m³ × 166,7) sin error de coma flotante", () => {
    expect(airChargeableKg({ grossKg: 1100, volumeM3: 9 })).toBe(1500); // ligera: manda el volumen
    expect(airChargeableKg({ grossKg: 2000, volumeM3: 9 })).toBe(2000); // densa: manda el peso
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
    expect(containersNeeded({ grossKg: 30_000, volumeM3: 10 }, "20")).toBe(2); // limita el peso (25 t)
    expect(containersNeeded({ grossKg: 100, volumeM3: 1 }, "20")).toBe(1);
  });
  it("camión completo: por palés, peso o volumen", () => {
    expect(trucksNeeded({ pallets: 18, grossKg: 14_000, volumeM3: 30 })).toBe(1);
    expect(trucksNeeded({ pallets: 40, grossKg: 10_000, volumeM3: 50 })).toBe(2);
    expect(trucksNeeded({ pallets: 20, grossKg: 30_000, volumeM3: 40 })).toBe(2);
    expect(fillRate({ pallets: 18, grossKg: 14_000, volumeM3: 30 }, "carretera")).toBeCloseTo(14_000 / 24_000, 6); // manda el peso, no los palés
  });
});

describe("presupuesto logístico", () => {
  const ALL = LOGISTICS_CASES.flatMap((c) => c.routes.flatMap((r) => INCOTERMS.map((i) => ({ c, r, code: i.code }))));

  it("ningún concepto aparece dos veces y todos los rangos son mín ≤ máx y no negativos", () => {
    for (const { c, r, code } of ALL) {
      const q = computeQuote(c, r, code);
      const concepts = q.lines.map((l) => l.concept);
      expect(new Set(concepts).size, `${c.id}/${r.id}/${code}`).toBe(concepts.length);
      for (const l of q.lines) { expect(l.range.min).toBeGreaterThanOrEqual(0); expect(l.range.min).toBeLessThanOrEqual(l.range.max); }
      expect(concepts).not.toContain("aranceles");
      expect(concepts).not.toContain("iva_importacion");
    }
  });
  it("el Incoterm reparte el coste pero no lo cambia: total = vendedor + comprador, igual en todas las reglas", () => {
    for (const c of LOGISTICS_CASES) for (const r of c.routes) {
      const base = computeQuote(c, r, "DAP").logistics.total;
      for (const i of INCOTERMS) {
        const q = computeQuote(c, r, i.code);
        expect(q.logistics.total).toEqual(base);
        expect(q.logistics.seller.min + q.logistics.buyer.min).toBeCloseTo(q.logistics.total.min, 1);
        expect(q.logistics.seller.max + q.logistics.buyer.max).toBeCloseTo(q.logistics.total.max, 1);
      }
    }
  });
  it("EXW: el vendedor no paga logística; DDP: lo paga todo, incluidos aranceles e impuestos, sin recuperar el IVA", () => {
    const c = caso("sevilla-tokio");
    const exw = computeQuote(c, route(c, "aereo"), "EXW");
    expect(exw.logistics.seller).toEqual({ min: 0, max: 0 });
    const ddp = computeQuote(c, route(c, "aereo"), "DDP");
    expect(ddp.logistics.buyer).toEqual({ min: 0, max: 0 });
    expect(ddp.taxes?.vatPayer).toBe("vendedor");
    expect(ddp.taxes?.vatRecoverable).toBe(false);
    expect(ddp.margin.max).toBeLessThan(computeQuote(c, route(c, "aereo"), "DAP").margin.max - ddp.taxes!.vat.min + 1);
  });
  it("dentro de la UE no hay despachos ni impuestos de importación", () => {
    const c = caso("sevilla-munich");
    expect(isEuCase(c)).toBe(true);
    const q = computeQuote(c, route(c, "camion"), "DAP");
    expect(q.lines.map((l) => l.concept)).not.toContain("despacho_exportacion");
    expect(q.lines.map((l) => l.concept)).not.toContain("despacho_importacion");
    expect(q.taxes).toBeNull();
  });
  it("aranceles e impuestos van aparte y el IVA recuperable no encarece la unidad entregada", () => {
    const c = caso("sevilla-casablanca");
    const q = computeQuote(c, route(c, "camion_ferry"), "DAP");
    expect(q.taxes?.vatRecoverable).toBe(true);
    expect(q.taxes!.vat.min).toBeGreaterThan(0);
    const expected = (c.cargo.valueEur + q.logistics.total.min + q.taxes!.duty.min) / c.cargo.units;
    expect(q.deliveredCostPerUnit.min).toBeCloseTo(expected, 2);
  });
  it("arancel = tipo preferencial × (valor + flete principal + seguro)", () => {
    const c = caso("sevilla-nueva-york");
    const q = computeQuote(c, route(c, "fcl"), "CIP");
    const main = q.lines.find((l) => l.concept === "transporte_principal")!.range;
    const ins = q.lines.find((l) => l.concept === "seguro")!.range;
    expect(q.taxes!.duty.min).toBeCloseTo((c.cargo.valueEur + main.min + ins.min) * (c.dutyPct!.preferential / 100), 1);
  });
  it("métricas y margen salen de las fórmulas declaradas", () => {
    for (const c of LOGISTICS_CASES) {
      const q = computeQuote(c, route(c, c.routes[0].id), c.agreed.incoterm);
      expect(q.perKg.min).toBeCloseTo(q.logistics.total.min / c.cargo.grossKg, 2);
      expect(q.perPallet.max).toBeCloseTo(q.logistics.total.max / c.cargo.pallets, 2);
      expect(q.logisticsPct.min).toBeCloseTo((q.logistics.total.min / c.cargo.valueEur) * 100, 2);
      const revenue = c.agreed.unitPrice * c.cargo.units;
      const sellerTaxes = q.taxes && q.taxes.vatPayer === "vendedor" ? q.taxes.duty.max + (q.taxes.vatRecoverable ? 0 : q.taxes.vat.max) : 0;
      expect(q.margin.min).toBeCloseTo(revenue - c.unitCost * c.cargo.units - q.logistics.seller.max - sellerTaxes, 1);
      expect(q.deliveryDays.max).toBe(transitDays(route(c, c.routes[0].id)).max + c.prepDays);
    }
  });
  it("el aéreo cobra por peso tasable: en Tokio, 1.500 kg tasables con 1.100 kg reales", () => {
    const c = caso("sevilla-tokio");
    expect(computeQuote(c, route(c, "aereo"), "CPT").equipment.units).toBe(1500);
  });
});

describe("Incoterms aplicados a la ruta", () => {
  it("solo FAS, FOB, CFR y CIF son marítimas; el resto, multimodales", () => {
    expect(SEA_ONLY_RULES.sort()).toEqual(["CFR", "CIF", "FAS", "FOB"]);
    expect(MULTIMODAL_RULES).toHaveLength(7);
  });
  it("una regla marítima con camión en ferry, avión o tren es contradicción", () => {
    expect(applicability("FOB", route(caso("sevilla-casablanca"), "camion_ferry")).level).toBe("contradiccion");
    expect(applicability("CIF", route(caso("sevilla-tokio"), "aereo")).level).toBe("contradiccion");
    expect(applicability("CFR", route(caso("sevilla-munich"), "tren")).level).toBe("contradiccion");
    expect(gradeIncoterm(caso("sevilla-tokio"), "aereo", "CIF").grade).toBe("grave");
  });
  it("con contenedores, FOB/CFR/CIF son válidas pero con aviso (mejor FCA, CPT o CIP)", () => {
    const ny = caso("sevilla-nueva-york");
    expect(applicability("CIF", route(ny, "fcl")).level).toBe("aviso");
    expect(applicability("CIP", route(ny, "fcl")).level).toBe("ok");
    expect(gradeIncoterm(ny, "fcl", "CIF").grade).toBe("razonable");
    expect(gradeIncoterm(ny, "fcl", "CIP").grade).toBe("correcta");
  });
  it("quién paga: recogida solo del comprador en EXW; última milla del vendedor solo en reglas D", () => {
    expect(INCOTERMS.filter((i) => payerOf("recogida", i.code) === "comprador").map((i) => i.code)).toEqual(["EXW"]);
    expect(INCOTERMS.filter((i) => payerOf("ultima_milla", i.code) === "vendedor").map((i) => i.code).sort()).toEqual(["DAP", "DDP", "DPU"]);
    expect(payerOf("seguro", "CIP")).toBe("vendedor");
    expect(payerOf("seguro", "CPT")).toBe("comprador");
    expect(payerOf("aranceles", "DDP")).toBe("vendedor");
    expect(payerOf("aranceles", "DAP")).toBe("comprador");
  });
});

describe("valoración de alternativas", () => {
  const BEST = { "sevilla-munich": "camion", "sevilla-casablanca": "camion_ferry", "sevilla-nueva-york": "fcl", "sevilla-tokio": "aereo" } as const;
  it("la mejor ruta es la más barata DE LAS QUE LLEGAN, no la más barata a secas", () => {
    for (const c of LOGISTICS_CASES) expect(assessRoutes(c).best.id, c.id).toBe(BEST[c.id as keyof typeof BEST]);
    // Múnich: el contenedor por mar es más barato que el camión, pero no llega.
    const m = assessRoutes(caso("sevilla-munich")).all;
    expect(m.find((a) => a.route.id === "fcl")!.cost).toBeLessThan(m.find((a) => a.route.id === "camion")!.cost);
    expect(m.find((a) => a.route.id === "fcl")!.grade).toBe("grave");
    // Tokio: el avión es la opción más cara y aun así la correcta.
    const t = assessRoutes(caso("sevilla-tokio")).all;
    expect(t.find((a) => a.route.id === "aereo")!.cost).toBe(Math.max(...t.map((a) => a.cost)));
  });
  it("lo que no cumple el plazo se marca así, y pagar más de 3× sin necesidad es error", () => {
    expect(deadlineStatus(caso("sevilla-tokio"), route(caso("sevilla-tokio"), "lcl"))).toBe("no_llega");
    expect(assessRoutes(caso("sevilla-munich")).all.find((a) => a.route.id === "aereo")!.grade).toBe("grave");
  });
  it("hay alternativas no viables explicadas fuera de la UE", () => {
    for (const id of ["sevilla-casablanca", "sevilla-nueva-york", "sevilla-tokio"]) expect(caso(id).infeasible.length).toBeGreaterThan(0);
  });
  it("justificación: vacía o falsa es error; cierta sin el motivo decisivo, razonable", () => {
    const c = caso("sevilla-tokio");
    expect(gradeJustification(c, "aereo", []).grade).toBe("grave");
    expect(justificationTruth(c, "aereo").mas_barata).toBe(false);
    expect(gradeJustification(c, "aereo", ["mas_barata"]).grade).toBe("grave");
    expect(gradeJustification(c, "aereo", ["mas_rapida"]).grade).toBe("razonable");
    expect(gradeJustification(c, "aereo", ["plazo", "mas_rapida"]).grade).toBe("correcta");
  });
});

describe("incidencias según el Incoterm", () => {
  it("un daño en ruta lo soporta quien tiene el riesgo: vendedor en DAP, comprador en FCA", () => {
    const c = caso("sevilla-munich");
    const holder = (code: string) => c.incident(c, route(c, "camion"), code).options.find((o) => o.id === "reservas")!.cost!.payer;
    expect(holder("DAP")).toBe("vendedor");
    expect(holder("FCA")).toBe("comprador");
    expect(holder("CPT")).toBe("comprador");
  });
  it("la penalización por retraso solo se aplica al vendedor en las reglas D", () => {
    const c = caso("sevilla-munich");
    const callar = (code: string) => c.incident(c, route(c, "fcl"), code).options.find((o) => o.id === "callar")!.cost;
    expect(callar("DAP")?.amount).toBeGreaterThan(0);
    expect(callar("FCA")).toBeNull();
    expect(callar("CPT")).toBeNull();
  });
  it("cada incidencia tiene una mejor opción que existe", () => {
    for (const c of LOGISTICS_CASES) for (const r of c.routes) for (const code of ["FCA", "CPT", "DAP", "DDP"]) {
      const inc = c.incident(c, r, code);
      expect(inc.options.some((o) => o.id === inc.best), `${c.id}/${r.id}/${code}`).toBe(true);
    }
  });
});

describe("sesión y evaluación", () => {
  const play = (c: LogisticsCase, routeId: string, reasons: Parameters<typeof chooseRoute>[3], code: string, own: string, pick: (s: LogisticsSession) => string) => {
    let s = newLogisticsSession(c.id, new Date("2026-10-30T00:00:00Z"));
    s = next(next(s));
    s = next(chooseRoute(c, s, routeId, reasons));
    s = next(chooseIncoterm(s, code, own));
    s = next(s);
    s = next(chooseIncident(c, s, pick(s)));
    return s;
  };
  it("no avanza sin decidir, no cambia una decisión tomada y rechaza opciones inexistentes", () => {
    const c = caso("sevilla-munich");
    let s = next(next(newLogisticsSession(c.id)));
    expect(s.step).toBe("seleccion");
    expect(next(s)).toBe(s);
    expect(() => chooseRoute(c, s, "teletransporte", [])).toThrow();
    s = chooseRoute(c, s, "camion", ["plazo"]);
    expect(chooseRoute(c, s, "aereo", [])).toBe(s);
    expect(() => chooseIncoterm({ ...next(s) }, "XYZ", "contrato")).toThrow();
  });
  it("solo acepta sesiones guardadas del mismo caso y versión", () => {
    const s = newLogisticsSession("sevilla-munich");
    expect(isLogisticsSession(s, "sevilla-munich")).toBe(true);
    expect(isLogisticsSession(s, "sevilla-tokio")).toBe(false);
    expect(isLogisticsSession({ ...s, v: 2 }, "sevilla-munich")).toBe(false);
  });
  it("el camino correcto saca 100 % de conocimientos en todos los casos", () => {
    const DECISIVE_PLUS = { "sevilla-munich": ["barata_que_cumple", "plazo"], "sevilla-casablanca": ["plazo", "barata_que_cumple"], "sevilla-nueva-york": ["aprovecha_capacidad", "plazo"], "sevilla-tokio": ["plazo", "mas_rapida"] } as const;
    for (const c of LOGISTICS_CASES) {
      const best = assessRoutes(c).best;
      const s = play(c, best.id, [...DECISIVE_PLUS[c.id as keyof typeof DECISIVE_PLUS]], c.incoterms.correct[0], "contrato", (st) => c.incident(c, best, st.incoterm!).best);
      expect(s.step).toBe("resultado");
      const ev = evaluateLogistics(c, s);
      expect(ev.knowledge.pct, c.id).toBe(100);
      expect(ev.errors).toEqual([]);
      expect(ev.dimensions).toHaveLength(5);
    }
  });
  it("la ruta más barata que no llega, con una regla marítima por carretera, suspende", () => {
    const c = caso("sevilla-casablanca");
    const s = play(c, "grupaje_ferry", ["mas_barata"], "FOB", "con_riesgo", () => "callar");
    const ev = evaluateLogistics(c, s);
    expect(ev.knowledge.pct).toBeLessThan(40);
    expect(ev.dimensions.find((d) => d.key === "coherencia")!.score).toBe(0);
    expect(ev.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("integridad del laboratorio", () => {
  it("los casos usan productos y mercados del catálogo de SmarTrade y reglas que existen", () => {
    for (const c of LOGISTICS_CASES) {
      expect(HS_CATALOG.some((e) => e.code === c.cargo.hs6), c.id).toBe(true);
      expect(MARKETS.some((m) => m.code === c.market), c.id).toBe(true);
      for (const code of [...c.incoterms.correct, ...c.incoterms.reasonable, c.agreed.incoterm]) expect(INCOTERMS.some((i) => i.code === code)).toBe(true);
      expect(c.routes.some((r) => r.id === assessRoutes(c).best.id)).toBe(true);
    }
  });
  it("cubre las cuatro rutas didácticas desde Sevilla y dificultad progresiva", () => {
    expect(LOGISTICS_CASES.map((c) => [c.origin, c.market])).toEqual([["Sevilla", "DE"], ["Sevilla", "MA"], ["Sevilla", "US"], ["Sevilla", "JP"]]);
    expect(LOGISTICS_CASES.map((c) => c.difficulty)).toEqual(["básica", "media", "media", "avanzada"]);
  });
  it("el aviso de estimaciones aparece en todas las pantallas del laboratorio", () => {
    expect(LOGISTICS_NOTICE).toBe("Estimaciones simuladas con fines educativos");
    for (const f of ["components/learning/logistics-lab.tsx", "app/aprendizaje/logistica/page.tsx"]) expect(sinComentarios(readFileSync(f, "utf8")), f).toMatch(/<LogisticsNotice/);
  });
  it("las opciones se muestran con el orden mezclado", () => {
    const src = sinComentarios(readFileSync("components/learning/logistics-lab.tsx", "utf8"));
    expect(src).toMatch(/displayOrder\(c\.routes/);
    expect(src).toMatch(/displayOrder\(inc\.options/);
    expect(src).not.toMatch(/\bc\.routes\.map\(|inc\.options\.map\(/);
  });
});
