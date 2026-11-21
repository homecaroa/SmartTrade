import { describe, expect, it } from "vitest";
import { apply, balanceGap, newGame, TRUCK_FULL_COST_PER_KM } from "@/lib/sim/engine";
import { contractReviews, deepOffers, fullCost, gradeEstimate, isDeep } from "@/lib/sim/deep";
import type { Action, SimState } from "@/lib/sim/model";
import { CAREER_DEEP } from "@/lib/sim/params";
import { parseSave, restore, toSave } from "@/lib/sim/save";
import { incomeStatement } from "@/lib/sim/statements";
import { play } from "@/lib/sim/strategies";

/**
 * Carrera, fase B1 (reglas v11, 21/11/2026; docs/simulador-carrera.md §6): pocas ofertas y más profundas, ficha,
 * informe comercial, escandallo obligatorio y evaluación de previsto frente a real.
 */
const career = (seed = 5) => newGame(seed, undefined, "carrera");
const closeUntilOffers = (s: SimState) => { for (let i = 0; i < 20 && s.offers.length === 0; i++) s = apply(s, { t: "cerrar" }); return s; };

describe("solo en la Carrera v11", () => {
  it("la Temporada v11 se juega exactamente igual que la v10", () => {
    for (const seed of [3, 17, 41]) for (const st of ["selectiva", "crecedora"] as const) {
      const a = play(seed, st, 10), b = play(seed, st, 11);
      expect(JSON.stringify(b.actions)).toBe(JSON.stringify(a.actions));
      expect(JSON.stringify({ ...b.state, version: 10 })).toBe(JSON.stringify(a.state));
    }
  }, 60_000);
  it("una Carrera v10 (fase A) sigue con su mercado de siempre", () => {
    const v10 = newGame(5, 10, "carrera");
    expect(isDeep(v10)).toBe(false);
    expect(v10.offers.length).toBeGreaterThanOrEqual(3);
    expect(v10.offers.every((o) => o.ficha === undefined)).toBe(true);
  });
  it("escandallo e informe no existen fuera de la Carrera v11", () => {
    const t = newGame(5);
    expect(() => apply(t, { t: "escandallo", oferta: t.offers[0].id, coste: 1 })).toThrow(/Carrera/);
    expect(() => apply(t, { t: "informe", cliente: "silla" })).toThrow(/Carrera/);
  });
});

describe("mercado: pocas ofertas, más grandes", () => {
  it("la semana 1 trae una distribución y un almacenaje, con su ficha", () => {
    const s = career();
    expect(isDeep(s)).toBe(true);
    expect(s.offers.map((o) => o.kind).sort()).toEqual(["almacenaje", "distribucion"]);
    for (const o of s.offers) { expect(o.ficha).toBeDefined(); expect(o.weeks).toBeGreaterThanOrEqual(CAREER_DEEP.weeks.min); }
    const d = s.offers.find((o) => o.kind === "distribucion")!;
    expect(d.kmWeek).toBe(d.ficha!.trips! * 2 * d.ficha!.kmOneWay!);
    expect(d.kmWeek!).toBeLessThanOrEqual(CAREER_DEEP.maxKmWeek);
  });
  it("una operación grande se paga un 20 % mejor que la misma oferta en la Temporada", () => {
    const base = newGame(5, 11).offers.find((o) => o.kind === "distribucion")!;
    const deep = career().offers.find((o) => o.kind === "distribucion")!;
    expect(deep.id).toBe(base.id);
    expect(deep.ratePerKm).toBeCloseTo(Math.round(base.ratePerKm! * CAREER_DEEP.priceFactor * 100) / 100, 2);
  });
  it("de 0 a 3 por semana, 1,55 de media (un tercio de las de la Temporada)", () => {
    const counts: number[] = [];
    for (let seed = 1; seed <= 20; seed++) for (let w = 2; w <= 60; w++) counts.push(deepOffers(seed, w, 100, 11).length);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(Math.max(...counts)).toBeLessThanOrEqual(3);
    expect(mean).toBeGreaterThan(1.4);
    expect(mean).toBeLessThan(1.7);
  });
});

describe("escandallo", () => {
  it("es obligatorio antes de negociar o aceptar; después, todo sigue igual", () => {
    const s = career();
    const o = s.offers[0];
    expect(() => apply(s, { t: "aceptar", oferta: o.id })).toThrow(/escandallo/);
    expect(() => apply(s, { t: "proponer", oferta: o.id, tarifa: 1, semanas: o.weeks, plazo: o.payWeeks })).toThrow(/escandallo/);
    const e = apply(s, { t: "escandallo", oferta: o.id, coste: fullCost(o).value });
    expect(e.offers.find((x) => x.id === o.id)!.estimate).toBe(fullCost(o).value);
    expect(e.learning.at(-1)!.grade).toBe("correcta");
    expect(() => apply(e, { t: "escandallo", oferta: o.id, coste: 3 })).toThrow(/Ya hiciste/);
    const acc = apply(e, { t: "aceptar", oferta: o.id });
    expect(acc.contracts.at(-1)!.estimate).toBe(fullCost(o).value);
    expect(e.cash).toBe(s.cash);
  });
  it("el coste completo de la distribución es el del camión lleno, y se corrige por tramos", () => {
    const s = career();
    const d = s.offers.find((o) => o.kind === "distribucion")!;
    expect(fullCost(d).value).toBe(TRUCK_FULL_COST_PER_KM);
    const real = fullCost(d).value;
    expect(gradeEstimate(d, real * 1.08).grade).toBe("correcta");
    expect(gradeEstimate(d, real * 0.8).grade).toBe("razonable");
    expect(gradeEstimate(d, 0.42).grade).toBe("grave");
    expect(gradeEstimate(d, 0.42).feedback).toMatch(/corto/);
    for (const o of s.offers) expect(fullCost(o).lines.reduce((a, l) => a + l.amount, 0)).toBeCloseTo(fullCost(o).value, 2);
  });
  it("si el precio no cubre el coste completo, la corrección cita el art. 10 bis de la Ley 15/2009", () => {
    const d = career().offers.find((o) => o.kind === "distribucion")!;
    const cheap = { ...d, ratePerKm: 1 };
    expect(gradeEstimate(cheap, fullCost(cheap).value).feedback).toMatch(/10 bis/);
    expect(gradeEstimate(d, fullCost(d).value).feedback).not.toMatch(/10 bis/);
  });
});

describe("informe comercial", () => {
  it("cuesta lo que dice, se paga al cerrar la semana, entra en la cuenta de resultados y no se repite", () => {
    const s = career();
    const c = s.offers[0].clientId;
    const r = apply(s, { t: "informe", cliente: c });
    expect(r.answers[`informe-${c}`]).toBe("pedido");
    expect(() => apply(r, { t: "informe", cliente: c })).toThrow(/Ya tienes/);
    expect(() => apply(r, { t: "informe", cliente: "nadie" })).toThrow(/desconocido/);
    const a = apply(r, { t: "cerrar" }), b = apply(s, { t: "cerrar" });
    const wa = a.weeks.at(-1)!, wb = b.weeks.at(-1)!;
    expect(wa.costServices).toBe(CAREER_DEEP.reportCost);
    expect(wb.costServices).toBeUndefined();
    expect(wa.result).toBeCloseTo(wb.result - CAREER_DEEP.reportCost, 2);
    expect(a.ledger.some((m) => m.label.startsWith("Informe comercial") && m.amount === -CAREER_DEEP.reportCost)).toBe(true);
    expect(balanceGap(a)).toBe(0);
    expect(incomeStatement(a, 1, 1).costServices).toBe(CAREER_DEEP.reportCost);
    expect(incomeStatement(a, 1, 1).result).toBeCloseTo(wa.result, 2);
  });
});

describe("evaluación y una carrera entera", () => {
  const g = play(7919 * 3 + 3, "negociadora", undefined, "carrera");
  it("una carrera v11 de la estrategia negociadora llega al final con la contabilidad cuadrada", () => {
    expect(g.state.version).toBe(11);
    expect(g.state.status).toBe("fin");
    expect(g.maxGap).toBe(0);
  });
  it("cada contrato terminado tiene su previsto frente a real, con lo facturado de verdad", () => {
    const rs = contractReviews(g.state);
    expect(rs.length).toBeGreaterThan(10);
    for (const r of rs) {
      const billed = g.state.receivables.filter((i) => i.contractId === r.contract.id).reduce((a, i) => a + i.amount, 0);
      expect(r.realRevenue).toBeCloseTo(billed, 2);
      expect(r.plannedMargin).toBeCloseTo(r.plannedRevenue - r.plannedCost, 2);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });
  it("un contrato cancelado a medias se evalúa con lo que de verdad se facturó", () => {
    let s = career();
    const d = s.offers.find((o) => o.kind === "distribucion")!;
    s = apply(apply(s, { t: "escandallo", oferta: d.id, coste: fullCost(d).value }), { t: "aceptar", oferta: d.id });
    // Fixture: el cliente cancela desde la semana 3 (como haría tras un incumplimiento).
    s.contracts.find((c) => c.id === d.id)!.cancelledWeek = 3;
    for (let i = 0; i < 4; i++) { s = apply(s, { t: "cerrar" }); while (s.status === "incidencia") s = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: "subcontratar" }); }
    const r = contractReviews(s).find((x) => x.contract.id === d.id)!;
    expect(r.ended).toBe(2);
    expect(r.realRevenue).toBeCloseTo(2 * d.kmWeek! * d.ratePerKm!, 2);
    expect(r.realRevenue).toBeLessThan(r.plannedRevenue);
    expect(r.servedShare).toBeCloseTo(2 / d.weeks, 2);
    expect(r.reasons.join(" ")).toMatch(/canceló en la semana 3/);
  });
  it("las partidas con escandallo e informe se guardan y se recuperan enteras", () => {
    let s = career(9);
    const acts: Action[] = [{ t: "informe", cliente: s.offers[0].clientId }, ...s.offers.map((o) => ({ t: "escandallo" as const, oferta: o.id, coste: fullCost(o).value })), { t: "aceptar", oferta: s.offers[0].id }, { t: "cerrar" }];
    for (const a of acts) s = apply(s, a);
    s = closeUntilOffers(s);
    const p = parseSave(JSON.parse(JSON.stringify(toSave(9, acts, 11, new Date(0), "carrera"))));
    if (!p.ok) throw new Error(p.error);
    const r = restore(p.save);
    expect(r.dropped).toBe(0);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(acts.reduce(apply, career(9))));
  });
});
