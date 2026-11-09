import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apply, balanceGap, breakdownOf, breakdownsOf, cashByConcept, cashStart, clientHistory, gradeOffer, kmCommitted, newGame, replay, seasonOutcome, TRUCK_FULL_COST_PER_KM } from "@/lib/sim/engine";
import { bestDocs, clientLimits, gradeDocs, respond, roundRate, termsOf, validateProposal } from "@/lib/sim/deal";
import { evaluate } from "@/lib/sim/calc";
import { kmOf, offersFor, reputationEffect, withReputation } from "@/lib/sim/market";
import type { Action, Offer, SimState } from "@/lib/sim/model";
import { FIXED_PER_MONTH, P, payTermLabel, SEASON_WEEKS, TRUCK_KM_WEEK } from "@/lib/sim/params";
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
    expect(codiciosa.filter((s) => s.status === "quiebra" && /servicio/.test(s.endReason ?? "")).length / SEEDS.length).toBeGreaterThan(0.9);
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
      for (let w = 1; w <= 6; w++) { const n = offersFor(seed, w, 100).length; expect(n).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(5); }
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
    expect(rec.costSubcontract).toBeCloseTo(rec.kmSubcontracted * P.subcontractPerKm, 2);
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
    expect(old.ok && old.warning).toMatch(/versión 0/);
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
      const cash = state.ledger.filter((m) => m.label.startsWith("Sanciones")).reduce((a, m) => a - m.amount, 0);
      expect(pen).toBe(cash);
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
