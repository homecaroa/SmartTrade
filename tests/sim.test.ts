import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apply, balanceGap, breakdownOf, breakdownsOf, cashByConcept, cashStart, clientHistory, gradeGrowth, gradeOffer, incidentOptions, kmCommitted, kmOwnCommitted, newGame, palletCapacityAt, replay, seasonOutcome, subcontractPerKm, TRUCK_FULL_COST_PER_KM, truckKmAt } from "@/lib/sim/engine";
import { bestDocs, clientLimits, gradeDocs, respond, roundRate, termsOf, validateProposal } from "@/lib/sim/deal";
import { evaluate } from "@/lib/sim/calc";
import { directCost, fixedShare } from "@/lib/sim/international";
import { WORKER_WEEK, workCapacityAt } from "@/lib/sim/warehouse";
import { kmOf, offersFor, reputationEffect, weeklyRevenue, withReputation } from "@/lib/sim/market";
import type { Action, Offer, SimState } from "@/lib/sim/model";
import { ENGINE_VERSION, FIXED_PER_MONTH, FIXED_PER_WEEK, GROWTH, P, payTermLabel, SEASON_WEEKS, TRUCK_KM_WEEK } from "@/lib/sim/params";
import { mulberry32, stream } from "@/lib/sim/rng";
import { parseSave, restore, toSave } from "@/lib/sim/save";
import { play } from "@/lib/sim/strategies";

/**
 * Business Simulator, fase 1 (docs/simulador.md). Comprueba lo que el diseño exige al motor: reproducibilidad con semilla,
 * cuadre contable en cada paso, equilibrio con estrategias automáticas, plazos de pago legales e incidencias.
 */
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe("azar con semilla", () => {
  it("misma semilla, misma secuencia; semillas distintas, secuencias distintas", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it("las ofertas de una semana no dependen de lo que el jugador hizo antes", () => {
    const quiet = replay(7, [{ t: "cerrar" }]);
    const busy = replay(7, [{ t: "aceptar", oferta: "s1-1" }, { t: "aceptar", oferta: "s1-2" }, { t: "cerrar" }]);
    expect(busy.offers.map((o) => o.id)).toEqual(quiet.offers.map((o) => o.id));
    expect(offersFor(7, 2)).toEqual(offersFor(7, 2));
    expect(stream(7, 2, "ofertas")()).toBe(stream(7, 2, "ofertas")());
  });
  it("reproducir las mismas acciones da exactamente el mismo estado", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const { actions, state } = play(seed, "prudente");
      expect(JSON.stringify(replay(seed, actions))).toBe(JSON.stringify(state));
    }
  });
});

describe("contabilidad", () => {
  it("el balance cuadra después de cada acción en todas las partidas simuladas", () => {
    for (const seed of SEEDS) for (const st of ["nada", "codiciosa", "prudente", "negociadora"] as const) expect(play(seed, st).maxGap).toBe(0);
  }, 60_000);
  it("los fijos se devengan cada semana y se pagan juntos cada 4 semanas", () => {
    const s = play(11, "nada").state;
    const fixedPay = s.ledger.filter((m) => m.label.startsWith("Alquiler, nóminas"));
    expect(fixedPay.length).toBeGreaterThan(1);
    expect(fixedPay.every((m) => m.week % 4 === 0 && m.amount === -FIXED_PER_MONTH)).toBe(true);
    expect(s.weeks.every((w) => w.costFixed === FIXED_PER_MONTH / 4)).toBe(true);
  });
  it("la caja nunca cuenta la amortización y la fianza no es un gasto", () => {
    const s = play(11, "nada").state;
    expect(s.ledger.some((m) => /amortiz/i.test(m.label))).toBe(false);
    expect(s.deposit).toBe(P.deposit);
    expect(s.weeks[0].result).toBe(-(FIXED_PER_MONTH / 4 + P.amortizationWeek));
    expect(balanceGap(s)).toBe(0);
  });
  it("el camión nunca hace más km propios que su capacidad", () => {
    for (const seed of SEEDS.slice(0, 50)) for (const w of play(seed, "codiciosa").state.weeks) expect(w.kmOwn).toBeLessThanOrEqual(w.kmCapacity);
  });
});

// Temporada de 26 semanas (09/11/2026). Hasta ese día la partida acababa en la semana 6 y se comparaba el resultado
// acumulado; ahora quien lo acepta todo quiebra antes (y por eso pierde menos dinero total), así que se compara por
// victorias. Umbrales medidos con 500 semillas: selectiva 230 victorias, prudente 169, aceptarlo todo 0, nada 0.
describe("equilibrio de la temporada (estrategias automáticas, 200 semillas)", () => {
  const results = (st: "nada" | "codiciosa" | "prudente" | "selectiva") => SEEDS.map((seed) => play(seed, st).state);
  const nada = results("nada"), codiciosa = results("codiciosa"), prudente = results("prudente"), selectiva = results("selectiva");
  const wins = (xs: SimState[]) => xs.filter((s) => seasonOutcome(s).victory).length;
  it("no hacer nada lleva siempre a la quiebra por falta de caja", () => {
    expect(nada.every((s) => s.status === "quiebra" && /caja/.test(s.endReason ?? ""))).toBe(true);
  });
  it("aceptarlo todo hunde el servicio: los clientes se van y nunca se gana", () => {
    expect(wins(codiciosa)).toBe(0);
    // Desde las reglas v4 la codiciosa también paga todo lo que le reclaman, y una parte quiebra antes por caja que por
    // servicio (medido el 10/11/2026: 79,5 % por servicio, el resto por caja). Antes se exigía más del 90 % por servicio.
    expect(codiciosa.every((s) => s.status === "quiebra")).toBe(true);
    expect(codiciosa.filter((s) => s.status === "quiebra" && /servicio/.test(s.endReason ?? "")).length / SEEDS.length).toBeGreaterThan(0.7);
  });
  it("se puede ganar, pero no siempre: elegir por margen gana más que aceptar en orden", () => {
    expect(wins(selectiva) / SEEDS.length).toBeGreaterThan(0.3);
    expect(wins(selectiva) / SEEDS.length).toBeLessThan(0.7);
    expect(wins(selectiva)).toBeGreaterThan(wins(prudente));
    expect(wins(prudente)).toBeGreaterThan(0);
  });
  it("bien gestionada, la empresa pasa de perder a ganar dinero", () => {
    const mean = (xs: SimState[], f: (s: SimState) => number) => xs.reduce((a, s) => a + f(s), 0) / xs.length;
    const first = mean(selectiva, (s) => s.weeks[0].result), lastWeeks = mean(selectiva, (s) => s.weeks.slice(-8).reduce((a, w) => a + w.result, 0) / 8);
    expect(lastWeeks).toBeGreaterThan(first);
    expect(selectiva.every((s) => s.status === "fin")).toBe(true);
  });
  it("ganar exige beneficio al final: servicio y ocupación solos no bastan", () => {
    for (const s of [...prudente, ...selectiva]) {
      const o = seasonOutcome(s);
      if (!o.objectives[0].ok) expect(o.victory).toBe(false);
    }
  });
});

describe("compatibilidad con las partidas de la fase 1", () => {
  it("las semanas 1-6 no cambian: mismas ofertas base (3-5, sin prima) y la primera avería con el mismo sorteo", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      // Ofertas base: el viaje internacional de las reglas v5 (desde la semana 5) va aparte y no cambia las demás.
      for (let w = 1; w <= 6; w++) { const n = offersFor(seed, w, 100).filter((o) => o.kind !== "internacional").length; expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(5); }
      expect(breakdownOf(seed).id).toBe("averia");
      expect(breakdownOf(seed).week).toBe(2 + Math.floor(stream(seed, 0, "averia")() * 4));
    }
  });
  it("una avería por tramo de 8 semanas", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const bs = breakdownsOf(seed);
      expect(bs.map((b) => b.week >= 2 && b.week <= 5 || b.week >= 10 && b.week <= 13 || b.week >= 18 && b.week <= 21)).toEqual([true, true, true]);
    }
  });
});

describe("reputación, historial y calculadora", () => {
  it("la reputación premia la fiabilidad desde la semana 7 y castiga los fallos", () => {
    expect(reputationEffect(100, 6).factor).toBe(1);
    expect(reputationEffect(100, 7).factor).toBe(1.2);
    expect(reputationEffect(94, 7).factor).toBe(1);
    expect(reputationEffect(85, 3)).toMatchObject({ drop: 1, factor: 0.95 });
    expect(reputationEffect(70, 10)).toMatchObject({ drop: 2, factor: 0.9 });
    const base = offersFor(3, 8, 100);
    expect(base.every((o) => o.kind !== "distribucion" || o.ratePerKm! > 1.05 * 1.2 - 0.01)).toBe(true);
  });
  it("la referencia de terceros de un cliente es la misma en toda la partida", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const seen = new Map<string, string>();
      for (let w = 1; w <= 26; w++) for (const o of offersFor(seed, w, 100)) {
        if (seen.has(o.clientId)) expect(o.clientHint).toBe(seen.get(o.clientId));
        seen.set(o.clientId, o.clientHint);
      }
    }
  });
  it("el historial propio de un cliente refleja sus pagos reales", () => {
    const seed = SEEDS.find((sd) => play(sd, "prudente").state.receivables.some((i) => i.paidWeek !== undefined && i.paidWeek > i.dueWeek))!;
    const s = play(seed, "prudente").state;
    const late = s.receivables.find((i) => i.paidWeek !== undefined && i.paidWeek > i.dueWeek)!;
    const h = clientHistory(s, late.clientId);
    expect(h.paidLate).toBeGreaterThan(0);
    expect(h.maxDelayWeeks).toBeGreaterThan(0);
    const punctual = s.receivables.find((i) => i.paidWeek !== undefined && clientHistory(s, i.clientId).paidLate === 0);
    if (punctual) expect(clientHistory(s, punctual.clientId).paid).toBeGreaterThan(0);
  });
  it("la calculadora opera sin eval, con coma decimal, prioridad y paréntesis, y rechaza lo que no es una operación", () => {
    expect(evaluate("680 × 0,42")).toEqual({ ok: true, value: 285.6 });
    expect(evaluate("(1,25 − 0,42) × 400")).toEqual({ ok: true, value: 332 });
    expect(evaluate("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
    expect(evaluate("-5 + 10 ÷ 4")).toEqual({ ok: true, value: -2.5 });
    expect(evaluate("1/0").ok).toBe(false);
    expect(evaluate("alert(1)").ok).toBe(false);
    expect(evaluate("(2+3").ok).toBe(false);
    expect(evaluate("").ok).toBe(false);
  });
});

describe("normativa y reglas de pago", () => {
  it("el transporte se factura a 30 días (mora a los 30 días, Ley 15/2009, art. 41) y nada a más de 60 (Ley 3/2004, art. 4)", () => {
    for (const seed of SEEDS.slice(0, 50)) for (let w = 1; w <= SEASON_WEEKS; w++) for (const o of offersFor(seed, w)) {
      if (o.kind !== "almacenaje") expect(o.payWeeks).toBe(P.transportPayWeeks);
      expect(["30 días", "60 días"]).toContain(payTermLabel(o.payWeeks));
    }
  });
  it("una factura vence en su plazo; los clientes puntuales pagan ese día", () => {
    const s = play(5, "prudente").state;
    for (const inv of s.receivables) {
      const c = s.contracts.find((x) => x.id === inv.contractId)!;
      expect(inv.dueWeek).toBe(inv.week + c.payWeeks);
      expect(inv.payWeek).toBeGreaterThanOrEqual(inv.dueWeek);
    }
  });
});

describe("decisiones e incidencias", () => {
  const offer = (o: Partial<Offer>): Offer => ({ id: "x", week: 1, kind: "distribucion", clientId: "albufera", clientHint: "", weeks: 1, payWeeks: 4, ...o });
  it("aceptar sin capacidad es un error grave; un viaje que no cubre el gasóleo con el retorno en vacío, también", () => {
    const s = newGame(1);
    expect(gradeOffer(s, offer({ kmWeek: TRUCK_KM_WEEK + 10, ratePerKm: 2 })).grade).toBe("grave");
    expect(gradeOffer(s, offer({ kind: "puntual", kmOneWay: 300, price: 200 })).grade).toBe("grave"); // 0,33 €/km recorrido
    expect(gradeOffer(s, offer({ kind: "puntual", kmOneWay: 300, price: 500 })).grade).toBe("razonable"); // 0,83 €/km
    expect(gradeOffer(s, offer({ kmWeek: 300, ratePerKm: TRUCK_FULL_COST_PER_KM + 0.1 })).grade).toBe("correcta");
    expect(gradeOffer(s, offer({ kind: "almacenaje", pallets: 700, palletRate: 3 })).grade).toBe("grave");
  });
  it("la avería ocurre una sola vez, entre las semanas 2 y 5", () => {
    for (const seed of SEEDS) { const b = breakdownOf(seed); expect(b.week).toBeGreaterThanOrEqual(2); expect(b.week).toBeLessThanOrEqual(5); }
  });
  /** Partida con el camión sobrecomprometido justo en la semana de la avería, para forzar la decisión. */
  function toBreakdown(seed: number): SimState {
    let s = newGame(seed);
    const b = breakdownOf(seed);
    while (s.week < b.week) {
      for (const o of [...s.offers]) if (o.kind === "distribucion") s = apply(s, { t: "aceptar", oferta: o.id });
      s = apply(s, { t: "cerrar" });
      if (s.status === "incidencia") s = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: s.pending!.kind === "mora" ? "reclamar" : "subcontratar" });
    }
    return s;
  }
  it("ante la avería: subcontratar mantiene el servicio con margen menor; callar hace perder al cliente más grande", () => {
    const seed = SEEDS.find((sd) => { const s = toBreakdown(sd); return kmCommitted(s, s.week) > TRUCK_KM_WEEK - breakdownOf(sd).days * P.kmPerDay; })!;
    expect(seed).toBeDefined();
    const before = apply(toBreakdown(seed), { t: "cerrar" });
    expect(before.status).toBe("incidencia");
    const sub = apply(before, { t: "responder", incidencia: "averia", opcion: "subcontratar" });
    const rec = sub.weeks[sub.weeks.length - 1];
    expect(rec.kmUnserved).toBe(0);
    // Desde la v3 el subcontratista cobra el precio de mercado también en una avería; en la v1 y la v2, 1,05 €/km.
    expect(rec.costSubcontract).toBeCloseTo(rec.kmSubcontracted * subcontractPerKm(sub.version), 2);
    expect(sub.learning[sub.learning.length - 1].feedback).toContain("1,40 €/km");
    expect(subcontractPerKm(2)).toBe(P.subcontractPerKm);
    expect(sub.payables.some((p) => p.label.startsWith("Subcontratista") && p.dueWeek === rec.week + 4)).toBe(true);
    const shut = apply(before, { t: "responder", incidencia: "averia", opcion: "callar" });
    expect(shut.contracts.some((c) => c.cancelledWeek === before.week + 1)).toBe(true);
    expect(shut.learning[shut.learning.length - 1].grade).toBe("grave");
  });
  it("cliente que paga tarde: reclamar por escrito adelanta el cobro a la semana siguiente", () => {
    const seed = SEEDS.find((sd) => { const st = play(sd, "prudente"); return st.state.learning.some((l) => l.what.includes("no paga")); })!;
    const { actions } = play(seed, "prudente");
    const s = replay(seed, actions);
    const answered = Object.keys(s.answers).find((k) => k.startsWith("mora-"))!;
    const client = answered.replace("mora-", "");
    const due = s.receivables.filter((i) => i.clientId === client);
    expect(seed).toBeDefined();
    expect(due.length).toBeGreaterThan(0);
    expect(s.answers[answered]).toBe("reclamar");
    // Tras reclamar, cada factura de ese cliente se cobra como mucho una semana después de su vencimiento.
    expect(due.every((i) => i.payWeek <= i.dueWeek + 1)).toBe(true);
  });
  it("con mala reputación llegan menos ofertas y peor pagadas", () => {
    const base = offersFor(3, 2);
    expect(withReputation(base, 100)).toEqual(base);
    const bad = withReputation(base, 70);
    expect(bad.length).toBe(Math.max(1, base.length - 2));
    bad.forEach((o, i) => { if (o.ratePerKm) expect(o.ratePerKm).toBeLessThan(base[i].ratePerKm!); });
  });
  it("la pregunta del mes solo se responde tras la semana 4 y una vez", () => {
    const s = newGame(1);
    expect(() => apply(s, { t: "pregunta", pregunta: "mes1", opcion: "fijos" })).toThrow();
    const after = play(1, "nada").state;
    expect(["fin", "quiebra"]).toContain(after.status);
    expect(() => apply(after, { t: "cerrar" })).toThrow();
    // Terminada la partida, la pregunta pendiente aún se puede responder, una sola vez.
    const answered = apply(after, { t: "pregunta", pregunta: "mes1", opcion: "fijos" });
    expect(answered.learning[answered.learning.length - 1].grade).toBe("correcta");
    expect(() => apply(answered, { t: "pregunta", pregunta: "mes1", opcion: "fijos" })).toThrow();
  });
});

describe("guardado", () => {
  it("se guarda la semilla y las acciones, y al restaurar se obtiene el mismo estado", () => {
    const { actions, state } = play(99, "prudente");
    const file = JSON.parse(JSON.stringify(toSave(99, actions)));
    const p = parseSave(file);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.warning).toBeNull();
    const r = restore(p.save);
    expect(r.dropped).toBe(0);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(state));
  });
  it("rechaza archivos ajenos, avisa si cambió la versión del motor y descarta acciones que ya no valen", () => {
    expect(parseSave({ hola: 1 }).ok).toBe(false);
    expect(parseSave({ app: "smartrade-simulador", seed: 1, actions: [{ t: "borrar" }] }).ok).toBe(false);
    const old = parseSave({ app: "smartrade-simulador", version: 0, seed: 1, actions: [] });
    expect(old.ok && old.warning).toMatch(/versión 0/); // versión desconocida: se reproduce con la actual y avisa
    const bad: Action[] = [{ t: "cerrar" }, { t: "aceptar", oferta: "no-existe" }, { t: "cerrar" }];
    expect(restore(toSave(1, bad))).toMatchObject({ dropped: 2 });
  });
});

describe("integridad", () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  it("el motor no usa azar no reproducible, red ni la hora del sistema", () => {
    for (const f of files("lib/sim")) {
      const src = strip(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/Math\.random|\bfetch\s*\(|XMLHttpRequest|Date\.now|crypto\./);
    }
  });
  it("la interfaz no contiene reglas: no calcula costes ni tarifas por su cuenta", () => {
    for (const f of files("components/sim")) expect(strip(readFileSync(f, "utf8")), f).not.toMatch(/0[,.]42|1[,.]05\b|9750|2437/);
  });
  it("un viaje puntual es todo o nada: si no cabe entero, no se hace ni se factura", () => {
    const s = newGame(1);
    const dist: Offer = { id: "d", week: 1, kind: "distribucion", clientId: "albufera", clientHint: "", weeks: 1, payWeeks: 4, kmWeek: 900, ratePerKm: 1.3 };
    const trip: Offer = { id: "p", week: 1, kind: "puntual", clientId: "sagunto", clientHint: "", weeks: 1, payWeeks: 4, kmOneWay: 200, price: 600 };
    s.contracts = [{ ...dist, startWeek: 1, endWeek: 1 }, { ...trip, startWeek: 1, endWeek: 1 }];
    s.offers = [];
    const r = apply(s, { t: "cerrar" }).weeks[0];
    expect(r.kmOwn).toBe(900); // la distribución entra; el viaje (400 km) no cabe en los 150 restantes
    expect(r.kmUnserved).toBe(400);
    expect(r.revenueTransport).toBe(900 * 1.3);
  });
  it("cada km de un viaje puntual cuenta la ida y el retorno en vacío", () => {
    expect(kmOf({ id: "x", week: 1, kind: "puntual", clientId: "albufera", clientHint: "", weeks: 1, payWeeks: 4, kmOneWay: 200, price: 400 })).toBe(400);
  });
});

// Negociación y documentación (09/11/2026, petición del dueño). Reglas en lib/sim/deal.ts.
describe("negociación", () => {
  const firstOf = (seed: number, kind: Offer["kind"]) => { for (let w = 1; w <= 6; w++) { const o = offersFor(seed, w).find((x) => x.kind === kind); if (o) return o; } throw new Error("sin oferta"); };
  it("dentro del límite acepta; un poco por encima, contraoferta; muy por encima, se va", () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const o = firstOf(seed, "distribucion");
      const lim = clientLimits(seed, o);
      const t = termsOf(o);
      expect(respond(seed, o, { ...t, rate: t.rate * lim.maxFactor * 0.999 }).kind).toBe("acepta");
      const over = respond(seed, o, { ...t, rate: t.rate * lim.maxFactor * 1.02 });
      expect(over.kind).toBe("contraoferta");
      expect(over.terms.rate).toBeLessThanOrEqual(roundRate(o.kind, t.rate * lim.maxFactor) + 0.01);
      expect(respond(seed, o, { ...t, rate: t.rate * 1.25 }).kind).toBe("rechaza"); // por encima del 18 % + 4 % siempre se va
    }
  });
  it("el límite del cliente es el mismo con la misma semilla y oferta", () => {
    const o = firstOf(5, "almacenaje");
    expect(clientLimits(5, o)).toEqual(clientLimits(5, o));
  });
  it("en almacenaje, cobrar a 30 días en vez de 60 baja lo que el cliente está dispuesto a pagar", () => {
    const seed = SEEDS.find((sd) => firstOf(sd, "almacenaje").payWeeks === 8)!;
    const o = firstOf(seed, "almacenaje");
    const t = termsOf(o);
    const lim = clientLimits(seed, o);
    const p = t.rate * lim.maxFactor * 0.99;
    expect(respond(seed, o, { ...t, rate: p }).kind).toBe("acepta");
    expect(respond(seed, o, { ...t, rate: p, payWeeks: 4 }).kind).not.toBe("acepta");
  });
  it("en el transporte no se puede negociar el plazo de pago ni pasar de 60 días en almacenaje", () => {
    const o = firstOf(3, "distribucion");
    expect(validateProposal(o, { ...termsOf(o), payWeeks: 8 })).toMatch(/Ley 15\/2009/);
    const a = firstOf(3, "almacenaje");
    expect(validateProposal(a, { ...termsOf(a), payWeeks: 12 })).toMatch(/60 días/);
  });
  it("tras dos rondas sin acuerdo, el cliente se va; rechazar quita la oferta y queda registrado", () => {
    const seed = 21;
    let s = newGame(seed);
    const o = s.offers.find((x) => x.kind === "distribucion")!;
    const lim = clientLimits(seed, o);
    const ask = (k: number) => { s = apply(s, { t: "proponer", oferta: o.id, tarifa: roundRate(o.kind, o.ratePerKm! * lim.maxFactor * k), semanas: o.weeks, plazo: o.payWeeks }); };
    ask(1.02); expect(s.offers.find((x) => x.id === o.id)?.round).toBe(1);
    ask(1.02); expect(s.offers.find((x) => x.id === o.id)?.round).toBe(2);
    ask(1.02);
    expect(s.offers.some((x) => x.id === o.id)).toBe(false);
    expect(s.learning[s.learning.length - 1].what).toMatch(/Negociación/);
  });
  it("aceptar tras un acuerdo crea el contrato con las condiciones pactadas", () => {
    const seed = 33;
    let s = newGame(seed);
    const o = s.offers.find((x) => x.kind === "distribucion")!;
    const want = roundRate(o.kind, o.ratePerKm! * clientLimits(seed, o).maxFactor * 0.99);
    s = apply(s, { t: "proponer", oferta: o.id, tarifa: want, semanas: o.weeks, plazo: o.payWeeks });
    expect(s.offers.find((x) => x.id === o.id)!.agreed).toBe(true);
    s = apply(s, { t: "aceptar", oferta: o.id, docs: bestDocs(o.kind) });
    expect(s.contracts.find((c) => c.id === o.id)!.ratePerKm).toBe(want);
  });
  it("negociar con cabeza compensa, pero no gana siempre", () => {
    const neg = SEEDS.slice(0, 100).map((sd) => play(sd, "negociadora").state).filter((x) => seasonOutcome(x).victory).length;
    const sel = SEEDS.slice(0, 100).map((sd) => play(sd, "selectiva").state).filter((x) => seasonOutcome(x).victory).length;
    expect(neg).toBeGreaterThan(sel);
    expect(neg).toBeLessThan(100);
  }, 60_000);
});

describe("documentación de cada operación", () => {
  it("transporte: sin documento de control ni carta de porte es error grave; la carta de porte con sus datos basta", () => {
    expect(gradeDocs("distribucion", []).grade).toBe("grave");
    expect(gradeDocs("distribucion", ["recibo"]).issues).toEqual(["sin_control"]);
    expect(gradeDocs("puntual", ["porte", "recibo"])).toMatchObject({ grade: "correcta", issues: [] });
    expect(gradeDocs("puntual", ["control", "recibo"]).grade).toBe("correcta");
    expect(gradeDocs("puntual", ["porte", "recibo", "cmr"]).grade).toBe("razonable"); // el CMR es internacional
  });
  it("almacenaje: sin albarán de entrada queda el riesgo de reclamación; el documento de control no corresponde", () => {
    expect(gradeDocs("almacenaje", bestDocs("almacenaje"))).toMatchObject({ grade: "correcta", issues: [] });
    expect(gradeDocs("almacenaje", ["condiciones", "registro"]).issues).toEqual(["sin_albaran"]);
    expect(gradeDocs("almacenaje", [...bestDocs("almacenaje"), "control"]).grade).toBe("razonable");
  });
  it("la documentación que falta acaba costando dinero (una vez por contrato) y cuadra en caja y en resultados", () => {
    let hits = 0;
    for (const seed of SEEDS.slice(0, 60)) {
      const { state } = play(seed, "codiciosa");
      const pen = state.weeks.reduce((a, w) => a + w.costPenalties, 0);
      // Desde las reglas v4 esta partida también incluye indemnizaciones y costas de las reclamaciones, y desde la v6 las
      // penalizaciones del almacén (rotura de stock, sobrestock, residuos).
      const cash = state.ledger.filter((m) => /^(Sanciones|Indemnización|Laudo|Rotura|Sobrestock|Multa|Gestor)/.test(m.label)).reduce((a, m) => a - m.amount, 0);
      expect(pen).toBeCloseTo(cash, 2);
      expect(state.contracts.filter((c) => c.docPenalized).length * 1).toBeGreaterThanOrEqual(pen > 0 ? 1 : 0);
      if (pen > 0) hits++;
      expect(balanceGap(state)).toBe(0);
    }
    expect(hits).toBeGreaterThan(0);
  }, 60_000);
  it("una aceptación sin documentación (partidas guardadas antes del 09/11/2026) no se califica ni se penaliza", () => {
    const s = apply(newGame(9), { t: "aceptar", oferta: "s1-1" });
    expect(s.contracts[0].docs).toBeUndefined();
    expect(s.contracts[0].docIssues).toBeUndefined();
    expect(s.learning.some((l) => l.what.startsWith("Documentación"))).toBe(false);
  });
  it("no se aceptan documentos que no existen para esa operación", () => {
    expect(() => apply(newGame(9), { t: "aceptar", oferta: "s1-1", docs: ["inventado"] })).toThrow();
  });
});

describe("beneficio frente a tesorería", () => {
  it("la tesorería por conceptos explica exactamente la variación de caja de cada semana", () => {
    const { state } = play(48213, "negociadora");
    for (const w of state.weeks) {
      const moves = Object.values(cashByConcept(state, w.week)).reduce((a, b) => a + b, 0);
      expect(Math.round((cashStart(state, w.week) + moves) * 100) / 100).toBe(w.cashEnd);
    }
  });
  it("beneficio y caja difieren: la fianza sale de caja sin ser gasto y la amortización es gasto sin salir de caja", () => {
    const { state } = play(48213, "nada");
    expect(cashByConcept(state, 1)["Fianza del almacén"]).toBe(-P.deposit);
    expect(state.weeks[0].result).not.toBe(state.weeks[0].cashEnd - P.initialCash);
  });
});

// Viajes puntuales v2 y versiones de reglas (09/11/2026). Una partida guardada se reproduce con SU versión.
describe("viajes puntuales (v2) y versiones de reglas", () => {
  const puntuales = (v: number) => SEEDS.slice(0, 100).flatMap((sd) => Array.from({ length: 26 }, (_, w) => offersFor(sd, w + 1, 100, v))).flat().filter((o) => o.kind === "puntual");
  const perKm = (o: Offer, back = false) => (o.price! + (back ? o.backhaul?.price ?? 0 : 0)) / (2 * o.kmOneWay!);
  it("en la v2 hay viajes buenos y malos, ninguno por debajo del gasóleo, y en torno al 40 % con carga de retorno", () => {
    const ps = puntuales(2);
    const good = ps.filter((o) => perKm(o) >= TRUCK_FULL_COST_PER_KM).length / ps.length;
    expect(good).toBeGreaterThan(0.3);
    expect(good).toBeLessThan(0.8);
    expect(ps.every((o) => perKm(o) >= P.variablePerKm)).toBe(true);
    const withBack = ps.filter((o) => o.backhaul).length / ps.length;
    expect(withBack).toBeGreaterThan(0.3);
    expect(withBack).toBeLessThan(0.5);
  });
  it("la v1 sigue generando exactamente las mismas ofertas que antes (sin carga de retorno)", () => {
    expect(puntuales(1).some((o) => o.backhaul)).toBe(false);
    for (const sd of SEEDS.slice(0, 20)) for (let w = 1; w <= 26; w++) {
      const v1 = offersFor(sd, w, 100, 1), v2 = offersFor(sd, w, 100, 2);
      expect(v1.map((o) => [o.id, o.kind, o.clientId])).toEqual(v2.map((o) => [o.id, o.kind, o.clientId])); // solo cambian los precios de los puntuales
      v1.forEach((o, i) => { if (o.kind !== "puntual") expect(o).toEqual(v2[i]); });
    }
  });
  it("traer la carga de retorno suma su precio a la factura; sin ella, se avisa de lo que se deja pasar", () => {
    const seed = SEEDS.find((sd) => newGame(sd).offers.some((o) => o.backhaul))!;
    const g = newGame(seed);
    const o = g.offers.find((x) => x.backhaul)!;
    const run = (retorno: boolean) => apply(apply(g, { t: "aceptar", oferta: o.id, docs: bestDocs("puntual"), ...(retorno ? { retorno } : {}) }), { t: "cerrar" });
    const withB = run(true), without = run(false);
    const inv = (s: SimState) => s.receivables.filter((i) => i.contractId === o.id).reduce((a, i) => a + i.amount, 0);
    expect(inv(withB) - inv(without)).toBeCloseTo(o.backhaul!.price, 2);
    expect(without.learning.find((l) => l.what.startsWith("Aceptar"))!.feedback).toMatch(/carga de retorno/);
    expect(() => apply(g, { t: "aceptar", oferta: g.offers.find((x) => !x.backhaul)!.id, retorno: true })).toThrow();
  });
  it("una partida guardada en v1 se reproduce con las reglas v1, sin aviso; una versión desconocida avisa", () => {
    const { actions, state } = play(77, "selectiva", 1);
    const p = parseSave(JSON.parse(JSON.stringify(toSave(77, actions, 1))));
    expect(p.ok && p.warning).toBeNull();
    if (!p.ok) return;
    const r = restore(p.save);
    expect(r.state.version).toBe(1);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(state));
    const future = parseSave({ app: "smartrade-simulador", version: 99, seed: 1, actions: [] });
    expect(future.ok && future.warning).toMatch(/versión 99/);
  });
  it("las partidas nuevas empiezan con la versión actual", () => {
    expect(newGame(1).version).toBe(ENGINE_VERSION);
    expect(ENGINE_VERSION).toBe(6);
  });
});

describe("guardado de todas las acciones", () => {
  it("una partida con negociación, documentación y carga de retorno se guarda y se recupera entera", () => {
    // Fallo en producción hasta el 09/11/2026: «proponer» no se reconocía y la partida no se podía cargar.
    for (const sd of SEEDS.slice(0, 10)) {
      const { actions, state } = play(sd, "negociadora");
      expect(actions.some((a) => a.t === "proponer")).toBe(true);
      const p = parseSave(JSON.parse(JSON.stringify(toSave(sd, actions, state.version))));
      expect(p.ok).toBe(true);
      if (!p.ok) return;
      const r = restore(p.save);
      expect(r.dropped).toBe(0);
      expect(JSON.stringify(r.state)).toBe(JSON.stringify(state));
    }
  }, 60_000);
  it("rechaza acciones con campos de tipo incorrecto", () => {
    expect(parseSave({ app: "smartrade-simulador", version: 2, seed: 1, actions: [{ t: "proponer", oferta: "s1-1", tarifa: "mucho", semanas: 4, plazo: 4 }] }).ok).toBe(false);
    expect(parseSave({ app: "smartrade-simulador", version: 2, seed: 1, actions: [{ t: "aceptar", oferta: "s1-1", docs: "porte" }] }).ok).toBe(false);
  });
});

describe("herramientas para crecer (docs/simulador.md §17 sexies)", () => {
  const close = (s: SimState) => { let x = apply(s, { t: "cerrar" }); while (x.status === "incidencia") x = apply(x, { t: "responder", incidencia: x.pending!.id, opcion: x.pending!.kind === "mora" ? "reclamar" : "subcontratar" }); return x; };
  it("subcontratar al aceptar: no ocupa tu camión, cuesta el precio de mercado a 30 días y se factura igual", () => {
    let s = newGame(3);
    const o = s.offers.find((x) => x.kind === "distribucion")!;
    // Con el camión libre, subcontratar es un error de criterio: hacerlo tú cuesta solo el variable.
    expect(gradeOffer(s, o, false, true).grade).toBe(o.ratePerKm! < GROWTH.subcontract.perKm ? "grave" : "razonable");
    s = apply(s, { t: "aceptar", oferta: o.id, subcontratar: true });
    expect(s.contracts[0].subcontracted).toBe(true);
    expect(kmOwnCommitted(s, 1)).toBe(0);
    expect(kmCommitted(s, 1)).toBe(o.kmWeek);
    s = close(s);
    const rec = s.weeks[0];
    const failed = rec.notes.some((n) => n.startsWith("El subcontratista no hizo"));
    expect(rec.kmOwn).toBe(0);
    expect(rec.kmSubcontracted).toBe(failed ? 0 : o.kmWeek);
    expect(rec.costSubcontract).toBeCloseTo(failed ? 0 : o.kmWeek! * GROWTH.subcontract.perKm, 2);
    if (!failed) expect(s.payables.some((p) => p.label.startsWith("Subcontratista") && p.dueWeek === 1 + GROWTH.subcontract.payWeeks)).toBe(true);
    expect(balanceGap(s)).toBe(0);
  });
  it("subcontratar tiene límites: el almacenaje no y no más de un camión de tus colaboradores", () => {
    const s = newGame(3);
    expect(() => apply(s, { t: "aceptar", oferta: s.offers.find((x) => x.kind === "almacenaje")!.id, subcontratar: true })).toThrow(/almacenaje/);
    const big = { ...s.offers.find((x) => x.kind === "distribucion")!, kmWeek: GROWTH.subcontract.maxKmWeek + 10 };
    expect(() => apply({ ...s, offers: [big] }, { t: "aceptar", oferta: big.id, subcontratar: true })).toThrow(/subcontratistas/);
  });
  it("el subcontratista falla alguna semana y el que responde ante el cliente eres tú", () => {
    const notes = SEEDS.slice(0, 40).flatMap((sd) => play(sd, "crecedora").state.weeks.flatMap((w) => w.notes));
    expect(notes.some((n) => n.startsWith("El subcontratista no hizo"))).toBe(true);
  }, 60_000);
  it("segundo camión en renting: dobla la capacidad desde la semana siguiente y suma cuota y conductor a los fijos", () => {
    let s = apply(newGame(5), { t: "crecer", opcion: "renting" });
    expect(gradeGrowth(newGame(5), "renting").grade).toBe("razonable"); // sin trabajo comprometido, es pronto
    expect(truckKmAt(s, 1)).toBe(TRUCK_KM_WEEK);
    expect(truckKmAt(s, 2)).toBe(2 * TRUCK_KM_WEEK);
    expect(() => apply(s, { t: "crecer", opcion: "compra" })).toThrow(/segundo camión/);
    s = close(close(s));
    expect(s.weeks[0].costFixed).toBe(FIXED_PER_WEEK);
    expect(s.weeks[1].costFixed).toBeCloseTo(FIXED_PER_WEEK + (GROWTH.truck.renting.monthly + GROWTH.truck.driverMonthly) / 4, 2);
    expect(balanceGap(s)).toBe(0);
  });
  it("comprar el camión sale de la caja de golpe, va al activo y se amortiza; sin colchón es un error grave", () => {
    const g = newGame(5);
    expect(gradeGrowth(g, "compra").grade).toBe("grave");
    let s = close(apply(g, { t: "crecer", opcion: "compra" }));
    expect(s.ledger.some((m) => m.label === "Compra del segundo camión" && m.amount === -GROWTH.truck.compra.price)).toBe(true);
    expect(s.truckValue).toBe(P.truckBookValue + GROWTH.truck.compra.price - P.amortizationWeek);
    s = close(s);
    expect(s.weeks[1].amortization).toBe(P.amortizationWeek + GROWTH.truck.compra.amortizationWeek);
    expect(balanceGap(s)).toBe(0);
    // Sin póliza, la caja negativa dos semanas seguidas es quiebra.
    expect(s.status).toBe("quiebra");
  });
  it("ampliar el almacén: más palés desde la semana siguiente, fianza de dos meses y la ocupación se mide sobre lo que tienes", () => {
    const g0 = newGame(9);
    let s = apply(apply(g0, { t: "aceptar", oferta: g0.offers.find((x) => x.kind === "almacenaje")!.id }), { t: "crecer", opcion: "almacen" });
    expect(palletCapacityAt(s, 2)).toBe(P.warehousePallets + GROWTH.warehouse.pallets);
    s = close(close(s));
    expect(s.deposit).toBe(P.deposit + GROWTH.warehouse.rentMonthly * GROWTH.warehouse.depositMonths);
    expect(s.weeks.map((w) => w.palletCapacity)).toEqual([P.warehousePallets, P.warehousePallets + GROWTH.warehouse.pallets]);
    expect(balanceGap(s)).toBe(0);
    // La ocupación se mide sobre los palés que había cada semana (600 y luego 1.000), no siempre sobre 600.
    const stored = s.weeks[0].palletsStored + s.weeks[1].palletsStored;
    expect(stored).toBeGreaterThan(0);
    expect(seasonOutcome(s).objectives.find((o) => o.id === "ocupacion")!.value).toBeCloseTo(stored / (2 * P.warehousePallets + GROWTH.warehouse.pallets) * 100, 2);
  });
  it("póliza: comisión de apertura, intereses solo por lo dispuesto y quiebra al pasar el límite", () => {
    let s = apply(apply(newGame(5), { t: "crecer", opcion: "poliza" }), { t: "crecer", opcion: "compra" });
    s = close(s);
    expect(s.weeks[0].costFinancial).toBe(GROWTH.credit.limit * GROWTH.credit.openingFee);
    expect(s.cash).toBeLessThan(0);
    expect(s.status).toBe("jugando");
    const start = s.cash;
    s = close(s);
    expect(s.weeks[1].costFinancial).toBeCloseTo(-start * GROWTH.credit.annualRate / 52, 2);
    expect(balanceGap(s)).toBe(0);
    while (s.status === "jugando") s = close(s);
    expect(s.status).toBe("quiebra");
    expect(s.endReason).toMatch(/límite de la póliza/);
    expect(s.weeks.at(-1)!.cashEnd).toBeLessThan(-GROWTH.credit.limit);
  });
  it("cada herramienta una sola vez, nunca con una incidencia pendiente ni en la última semana", () => {
    const s = apply(newGame(1), { t: "crecer", opcion: "poliza" });
    expect(() => apply(s, { t: "crecer", opcion: "poliza" })).toThrow(/póliza/);
    expect(() => apply({ ...s, status: "incidencia" }, { t: "crecer", opcion: "almacen" })).toThrow(/incidencia/);
    expect(() => apply({ ...s, week: SEASON_WEEKS }, { t: "crecer", opcion: "almacen" })).toThrow(/última semana/);
  });
  it("una temporada que crece cuadra en cada paso y se guarda y se recupera entera", () => {
    for (const sd of SEEDS.slice(0, 15)) {
      const { actions, state, maxGap } = play(sd, "crecedora");
      expect(maxGap).toBe(0);
      const p = parseSave(JSON.parse(JSON.stringify(toSave(sd, actions, state.version))));
      expect(p.ok).toBe(true);
      if (!p.ok) return;
      const r = restore(p.save);
      expect(r.dropped).toBe(0);
      expect(JSON.stringify(r.state)).toBe(JSON.stringify(state));
    }
    expect(SEEDS.slice(0, 15).some((sd) => play(sd, "crecedora").actions.some((a) => a.t === "crecer"))).toBe(true);
    expect(parseSave({ app: "smartrade-simulador", version: 3, seed: 1, actions: [{ t: "crecer", opcion: "avion" }] }).ok).toBe(false);
    expect(parseSave({ app: "smartrade-simulador", version: 3, seed: 1, actions: [{ t: "aceptar", oferta: "s1-1", subcontratar: "si" }] }).ok).toBe(false);
  }, 60_000);
  it("crecer bien da más victorias que no crecer, pero no las regala (300 semillas medidas, docs/simulador.md §17 sexies)", () => {
    const wins = (st: "negociadora" | "crecedora") => SEEDS.slice(0, 60).filter((sd) => seasonOutcome(play(sd, st).state).victory).length;
    const grow = wins("crecedora"), base = wins("negociadora");
    expect(grow).toBeGreaterThan(base);
    expect(grow).toBeLessThan(60);
  }, 120_000);
});

describe("reclamaciones con base legal (reglas v4, docs/simulador.md §17 septies)", () => {
  /** Juega con la estrategia prudente hasta que aparece la reclamación pedida y devuelve el estado con ella pendiente. */
  function until(kind: "dano" | "retraso" | "plazo", pred: (s: SimState) => boolean = () => true): SimState | null {
    for (const sd of SEEDS) {
      const { actions } = play(sd, "prudente");
      let s = newGame(sd);
      for (const a of actions) {
        if (s.status === "incidencia" && s.pending?.kind === kind && pred(s)) return s;
        s = apply(s, a);
      }
    }
    return null;
  }
  /** Responde y, si esa semana queda otra incidencia (desde la v6 puede haber del almacén), la resuelve bien. */
  const answer = (s: SimState, opcion: string) => {
    let x = apply(s, { t: "responder", incidencia: s.pending!.id, opcion });
    while (x.status === "incidencia") x = apply(x, { t: "responder", incidencia: x.pending!.id, opcion: incidentOptions(x.pending!, x.version).find((o) => o.grade === "correcta")!.id });
    return x;
  };
  const week = (s: SimState, w: number) => s.weeks.find((x) => x.week === w)!;
  const lastClaim = (x: SimState) => x.learning.filter((l) => /Reclamación|90 días/.test(l.what)).at(-1)!;

  it("solo en partidas v4: las guardadas con reglas anteriores no las ven", () => {
    expect(SEEDS.slice(0, 20).every((sd) => play(sd, "prudente", 3).state.learning.every((l) => !/Reclamación|90 días/.test(l.what)))).toBe(true);
    expect(SEEDS.slice(0, 20).some((sd) => play(sd, "prudente").state.learning.some((l) => /Reclamación/.test(l.what)))).toBe(true);
  }, 60_000);
  it("avería con reservas: respondes hasta el límite legal por kilo; rechazarla acaba en laudo y pierdes al cliente", () => {
    const s = until("dano", (x) => x.pending!.data.variant === "reservas")!;
    const { limit, claim, kg, client } = s.pending!.data as { limit: number; claim: number; kg: number; client: string };
    expect(limit).toBeCloseTo(kg * 600 / 30 / 3, 1);
    expect(claim).toBeGreaterThan(limit);
    const ok = answer(s, "limite");
    expect(lastClaim(ok).grade).toBe("correcta");
    expect(week(ok, s.week).costPenalties).toBeGreaterThanOrEqual(limit);
    expect(ok.ledger.some((m) => m.week === s.week && m.label.startsWith("Indemnización por avería") && m.amount === -limit)).toBe(true);
    const no = answer(s, "rechazar");
    expect(lastClaim(no).grade).toBe("grave");
    expect(no.contracts.filter((c) => c.clientId === client && c.endWeek > s.week).every((c) => c.cancelledWeek === s.week + 1)).toBe(true);
    expect(balanceGap(ok)).toBe(0); expect(balanceGap(no)).toBe(0);
  }, 60_000);
  it("avería reclamada tarde y sin reservas: con recibo firmado se rechaza; sin recibo, rechazarla sale caro", () => {
    const withR = until("dano", (x) => x.pending!.data.variant === "tardia_con_recibo")!;
    const r = answer(withR, "rechazar");
    expect(lastClaim(r).grade).toBe("correcta");
    expect(r.ledger.some((m) => m.week === withR.week && /avería/.test(m.label))).toBe(false);
    // Sin recibo: mismo caso pero con un contrato aceptado sin documentación (como hace la estrategia codiciosa).
    const noR = (() => { for (const sd of SEEDS) { const { actions } = play(sd, "codiciosa"); let s = newGame(sd); for (const a of actions) { if (s.pending?.kind === "dano" && s.pending.data.variant === "tardia_sin_recibo") return s; if (s.status === "quiebra") break; s = apply(s, a); } } return null; })()!;
    expect(noR).not.toBeNull();
    const lost = answer(noR, "rechazar");
    expect(lastClaim(lost).grade).toBe("razonable");
    expect(lost.ledger.some((m) => m.week === noR.week && m.label.startsWith("Laudo y costas") && m.amount === -(Number(noR.pending!.data.limit) + 300))).toBe(true);
  }, 120_000);
  it("retraso: como mucho el precio del transporte; si la causa no se podía evitar, no se responde", () => {
    const own = until("retraso", (x) => x.pending!.data.variant === "propia")!;
    const price = Number(own.pending!.data.price);
    expect(Number(own.pending!.data.claim)).toBeGreaterThan(price);
    const a = answer(own, "limite");
    expect(lastClaim(a).grade).toBe("correcta");
    expect(a.ledger.some((m) => m.week === own.week && m.label.startsWith("Indemnización por retraso") && m.amount === -price)).toBe(true);
    expect(lastClaim(answer(own, "exonerar")).grade).toBe("grave");
    const other = until("retraso", (x) => x.pending!.data.variant === "ajena")!;
    const b = answer(other, "exonerar");
    expect(lastClaim(b).grade).toBe("correcta");
    expect(b.ledger.some((m) => m.week === other.week && /retraso/.test(m.label))).toBe(false);
  }, 60_000);
  it("plazo: aceptar 90 días es un error grave y prorroga cobrando a 90; proponer 60 es lo correcto", () => {
    const s = until("plazo")!;
    const id = String(s.pending!.data.contract);
    const yes = answer(s, "aceptar");
    expect(lastClaim(yes).grade).toBe("grave");
    const ext = yes.contracts.find((c) => c.id === `${id}-prorroga`)!;
    expect(ext.startWeek).toBe(s.week + 1);
    expect(ext.payWeeks).toBe(12);
    expect(payTermLabel(ext.payWeeks)).toBe("90 días");
    const legal = answer(s, "legal");
    expect(lastClaim(legal).grade).toBe("correcta");
    const ext60 = legal.contracts.find((c) => c.id === `${id}-prorroga`);
    if (ext60) expect(ext60.payWeeks).toBe(8);
    expect(answer(s, "rechazar").contracts.some((c) => c.id === `${id}-prorroga`)).toBe(false);
  }, 60_000);
  it("cada reclamación aparece como mucho una vez por temporada y la partida se guarda y recupera entera", () => {
    for (const sd of SEEDS.slice(0, 10)) {
      const { actions, state, maxGap } = play(sd, "negociadora");
      expect(maxGap).toBe(0);
      for (const k of ["dano", "retraso", "plazo"]) expect(actions.filter((a) => a.t === "responder" && a.incidencia === k).length).toBeLessThanOrEqual(1);
      const p = parseSave(JSON.parse(JSON.stringify(toSave(sd, actions, state.version))));
      if (!p.ok) throw new Error("guardado");
      const r = restore(p.save);
      expect(r.dropped).toBe(0);
      expect(JSON.stringify(r.state)).toBe(JSON.stringify(state));
    }
  }, 60_000);
});

describe("viajes internacionales por carretera (reglas v5, docs/simulador.md §17 octies)", () => {
  const intlAt = (sd: number, version = 5) => { for (let w = 1; w <= SEASON_WEEKS; w++) { const o = offersFor(sd, w, 100, version).find((x) => x.kind === "internacional"); if (o) return o; } return null; };
  it("solo en partidas v5, desde la semana 5, y sin cambiar las demás ofertas", () => {
    for (const sd of SEEDS.slice(0, 30)) for (let w = 1; w <= SEASON_WEEKS; w++) {
      const v4 = offersFor(sd, w, 100, 4), v5 = offersFor(sd, w, 100, 5);
      expect(v4.some((o) => o.kind === "internacional")).toBe(false);
      expect(v5.filter((o) => o.kind !== "internacional")).toEqual(v4);
      if (w < 5) expect(v5.length).toBe(v4.length);
    }
    expect(SEEDS.slice(0, 30).filter((sd) => intlAt(sd)).length).toBeGreaterThan(25);
  });
  it("ocupa días enteros de camión y se califica contra su coste real (gasóleo, peajes extranjeros, dietas)", () => {
    const o = intlAt(SEEDS[0])!;
    expect(o.days).toBe(Math.ceil(2 * o.kmOneWay! / 600) + 1);
    expect(kmOf(o)).toBe(o.days! * P.kmPerDay);
    const d = directCost(o);
    expect(d.total).toBeCloseTo(2 * o.kmOneWay! * P.variablePerKm + o.tolls! + o.days! * 90, 2);
    const s = newGame(1, 5);
    const at = (price: number) => gradeOffer(s, { ...o, week: 1, price, backhaul: undefined }).grade;
    expect(at(Math.floor(d.total) - 1)).toBe("grave");
    expect(at(Math.ceil(d.total) + 1)).toBe("razonable");
    expect(at(Math.ceil(d.total + fixedShare(o.days!)) + 1)).toBe("correcta");
  });
  it("documentación: CMR y licencia comunitaria; sin licencia es grave, y el DUA sobra dentro de la UE", () => {
    expect(gradeDocs("internacional", bestDocs("internacional")).grade).toBe("correcta");
    const noLic = gradeDocs("internacional", ["cmr"]);
    expect(noLic.grade).toBe("grave");
    expect(noLic.issues).toContain("sin_licencia");
    expect(gradeDocs("internacional", ["cmr", "licencia", "dua"]).grade).toBe("razonable");
    expect(gradeDocs("internacional", ["control", "licencia"]).grade).toBe("razonable");
    expect(gradeDocs("internacional", ["licencia"]).issues).toContain("sin_control");
  });
  it("hecho con tu camión: se factura el precio y se paga el coste real del viaje; no se puede subcontratar", () => {
    const sd = SEEDS.find((x) => { const o = intlAt(x); return o && o.week >= 5; })!;
    const o = intlAt(sd)!;
    let s = newGame(sd, 5);
    while (s.week < o.week) { s = apply(s, { t: "cerrar" }); while (s.status === "incidencia") s = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: incidentOptions(s.pending!, s.version)[0].id }); }
    const offer = s.offers.find((x) => x.kind === "internacional")!;
    expect(() => apply(s, { t: "aceptar", oferta: offer.id, subcontratar: true })).toThrow(/nacional/);
    s = apply(s, { t: "aceptar", oferta: offer.id, docs: bestDocs("internacional") });
    s = apply(s, { t: "cerrar" });
    while (s.status === "incidencia") s = apply(s, { t: "responder", incidencia: s.pending!.id, opcion: incidentOptions(s.pending!, s.version)[0].id });
    const rec = s.weeks.find((w) => w.week === offer.week)!;
    const d = directCost(offer);
    if (rec.kmUnserved === 0) {
      expect(rec.revenueTransport).toBeCloseTo(offer.price!, 2);
      expect(rec.costVariable).toBeCloseTo(d.total, 2);
      expect(s.ledger.some((m) => m.week === offer.week && m.label === "Peajes extranjeros y dietas del conductor" && m.amount === -d.extras)).toBe(true);
    }
    expect(balanceGap(s)).toBe(0);
  });
  it("una temporada con viajes internacionales cuadra en cada paso y se guarda y recupera entera", () => {
    let seen = 0;
    for (const sd of SEEDS.slice(0, 20)) {
      const { actions, state, maxGap } = play(sd, "crecedora");
      expect(maxGap).toBe(0);
      if (state.contracts.some((c) => c.kind === "internacional")) seen++;
      const p = parseSave(JSON.parse(JSON.stringify(toSave(sd, actions, state.version))));
      if (!p.ok) throw new Error("guardado");
      expect(JSON.stringify(restore(p.save).state)).toBe(JSON.stringify(state));
    }
    expect(seen).toBeGreaterThan(0);
  }, 60_000);
});

describe("almacén a fondo (reglas v6, docs/simulador.md §17 nonies)", () => {
  const storageAt = (sd: number, version = 6) => { for (let w = 1; w <= SEASON_WEEKS; w++) { const o = offersFor(sd, w, 100, version).find((x) => x.kind === "almacenaje"); if (o) return o; } return null; };
  it("solo en partidas v6: el almacenaje cobra aparte movimientos y líneas, y el resto de las ofertas no cambia", () => {
    for (const sd of SEEDS.slice(0, 20)) for (let w = 1; w <= SEASON_WEEKS; w++) {
      const v5 = offersFor(sd, w, 100, 5), v6 = offersFor(sd, w, 100, 6);
      expect(v5.every((o) => o.movesWeek === undefined)).toBe(true);
      expect(v6.filter((o) => o.kind !== "almacenaje")).toEqual(v5.filter((o) => o.kind !== "almacenaje"));
      for (const o of v6.filter((x) => x.kind === "almacenaje")) {
        const old = v5.find((x) => x.id === o.id)!;
        expect({ ...o, palletRate: 0, movesWeek: 0, linesWeek: 0, moveRate: 0, lineRate: 0 }).toEqual({ ...old, palletRate: 0, movesWeek: 0, linesWeek: 0, moveRate: 0, lineRate: 0 });
        expect(weeklyRevenue(o)).toBeCloseTo(o.pallets! * o.palletRate! + o.movesWeek! * o.moveRate! + o.linesWeek! * o.lineRate!, 2);
      }
    }
  });
  it("el trabajo que pasa de la capacidad va a horas extra (hasta un 20 %) y lo demás no se hace ni se cobra", () => {
    const o = storageAt(SEEDS[0])!;
    const heavy = { ...o, week: 1, pallets: 500, movesWeek: 700, linesWeek: 1000, moveRate: 2, lineRate: 0.7 }; // 1,75 + 1 = 2,75 mozos
    let s = newGame(1, 6);
    s = apply({ ...s, offers: [heavy] }, { t: "aceptar", oferta: heavy.id, docs: bestDocs("almacenaje") });
    expect(s.learning[0].feedback).toMatch(/capacidad/);
    s = apply(s, { t: "cerrar" });
    const r = s.weeks[0];
    expect(r.workLoad).toBeCloseTo(2.75, 2);
    expect(r.workCapacity).toBe(1);
    expect(r.workUnserved).toBeCloseTo(2.75 - 1.2, 2);
    expect(r.costStaff).toBeCloseTo(0.2 * WORKER_WEEK * 1.4, 2);
    const undone = (2.75 - 1.2) / 2.75;
    expect(r.revenueWarehouse).toBeCloseTo(500 * heavy.palletRate! + (700 * 2 + 1000 * 0.7) * (1 - undone), 1);
    expect(r.serviceLevel).toBeLessThan(100);
    expect(balanceGap(s)).toBe(0);
  });
  it("un mozo temporal y la reorganización ABC suben la capacidad desde la semana siguiente", () => {
    let s = newGame(1, 6);
    expect(workCapacityAt(s, 2)).toBe(1);
    s = apply(apply(s, { t: "organizar", opcion: "temporal" }), { t: "organizar", opcion: "abc" });
    expect(() => apply(s, { t: "organizar", opcion: "abc" })).toThrow(/reorganizaste/);
    expect(() => apply(s, { t: "organizar", opcion: "temporal" })).toThrow(/temporal/);
    expect(workCapacityAt(s, 1)).toBe(1);
    expect(workCapacityAt(s, 2)).toBeCloseTo(2 * 1.15, 2);
    expect(workCapacityAt(s, 6)).toBeCloseTo(1.15, 2);
    s = apply(s, { t: "cerrar" });
    s = apply(s, { t: "cerrar" });
    expect(s.weeks[0].costStaff).toBe(900);
    expect(s.weeks[1].costStaff).toBe(650);
    expect(balanceGap(s)).toBe(0);
    expect(() => apply(newGame(1, 5), { t: "organizar", opcion: "abc" })).toThrow();
  });
  /** Juega con la estrategia selectiva hasta que aparece la incidencia pedida. */
  function until(kind: "stock" | "devoluciones"): SimState | null {
    for (const sd of SEEDS) { const { actions } = play(sd, "selectiva"); let s = newGame(sd); for (const a of actions) { if (s.status === "incidencia" && s.pending?.kind === kind) return s; s = apply(s, a); } }
    return null;
  }
  const settle = (x: SimState) => { while (x.status === "incidencia") x = apply(x, { t: "responder", incidencia: x.pending!.id, opcion: incidentOptions(x.pending!, x.version).find((o) => o.grade === "correcta")!.id }); return x; };
  const pick = (s: SimState, opcion: string) => settle(apply(s, { t: "responder", incidencia: s.pending!.id, opcion }));
  const graded = (x: SimState, what: string) => x.learning.filter((l) => l.what === what).at(-1)!.grade;
  it("punto de pedido = demanda diaria × plazo + stock de seguridad; olvidarlo o confundir días y semanas cuesta", () => {
    const s = until("stock")!;
    const d = s.pending!.data as Record<string, number>;
    expect(d.right).toBe(d.daily * d.lead + d.safety);
    const ok = pick(s, "pp");
    expect(graded(ok, "Calcular el punto de pedido")).toBe("correcta");
    const short = pick(s, "sin_ss");
    expect(graded(short, "Calcular el punto de pedido")).toBe("razonable");
    expect(short.ledger.some((m) => m.week === s.week && m.label.startsWith("Rotura de stock") && m.amount === -400)).toBe(true);
    expect(graded(pick(s, "semanas"), "Calcular el punto de pedido")).toBe("grave");
  }, 60_000);
  it("devoluciones: clasificarlas es un servicio que se cobra; tirarlas al contenedor es ilegal; guardarlas ocupa sitio", () => {
    const s = until("devoluciones")!;
    const p = Number(s.pending!.data.pallets), id = `${s.pending!.data.contract}-devoluciones`;
    const ok = pick(s, "clasificar");
    expect(graded(ok, "Llegan devoluciones de un cliente")).toBe("correcta");
    // Se factura lo que cabe en el almacén esa semana (si está lleno, no puedes recibirlas todas).
    const inv = ok.receivables.find((i) => i.contractId === id)!;
    expect(inv.amount).toBeGreaterThan(0);
    expect(inv.amount).toBeLessThanOrEqual(p * 8);
    expect(inv.amount % 8).toBe(0);
    expect(ok.ledger.some((m) => m.week === s.week && m.label.startsWith("Gestor de residuos") && m.amount === -p * 3)).toBe(true);
    const dump = pick(s, "contenedor");
    expect(graded(dump, "Llegan devoluciones de un cliente")).toBe("grave");
    expect(dump.ledger.some((m) => m.label.startsWith("Multa por residuos") && m.amount === -1500)).toBe(true);
    const hold = pick(s, "guardar");
    const c = hold.contracts.find((x) => x.id === id)!;
    expect(c.palletRate).toBe(0);
    expect(c.endWeek - c.startWeek + 1).toBe(4);
    for (const x of [ok, dump, hold]) expect(balanceGap(x)).toBe(0);
  }, 60_000);
  it("las partidas v6 cuadran en cada paso y se guardan y recuperan enteras, también con «organizar»", () => {
    let organized = 0;
    for (const sd of SEEDS.slice(0, 15)) {
      const { actions, state, maxGap } = play(sd, "crecedora");
      expect(maxGap).toBe(0);
      if (actions.some((a) => a.t === "organizar")) organized++;
      const p = parseSave(JSON.parse(JSON.stringify(toSave(sd, actions, state.version))));
      if (!p.ok) throw new Error("guardado");
      expect(JSON.stringify(restore(p.save).state)).toBe(JSON.stringify(state));
    }
    expect(organized).toBeGreaterThan(0);
    expect(parseSave({ app: "smartrade-simulador", version: 6, seed: 1, actions: [{ t: "organizar", opcion: "despedir" }] }).ok).toBe(false);
  }, 60_000);
});
