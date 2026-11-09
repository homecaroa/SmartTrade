import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apply, balanceGap, breakdownOf, gradeOffer, kmCommitted, newGame, replay, TRUCK_FULL_COST_PER_KM } from "@/lib/sim/engine";
import { kmOf, offersFor, withReputation } from "@/lib/sim/market";
import type { Action, Offer, SimState } from "@/lib/sim/model";
import { FIXED_PER_MONTH, P, payTermLabel, PHASE1_WEEKS, TRUCK_KM_WEEK } from "@/lib/sim/params";
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
    for (const seed of SEEDS) for (const st of ["nada", "codiciosa", "prudente"] as const) expect(play(seed, st).maxGap).toBe(0);
  });
  it("los fijos se devengan cada semana y se pagan juntos cada 4 semanas", () => {
    const s = play(11, "nada").state;
    const fixedPay = s.ledger.filter((m) => m.label.startsWith("Alquiler, nóminas"));
    expect(fixedPay).toEqual([{ week: 4, label: expect.any(String), amount: -FIXED_PER_MONTH }]);
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

describe("equilibrio (estrategias automáticas, 200 semillas)", () => {
  const results = (st: "nada" | "codiciosa" | "prudente") => SEEDS.map((seed) => play(seed, st).state);
  const nada = results("nada"), codiciosa = results("codiciosa"), prudente = results("prudente");
  const mean = (xs: SimState[], f: (s: SimState) => number) => xs.reduce((a, s) => a + f(s), 0) / xs.length;
  it("no hacer nada es siempre lo peor", () => {
    SEEDS.forEach((_, i) => expect(nada[i].result).toBeLessThan(prudente[i].result));
  });
  it("la estrategia prudente gana a la de aceptarlo todo en la mayoría de partidas, pero no en todas", () => {
    const wins = SEEDS.filter((_, i) => prudente[i].result > codiciosa[i].result).length;
    expect(wins / SEEDS.length).toBeGreaterThan(0.8);
    expect(wins).toBeLessThan(SEEDS.length);
  });
  it("aceptarlo todo hunde el nivel de servicio; la prudente lo mantiene", () => {
    expect(mean(codiciosa, (s) => s.weeks.reduce((a, w) => a + w.serviceLevel, 0) / s.weeks.length)).toBeLessThan(80);
    expect(mean(prudente, (s) => s.weeks.reduce((a, w) => a + w.serviceLevel, 0) / s.weeks.length)).toBeGreaterThan(95);
  });
  it("la empresa que empieza pierde dinero, pero bien gestionada va hacia el equilibrio", () => {
    const first = mean(prudente, (s) => s.weeks[0].result), last = mean(prudente, (s) => s.weeks[PHASE1_WEEKS - 1].result);
    expect(last).toBeGreaterThan(first);
    expect(prudente.every((s) => s.status === "fin")).toBe(true);
  });
});

describe("normativa y reglas de pago", () => {
  it("el transporte se factura a 30 días (mora a los 30 días, Ley 15/2009, art. 41) y nada a más de 60 (Ley 3/2004, art. 4)", () => {
    for (const seed of SEEDS.slice(0, 50)) for (let w = 1; w <= PHASE1_WEEKS; w++) for (const o of offersFor(seed, w)) {
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
    expect(after.status).toBe("fin");
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
