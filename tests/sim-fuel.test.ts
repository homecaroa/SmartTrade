import { beforeAll, describe, expect, it } from "vitest";
import { apply, balanceGap, incidentOptions, newGame } from "@/lib/sim/engine";
import { fullCost } from "@/lib/sim/deep";
import { fuelChange, fuelIndex, fuelOn, revisionFactor, variablePerKmAt } from "@/lib/sim/fuel";
import type { SimState } from "@/lib/sim/model";
import { FUEL, P } from "@/lib/sim/params";
import { parseSave, restore, toSave } from "@/lib/sim/save";
import { play } from "@/lib/sim/strategies";

/**
 * Carrera, fase B2 (reglas v12, 22/11/2026): gasóleo variable y revisión del precio (Ley 15/2009, art. 38).
 */
const settle = (x: SimState) => { while (x.status === "incidencia") x = apply(x, { t: "responder", incidencia: x.pending!.id, opcion: incidentOptions(x.pending!, x.version).find((o) => o.grade === "correcta")!.id }); return x; };

/** Estado con la decisión de gasóleo pendiente en el sentido pedido (de carreras de la estrategia negociadora). */
const found: Record<string, SimState> = {};
beforeAll(() => {
  for (let seed = 1; seed <= 30 && !(found.sube && found.baja); seed++) {
    const { actions } = play(seed, "negociadora", undefined, "carrera");
    let s = newGame(seed, undefined, "carrera");
    for (const a of actions) {
      if (s.status === "incidencia" && s.pending?.kind === "gasoleo") { const d = String(s.pending.data.direction); found[d] ??= s; if (found.sube && found.baja) break; }
      s = apply(s, a);
    }
  }
}, 120_000);

describe("gasóleo variable", () => {
  it("solo en la Carrera v12; la Temporada sigue con 0,42 €/km", () => {
    expect(fuelOn(newGame(1, undefined, "carrera"))).toBe(true);
    expect(fuelOn(newGame(1, 11, "carrera"))).toBe(false);
    expect(fuelOn(newGame(1))).toBe(false);
    expect(variablePerKmAt(newGame(1), 100)).toBe(P.variablePerKm);
  });
  it("la Temporada v12 se juega exactamente igual que la v10", () => {
    for (const seed of [5, 23]) { const a = play(seed, "crecedora", 10), b = play(seed, "crecedora", 12); expect(JSON.stringify({ ...b.state, version: 10 })).toBe(JSON.stringify(a.state)); }
  }, 60_000);
  it("el índice es reproducible, empieza en 1 y se queda entre sus límites", () => {
    expect(fuelIndex(77, 1)).toBe(1);
    for (let w = 1; w <= 260; w++) { const x = fuelIndex(77, w); expect(x).toBeGreaterThanOrEqual(FUEL.min); expect(x).toBeLessThanOrEqual(FUEL.max); }
    expect(fuelIndex(77, 200)).toBe(fuelIndex(77, 200));
    expect(Array.from({ length: 50 }, (_, i) => fuelIndex(77, i + 1)).some((x) => x !== 1)).toBe(true);
  });
  it("el coste variable de la semana sale del gasóleo de esa semana, y el escandallo también", () => {
    let s = newGame(5, undefined, "carrera");
    const d = s.offers.find((o) => o.kind === "distribucion")!;
    s = apply(apply(s, { t: "escandallo", oferta: d.id, coste: 1.3 }), { t: "aceptar", oferta: d.id });
    for (let i = 0; i < 12; i++) s = settle(apply(s, { t: "cerrar" }));
    for (const w of s.weeks.slice(-8)) if (w.kmOwn) expect(w.costVariable).toBeCloseTo(w.kmOwn * variablePerKmAt(s, w.week), 1);
    const vpk = variablePerKmAt(s, 40);
    expect(vpk).toBeCloseTo(P.variablePerKm - FUEL.fuelPerKm + FUEL.fuelPerKm * fuelIndex(5, 40), 2);
    expect(fullCost(d, vpk).value).toBeCloseTo(fullCost(d).value - P.variablePerKm + vpk, 2);
  }, 60_000);
});

describe("revisión del precio (art. 38)", () => {
  it("la decisión sale al cruzar el 5 % y tiene una sola respuesta correcta en cada sentido", () => {
    for (const d of ["sube", "baja"]) {
      const s = found[d];
      expect(s).toBeDefined();
      expect(Math.abs(Number(s.pending!.data.change))).toBeGreaterThanOrEqual(FUEL.threshold);
      expect(s.pending!.concept).toMatch(/art\. 38/);
      expect(incidentOptions(s.pending!, s.version).filter((o) => o.grade === "correcta").map((o) => o.id)).toEqual(["revisar"]);
    }
  });
  it("revisar: desde entonces cada factura se revisa sola, con la fórmula declarada", () => {
    const s = found.sube;
    const cid = String(s.pending!.data.contract);
    let r = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "revisar" });
    const c = r.contracts.find((x) => x.id === cid)!;
    expect(c.fuelRevision).toBe("si");
    for (let i = 0; i < 3 && r.status !== "fin"; i++) r = settle(apply(r, { t: "cerrar" }));
    // Fórmula escrita aquí a mano (no con revisionFactor, que es lo que se prueba): precio × (1 + peso × variación).
    const inv = r.receivables.filter((x) => x.contractId === cid && x.week > s.week);
    const base = c.kmWeek! * c.ratePerKm!;
    const revised = inv.filter((x) => Math.abs(x.amount - base) > 0.01);
    expect(revised.length).toBeGreaterThan(0);
    for (const x of revised) {
      const change = Math.round((fuelIndex(r.seed, x.week) / fuelIndex(r.seed, c.startWeek) - 1) * 100) / 100;
      expect(x.amount).toBeCloseTo(base * (1 + 0.23 * change), 1);
    }
    expect(revisionFactor(r, c, c.startWeek)).toBe(1);
    expect(r.weeks.some((w) => w.week >= s.week && w.notes.some((n) => n.startsWith("Revisión por gasóleo")))).toBe(true);
    expect(balanceGap(r)).toBe(0);
  });
  it("el escandallo se corrige con el gasóleo de la semana en que se hace", () => {
    let s = settle(found.sube);
    for (let i = 0; i < 15 && (s.offers.length === 0 || variablePerKmAt(s, s.week) === P.variablePerKm); i++) s = settle(apply(s, { t: "cerrar" }));
    const vpk = variablePerKmAt(s, s.week);
    expect(vpk).not.toBe(P.variablePerKm);
    const o = s.offers.find((x) => x.estimate === undefined)!;
    const r = apply(s, { t: "escandallo", oferta: o.id, coste: fullCost(o, vpk).value });
    expect(r.learning.at(-1)!.feedback).toContain(`${vpk.toLocaleString("es-ES")} €`);
  }, 60_000);
  it("absorber: no se revisa nunca; subir por tu cuenta: el cliente rescinde", () => {
    const s = found.sube, cid = String(s.pending!.data.contract);
    const abs = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "absorber" });
    expect(abs.contracts.find((x) => x.id === cid)!.fuelRevision).toBe("no");
    const up = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "subir" });
    const client = s.pending!.data.client;
    expect(up.contracts.filter((x) => x.clientId === client && x.endWeek > s.week).every((x) => x.cancelledWeek === s.week + 1)).toBe(true);
  });
  it("si baja: mantener el precio es nulo (38.3) y cuesta la devolución y el cliente; esperar cuesta la rectificativa", () => {
    const s = found.baja;
    const week = (x: SimState) => x.weeks.find((w) => w.week === s.week)!;
    const ok = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "revisar" });
    const keep = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "mantener" });
    const late = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "esperar" });
    const refund = FUEL.disputeWeeks * Number(s.pending!.data.weekly);
    if (ok.status !== "incidencia" && keep.status !== "incidencia" && late.status !== "incidencia") {
      expect(week(keep).costPenalties - week(ok).costPenalties).toBeCloseTo(refund, 1);
      expect(week(late).costPenalties - week(ok).costPenalties).toBeCloseTo(FUEL.lateRefundCost, 1);
    }
    expect(keep.contracts.find((x) => x.id === s.pending!.data.contract)!.cancelledWeek).toBe(s.week + 1);
    expect(late.contracts.find((x) => x.id === s.pending!.data.contract)!.fuelRevision).toBe("si");
  });
  it("una carrera v12 con revisiones se guarda y se recupera entera", () => {
    const g = play(3, "negociadora", undefined, "carrera");
    expect(g.state.version).toBe(12);
    expect(g.maxGap).toBe(0);
    const p = parseSave(JSON.parse(JSON.stringify(toSave(3, g.actions, 12, new Date(0), "carrera"))));
    if (!p.ok) throw new Error(p.error);
    const r = restore(p.save);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(g.state));
    expect(g.state.contracts.some((c) => c.fuelRevision === "si")).toBe(true);
    expect(fuelChange(g.state, { startWeek: 1 }, 1)).toBe(0);
  }, 60_000);
});
