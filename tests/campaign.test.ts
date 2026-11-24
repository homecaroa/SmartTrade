import { describe, expect, it } from "vitest";
import { apply, balanceGap, levelDef, levelResult, mastery, newCampaign, nextLevel, rescueAvailable, restore, toSave, whatIf, RESCUE } from "@/lib/sim/campaign/engine";
import { LEVELS } from "@/lib/sim/campaign/levels";
import { collectionDays, financialCost, FIN_LIMIT } from "@/lib/sim/campaign/levels/l3";
import { manualById } from "@/lib/sim/campaign/manual";
import type { Action, CampaignState } from "@/lib/sim/campaign/model";
import { L1_STRATEGIES, playCampaign, type Plan } from "@/lib/sim/campaign/strategies";
import { UPGRADES } from "@/lib/sim/campaign/upgrades";
import { ACHIEVEMENTS, achieved } from "@/lib/sim/campaign/achievements";
import { personWeekly } from "@/lib/sim/campaign/helpers";
import { LABOR } from "@/lib/sim/campaign/params";
import { incidentChance, resolveIncident } from "@/lib/sim/campaign/levels/l6";
import { COMPETENCE_LABELS } from "@/lib/sim/competences";
import { annuity, debtOutstanding } from "@/lib/sim/campaign/helpers";
import { churnChance, COMPETITION } from "@/lib/sim/campaign/levels/l7";
import { costPerKm, VEHICLES } from "@/lib/sim/campaign/levels/l8";
import { COLD, debtRatio, ebitdaYear, LOANS } from "@/lib/sim/campaign/levels/l9";

/**
 * Campaña (motor nuevo, 23/11/2026; docs/simulador-campana.md): empresa persistente, niveles 1-3, estrellas de
 * gestión y dominio aparte, y el requisito del dueño de que cada nivel tenga varias estrategias válidas.
 */
const SEEDS = Array.from({ length: 12 }, (_, i) => (i + 1) * 7919);
const starsOf = (s: CampaignState, lv: number) => { const r = s.results.find((x) => x.level === lv); return r?.passed ? r.stars.filter(Boolean).length : 0; };
const share = (plan: Plan, lv: number, min: number, rescue = false) => SEEDS.filter((sd) => starsOf(playCampaign(sd, plan, rescue).state, lv) >= min).length / SEEDS.length;

describe("motor: determinista, cuadrado y reproducible", () => {
  it("la contabilidad cuadra en cada acción, en todas las rutas", () => {
    for (const plan of [["premium", "poligono", "poliza"], ["volumen", "compartida", "cobrar-antes"], ["mala", "urbana", "austeridad"], ["equilibrio", "urbana", "mala"]] as Plan[]) {
      const { levels } = playCampaign(SEEDS[0], plan);
      let s = newCampaign(SEEDS[0]);
      levels.forEach((acts, i) => { if (i > 0) s = nextLevel(s); for (const a of acts) { s = apply(s, a); expect(balanceGap(s)).toBe(0); } });
    }
  }, 60_000);
  it("una campaña guardada se reconstruye idéntica, nivel a nivel", () => {
    const g = playCampaign(SEEDS[3], ["equilibrio", "poligono", "poliza"]);
    const r = restore(JSON.parse(JSON.stringify(toSave(SEEDS[3], g.levels, new Date(0)))));
    expect(r.dropped).toBe(0);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(g.state));
  });
  it("las reglas del bucle: no se cierra con decisiones pendientes; las mejoras solo en la sede; no se sigue sin superar el nivel", () => {
    let s = apply(newCampaign(1), { t: "empezar" });
    expect(s.pending.length).toBeGreaterThan(0);
    expect(() => apply(s, { t: "cerrar" })).toThrow(/decisiones/);
    expect(() => apply(s, { t: "mejora", id: "rutas" })).toThrow(/sede/);
    expect(() => apply(newCampaign(1), { t: "mejora", id: "rutas" })).toThrow(/no disponible/);
    const bad = playCampaign(SEEDS[0], ["mala"]).state;
    expect(bad.results[0].passed).toBe(false);
    expect(() => nextLevel(bad)).toThrow(/Supera/);
    s = apply(s, { t: "decidir", id: s.pending[0].id, opcion: s.pending[0].options[0].id });
    expect(s.answers[Object.keys(s.answers)[0]]).toBeDefined();
  });
});

describe("continuidad entre niveles", () => {
  it("los clientes del nivel 1 siguen trabajando en el 2 y en el 3; la nave del 2 sigue en el 3", () => {
    const { state: s } = playCampaign(SEEDS[1], ["equilibrio", "urbana", "austeridad"]);
    const l2 = s.logs.filter((l) => l.level === 1), l3 = s.logs.filter((l) => l.level === 2);
    expect(l2.every((l) => l.kmServed > 0)).toBe(true);
    expect(s.company.facility?.id).toBe("urbana");
    expect(l3.every((l) => l.palletCapacity === 200)).toBe(true);
    expect(s.company.deals.some((d) => d.id.startsWith("l1-") && !d.ended)).toBe(true);
  });
  it("las mejoras se compran en la sede del nivel siguiente, son inversiones y tienen efecto", () => {
    const { state: s1 } = playCampaign(SEEDS[1], ["equilibrio"]);
    let s = nextLevel(s1);
    const cash = s.company.cash;
    s = apply(s, { t: "mejora", id: "rutas" });
    expect(s.company.cash).toBe(cash - 1_200);
    expect(s.company.assets).toBeGreaterThanOrEqual(1_200);
    expect(() => apply(s, { t: "mejora", id: "estanterias" })).toThrow();
    expect(balanceGap(s)).toBe(0);
    for (const u of UPGRADES) expect(u.lesson.length).toBeGreaterThan(30);
  });
  it("el socio solo entra si empiezas un nivel con poca caja, y se queda con una parte de la empresa", () => {
    const { state: s2 } = playCampaign(SEEDS[0], ["equilibrio", "poligono"]);
    const s = nextLevel(s2);
    if (rescueAvailable(s)) {
      const r = apply(s, { t: "rescate" });
      expect(r.company.cash).toBe(s.company.cash + RESCUE.amount);
      expect(r.company.partnerShare).toBe(RESCUE.share);
      expect(balanceGap(r)).toBe(0);
    }
    expect(() => apply(newCampaign(1), { t: "rescate" })).toThrow();
  });
});

describe("varias estrategias válidas por nivel (requisito del dueño)", () => {
  it("nivel 1: premium, equilibrio y volumen superan el nivel; las tarifas económicas a todos, no", () => {
    for (const p of ["premium", "equilibrio", "volumen"] as const) expect(share([p], 0, 2)).toBe(1);
    expect(share(["mala"], 0, 1)).toBe(0);
    expect(L1_STRATEGIES).toHaveLength(4);
  }, 60_000);
  it("nivel 2: nave urbana, compartida y polígono valen; pagar el polígono al contado sin caja, no", () => {
    for (const p of ["urbana", "compartida"] as const) expect(share(["equilibrio", p], 1, 2)).toBe(1);
    expect(share(["premium", "poligono"], 1, 2)).toBe(1);
    expect(share(["equilibrio", "mala"], 1, 1)).toBe(0);
  }, 120_000);
  it("nivel 3: póliza, cobrar antes y austeridad valen; la mala se queda en una estrella como mucho", () => {
    for (const p of ["poliza", "cobrar-antes", "austeridad"] as const) expect(share(["equilibrio", "urbana", p], 2, 2)).toBe(1);
    expect(share(["equilibrio", "urbana", "mala"], 2, 2)).toBe(0);
    // Con el polígono y poca caja hace falta financiarse: con deuda (póliza) o con capital (socio).
    expect(share(["equilibrio", "poligono", "poliza"], 2, 2)).toBe(1);
    expect(share(["equilibrio", "poligono", "austeridad"], 2, 2, true)).toBe(1);
  }, 180_000);
});

describe("aprendizaje: aparte de las estrellas y con base legal", () => {
  it("el dominio sale de las decisiones, no de las estrellas", () => {
    const good = playCampaign(SEEDS[2], ["equilibrio", "urbana", "austeridad"]).state, bad = playCampaign(SEEDS[2], ["equilibrio", "urbana", "mala"]).state;
    const pct = (s: CampaignState, k: string) => mastery(s).find((m) => m.competence === k)?.pct ?? 0;
    expect(pct(good, "0623-RA5")).toBeGreaterThan(pct(bad, "0623-RA5"));
    expect(starsOf(bad, 2)).toBeGreaterThanOrEqual(1);
    for (const m of mastery(good)) expect(COMPETENCE_LABELS[m.competence]).toBeDefined();
  });
  it("nivel 3: 90 días es ilegal (Ley 3/2004, art. 4.3), reclamar suma los 40 € del art. 8 y pagar tarde sin pactar quita la ★★★", () => {
    const bad = playCampaign(SEEDS[2], ["equilibrio", "urbana", "mala"]).state;
    expect(bad.learning.find((l) => l.id === "plazo-bazar")!.grade).toBe("grave");
    expect(bad.learning.find((l) => l.id === "plazo-bazar")!.feedback).toMatch(/60 días.*art\. 4\.3/);
    expect(bad.company.memory).toContain("mal-pagador");
    expect(financialCost(bad)).toBeGreaterThan(FIN_LIMIT);
    const good = playCampaign(SEEDS[2], ["equilibrio", "urbana", "austeridad"]).state;
    expect(good.logs.some((l) => l.notes.some((n) => n.startsWith("Costes de cobro reclamados")))).toBe(true);
    expect(collectionDays(good)).toBeLessThanOrEqual(40);
  });
  it("cada concepto de cada nivel existe en el Manual y se desbloquea al empezar", () => {
    for (const L of LEVELS) for (const id of L.concepts) expect(manualById(id)).toBeDefined();
    const s = apply(newCampaign(1), { t: "empezar" });
    for (const id of LEVELS[0].concepts) expect(s.manual).toContain(id);
  });
  it("cada decisión importante trae una pista antes y una explicación después", () => {
    const { state: s } = playCampaign(SEEDS[4], ["equilibrio", "urbana", "poliza"]);
    for (const l of s.learning.filter((x) => x.key)) expect(l.feedback.length).toBeGreaterThan(60);
    let t = apply(newCampaign(SEEDS[4]), { t: "empezar" });
    for (const d of t.pending) expect(d.hint.length).toBeGreaterThan(30);
    t = apply(t, { t: "decidir", id: "tarifa-flor", opcion: "premium" });
    expect(levelDef(0).keyDecisions).toContain("tarifa-flor");
  });
  it("«qué habría pasado si»: cambiar una decisión importante cambia el final del nivel", () => {
    const g = playCampaign(SEEDS[5], ["equilibrio"]);
    const mine = levelResult(g.state, 0);
    const alt = whatIf({ seed: SEEDS[5], levels: g.levels }, 0, "tarifa-fresh", "economica");
    expect(alt.result).not.toBe(mine);
    const same = whatIf({ seed: SEEDS[5], levels: g.levels }, 0, "tarifa-fresh", "estandar");
    expect(same.result).toBeCloseTo(mine, 2);
  });
});

describe("reglas de la operación", () => {
  it("un encargo urgente aceptado ocupa la furgoneta y se factura", () => {
    // Semilla con un urgente en la semana 1 (se buscan, no se suponen).
    let s: CampaignState | null = null;
    for (let seed = 1; seed < 200 && !s; seed++) { const x = apply(newCampaign(seed), { t: "empezar" }); if (x.pending.some((d) => d.id.startsWith("urgente-"))) s = x; }
    s = s!;
    for (const id of ["tarifa-flor", "tarifa-fresh", "tarifa-imprenta"]) s = apply(s, { t: "decidir", id, opcion: "premium" });
    const u = s.pending.find((d) => d.id.startsWith("urgente-"))!;
    const km = Number(u.data!.km), rate = Number(u.data!.rate);
    const yes = apply(s, { t: "decidir", id: u.id, opcion: "aceptar" }), no = apply(s, { t: "decidir", id: u.id, opcion: "rechazar" });
    const close = (x: CampaignState) => { while (x.pending.length) x = apply(x, { t: "decidir", id: x.pending[0].id, opcion: "rechazar" }); return apply(x, { t: "cerrar" }); };
    const a = close(yes).logs.at(-1)!, b = close(no).logs.at(-1)!;
    expect(a.kmDemand - b.kmDemand).toBe(km);
    expect(a.kmServed - b.kmServed).toBe(km);
    expect(a.revenue - b.revenue).toBeCloseTo(km * rate, 2);
  });
  it("comprometer más de lo que cabe: al cliente que no sirves dos semanas seguidas, lo pierdes", () => {
    const { state: s } = playCampaign(SEEDS[0], ["mala"]);
    expect(s.company.deals.some((d) => d.ended && d.missed >= 2)).toBe(true);
    expect(s.logs.some((l) => l.notes.some((n) => /se va: dos semanas/.test(n)))).toBe(true);
  });
  it("reclamar la deuda suma los 40 € de costes de cobro como ingreso, no como gasto", () => {
    const good = playCampaign(SEEDS[2], ["equilibrio", "urbana", "austeridad"]).state;
    expect(good.logs.some((l) => l.notes.some((n) => n === "Costes de cobro reclamados (Ley 3/2004, art. 8): +40 €."))).toBe(true);
  });
});

describe("niveles 4 a 6 (23/11/2026)", () => {
  const P1 = ["equilibrio", "urbana", "poliza", "experta"] as const;
  it("nivel 4: experta, junior y flexible superan el nivel; no contratar a nadie, no", () => {
    for (const x of ["experta", "junior", "flexible"] as const) expect(share([...P1.slice(0, 3), x] as unknown as Plan, 3, 1)).toBe(1);
    expect(share([...P1.slice(0, 3), "mala"] as unknown as Plan, 3, 1)).toBe(0);
  }, 120_000);
  it("nivel 4: el coste de una persona es el sueldo más las cotizaciones de 2026; el temporal cotiza más", () => {
    const g = playCampaign(SEEDS[0], [...P1.slice(0, 3), "junior"] as unknown as Plan).state;
    const javi = g.company.staff!.find((p) => p.id === "javi")!;
    expect(personWeekly(javi)).toBeCloseTo(javi.salaryMonthly * (1 + 0.236 + 0.055 + 0.002 + 0.006 + 0.0075 + 0.015) / 4, 2);
    expect(LABOR.employerRate.temporal - LABOR.employerRate.indefinido).toBeCloseTo(0.012, 4);
    const fb = g.learning.find((l) => l.id === "conductor")!.feedback;
    expect(fb).toMatch(/art\. 14\.1/);
    expect(LABOR.smi).toBe(1_221);
    for (const c of [1_400, 2_000]) expect(c).toBeGreaterThan(LABOR.smi);
  });
  it("nivel 4: el temporal del pico se va solo al acabar su contrato", () => {
    const g = playCampaign(SEEDS[1], [...P1.slice(0, 3), "junior"] as unknown as Plan).state;
    const tmp = g.company.staff!.find((p) => p.id === "temporal-pico");
    if (tmp) { expect(tmp.left).toBe(true); expect(tmp.endAbs! - tmp.startAbs + 1).toBe(3); }
  });
  it("nivel 5: paquete equilibrado y concesiones cruzadas consiguen ★★; aceptar su primera oferta nunca la ★★★", () => {
    for (const x of ["equilibrado", "cruzado"] as const) expect(share([...P1, x] as unknown as Plan, 4, 2)).toBe(1);
    expect(share([...P1, "alternativa"] as unknown as Plan, 4, 1)).toBe(1);
    expect(share([...P1, "mala"] as unknown as Plan, 4, 3)).toBe(0);
    const bad = playCampaign(SEEDS[0], [...P1, "mala"] as unknown as Plan).state;
    expect(bad.learning.find((l) => l.id === "apertura")!.grade).toBe("grave");
  }, 120_000);
  it("nivel 5: si te falta capacidad para el acuerdo hay que decidir; el almacén externo no ocupa tu nave", () => {
    const g = playCampaign(SEEDS[2], [...P1, "cruzado"] as unknown as Plan).state;
    const cap = g.learning.find((l) => l.id === "capacidad");
    expect(cap).toBeDefined();
    // Nave urbana (200 palés) con Bazar (150): los 120 de Hiper no caben y van a un espacio externo, sin fallar.
    const ext = g.company.deals.find((d) => d.id === "l5-hiper-externo")!;
    expect(ext.external).toBe(true);
    const after = g.logs.filter((x) => x.level === 4 && x.abs > ext.fromAbs);
    expect(after.length).toBeGreaterThan(0);
    for (const l of after) expect(l.notes.some((n) => /palés de Grupo Hiper Levante \(ficticia\) no caben/.test(n))).toBe(false);
    expect(balanceGap(g)).toBe(0);
  });
  it("nivel 6: prevención, selectiva y seguro superan la auditoría; no prevenir y responder mal, no", () => {
    for (const x of ["prevencion", "selectiva", "seguro"] as const) expect(share([...P1, "cruzado", x] as unknown as Plan, 5, 1)).toBe(1);
    expect(share([...P1, "cruzado", "mala"] as unknown as Plan, 5, 1)).toBe(0);
    const g = playCampaign(SEEDS[3], [...P1, "cruzado", "selectiva"] as unknown as Plan).state;
    for (const l of g.learning.filter((x) => x.id.startsWith("incidencia-"))) expect(l.feedback).toMatch(/art\. \d+/);
  }, 120_000);
  it("nivel 6: el seguro deja las incidencias graves en la franquicia; la prevención baja la probabilidad", () => {
    const s = newCampaign(1);
    expect(resolveIncident(s, "ausente", "puerta").cost).toBe(900);
    s.answers["prev-seguro"] = "si";
    expect(resolveIncident(s, "ausente", "puerta").cost).toBe(150);
    expect(resolveIncident(s, "estiba", "indicar").cost).toBe(150);
    const base = incidentChance(newCampaign(1));
    const t = newCampaign(1); t.answers["prev-formacion"] = "si"; t.answers["prev-procedimiento"] = "si";
    expect(incidentChance(t)).toBeCloseTo(base * 0.6 * 0.7, 6);
    expect(base).toBeCloseTo(0.65, 6);
    // Y el nivel la usa de verdad: en 300 semanas, con prevención salen muchas menos incidencias.
    const count = (prev: boolean) => {
      let n = 0;
      for (let abs = 100; abs < 400; abs++) {
        const x = newCampaign(7); x.level = 5; x.week = 3; x.abs = abs; x.status = "jugando"; x.data = { auditor: "bazar" };
        if (prev) { x.answers["prev-formacion"] = "si"; x.answers["prev-procedimiento"] = "si"; }
        n += levelDef(5).decisionsAt(x).filter((d) => d.id.startsWith("incidencia-")).length;
      }
      return n;
    };
    expect(count(true)).toBeLessThan(count(false) * 0.6);
  });
  it("una campaña entera de seis niveles se puede completar por rutas muy distintas", () => {
    const routes: [Plan, boolean][] = [[["equilibrio", "urbana", "poliza", "experta", "cruzado", "prevencion"], false], [["premium", "compartida", "austeridad", "junior", "equilibrado", "selectiva"], false], [["equilibrio", "poligono", "poliza", "flexible", "alternativa", "seguro"], false], [["volumen", "urbana", "cobrar-antes", "experta", "equilibrado", "seguro"], true]];
    for (const [plan, rescue] of routes) { const s = playCampaign(SEEDS[4], plan, rescue).state; expect(s.results.filter((r) => r.passed)).toHaveLength(6); expect(balanceGap(s)).toBe(0); }
  }, 120_000);
  it("los logros salen del estado y no se guardan", () => {
    const s = playCampaign(SEEDS[0], ["equilibrio"]).state;
    expect(achieved(s)).toEqual(expect.arrayContaining(["cliente-fijo", "mision"]));
    expect(achieved(newCampaign(1))).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/cliente-fijo/);
    for (const a of ACHIEVEMENTS) expect(a.text.length).toBeGreaterThan(10);
  });
});

describe("niveles 7 a 9 (24/11/2026)", () => {
  const P6 = ["equilibrio", "urbana", "poliza", "experta", "cruzado", "prevencion"] as const;
  const plan = (...xs: string[]) => [...P6, ...xs] as unknown as Plan;
  /** Estrellas en el nivel `lv` de las semillas que llegan a él (las que no, no cuentan). */
  const reached = (p: Plan, lv: number) => SEEDS.map((sd) => playCampaign(sd, p).state).filter((s) => s.results.some((r) => r.level === lv)).map((s) => starsOf(s, lv));
  it("la contabilidad cuadra en cada acción también con préstamos, leasing y socio", () => {
    for (const p of [plan("contratos", "leasing", "fijo"), plan("servicio", "renting", "socio"), plan("guerra", "camion", "variable")]) {
      const { levels } = playCampaign(SEEDS[0], p);
      let s = newCampaign(SEEDS[0]);
      levels.forEach((acts, i) => { if (i > 0) s = nextLevel(s); for (const a of acts) { s = apply(s, a); expect(balanceGap(s)).toBe(0); } });
      expect(s.level).toBeGreaterThanOrEqual(7);
    }
  }, 120_000);
  it("nivel 7: servicio, contratos y bajar precios superan el nivel en la mayoría de semillas; pactar con el rival, nunca", () => {
    // Medido el 24/11/2026 con estas 12 semillas: servicio 10, contratos 9, guerra 9 (la competencia es aleatoria).
    expect(share(plan("servicio"), 6, 1)).toBeGreaterThanOrEqual(0.8);
    expect(share(plan("contratos"), 6, 1)).toBeGreaterThanOrEqual(0.75);
    expect(share(plan("guerra"), 6, 1)).toBeGreaterThanOrEqual(0.75);
    expect(share(plan("mala"), 6, 1)).toBe(0);
  }, 120_000);
  it("nivel 7: el pacto de precios es ilegal (LDC art. 1.1), se descubre y se multa; mientras dura, nadie se va", () => {
    const g = playCampaign(SEEDS[0], plan("mala")).state;
    const fb = g.learning.find((l) => l.id === "respuesta")!;
    expect(fb.grade).toBe("grave");
    expect(fb.feedback).toMatch(/art\. 1\.1/);
    expect(fb.feedback).toMatch(/63\.1\.c/);
    const w4 = g.logs.find((l) => l.level === 6 && l.week === 4)!;
    expect(w4.notes.some((n) => /denuncia el acuerdo/.test(n))).toBe(true);
    expect(w4.other).toBeGreaterThanOrEqual(COMPETITION.fine);
    const s = newCampaign(1); s.data = { pact: true, rivalCut: 0.15 };
    const d = { id: "x", client: "flor", kind: "transporte" as const, km: 200, rate: 1, payWeeks: 4, fromAbs: 1, missed: 0 };
    expect(churnChance(s, d)).toBe(0);
    s.data.caught = true; expect(churnChance(s, d)).toBeGreaterThan(0);
  });
  it("nivel 7: la probabilidad de perder un cliente sube con la diferencia de precio y baja con el servicio y la relación", () => {
    const s = newCampaign(1); s.data = { rivalCut: 0.15 };
    const d = { id: "x", client: "flor", kind: "transporte" as const, km: 200, rate: 1, payWeeks: 4, fromAbs: 1, missed: 0 };
    const base = churnChance(s, d);
    expect(base).toBeCloseTo(COMPETITION.churnK * 0.15 * 1, 6);
    s.company.relation.flor = 90; expect(churnChance(s, d)).toBeLessThan(base);
    s.company.relation.flor = 50; s.data.response = "servicio"; expect(churnChance(s, d)).toBeCloseTo(base * COMPETITION.serviceFactor, 6);
    s.data.response = ""; s.data.rivalCut = 0.03; expect(churnChance(s, d)).toBeLessThan(base / 4);
  });
  it("nivel 7: el temporal que acaba en el nivel se puede hacer indefinido (art. 15.2) y entonces no se va", () => {
    const g = playCampaign(SEEDS[0], ["equilibrio", "urbana", "poliza", "flexible", "cruzado", "prevencion", "servicio"] as unknown as Plan).state;
    const r = g.learning.find((l) => l.id.startsWith("renovar-"));
    if (g.level >= 6 && r) {
      expect(r.feedback).toMatch(/art\. 15\.2/);
      const javi = g.company.staff!.find((p) => p.id.startsWith("javi"))!;
      expect(javi.contract).toBe("indefinido"); expect(javi.left).toBeFalsy();
    }
  });
  it("nivel 8: renting, leasing y camión consiguen ★★ donde se llega; comprar el camión al contado sin caja, no", () => {
    for (const x of ["renting", "leasing", "camion"]) { const r = reached(plan("servicio", x), 7); expect(r.length).toBeGreaterThan(6); expect(r.filter((n) => n >= 2).length / r.length).toBeGreaterThanOrEqual(0.85); }
    expect(reached(plan("servicio", "mala"), 7).every((n) => n === 0)).toBe(true);
  }, 180_000);
  it("nivel 8: el leasing lleva al balance el vehículo y una deuda por el mismo importe (PGC 8.ª); el renting, no", () => {
    const run = (x: string) => { let s = playCampaign(SEEDS[1], plan("servicio")).state; s = nextLevel(s); s = apply(s, { t: "empezar" }); const assets0 = s.company.assets; s = apply(s, { t: "decidir", id: "vehiculo", opcion: "furgoneta" }); s = apply(s, { t: "decidir", id: "financiacion", opcion: x }); return { s, dAssets: s.company.assets - assets0 }; };
    const l = run("leasing");
    expect(l.dAssets).toBe(VEHICLES.furgoneta.price);
    expect(debtOutstanding(l.s.company)).toBe(VEHICLES.furgoneta.price);
    expect(balanceGap(l.s)).toBe(0);
    expect(l.s.learning.at(-1)!.feedback).toMatch(/8\.ª, 1\.2/);
    const r = run("renting");
    expect(r.dAssets).toBe(0);
    expect(r.s.company.loans).toBeUndefined();
    expect(r.s.company.vehicles.at(-1)!.monthly).toBe(VEHICLES.furgoneta.renting);
  });
  it("nivel 8: rechazar a los clientes nuevos no supera el nivel", () => {
    let s = nextLevel(playCampaign(SEEDS[1], plan("servicio")).state);
    s = apply(s, { t: "empezar" });
    for (let i = 0; i < 300 && s.status === "jugando"; i++) s = s.pending.length ? apply(s, { t: "decidir", id: s.pending[0].id, opcion: s.pending[0].id === "vehiculo" ? "rechazar" : s.pending[0].options.at(-1)!.id }) : apply(s, { t: "cerrar" });
    expect(s.results.at(-1)!.passed).toBe(false);
    expect(s.learning.find((l) => l.id === "vehiculo")!.grade).toBe("grave");
  }, 60_000);
  it("nivel 8: el coste por km del vehículo nuevo sale de sus costes y de sus km, y queda por debajo del subcontratista", () => {
    const g = playCampaign(SEEDS[1], plan("servicio", "renting")).state;
    expect(costPerKm(g)).toBeGreaterThan(0.5);
    expect(costPerKm(g)).toBeLessThan(1.05);
    expect(Number(g.data.newKmDone)).toBeGreaterThan(5_000);
  }, 60_000);
  it("cuotas: sistema francés, los intereses son gasto y el resto devuelve deuda", () => {
    expect(annuity(45_000, 0.07, 60)).toBeCloseTo(891.05, 1);
    const g = playCampaign(SEEDS[1], plan("servicio", "renting", "fijo")).state;
    const loan = g.company.loans!.find((l) => l.id === "l9-prestamo")!;
    const paid = g.logs.filter((l) => l.level === 8 && l.notes.some((n) => n.startsWith("Cuota de el préstamo")));
    expect(paid.length).toBeGreaterThanOrEqual(1);
    expect(loan.principal).toBeLessThan(COLD.cost);
    expect(loan.principal).toBeGreaterThan(COLD.cost - paid.length * loan.monthly);
    // Los intereses de la cuota (los que dice la nota) entran en el gasto financiero de esa semana.
    for (const l of paid) { const m = l.notes.find((n) => n.startsWith("Cuota de el préstamo"))!.match(/\(([\d.,]+) € de intereses\)/)!; expect(l.financial).toBeGreaterThanOrEqual(Number(m[1].replace(/\./g, "").replace(",", "."))); }
  }, 60_000);
  it("nivel 9: fijo, variable y socio ponen en marcha la cámara; autónomo con impago, no", () => {
    for (const x of ["fijo", "variable", "socio"]) { const r = reached(plan("servicio", "renting", x), 8); expect(r.length).toBeGreaterThan(6); expect(r.every((n) => n >= 1)).toBe(true); }
    expect(reached(plan("servicio", "renting", "mala"), 8).every((n) => n === 0)).toBe(true);
  }, 180_000);
  it("nivel 9: la SL separa tu patrimonio (LSC art. 1.2) salvo que avales; el aval quita la ★★★", () => {
    const sinAval = playCampaign(SEEDS[1], plan("servicio", "renting", "fijo")).state;
    expect(sinAval.company.legal).toEqual({ form: "sl", capital: 3_000 });
    expect(sinAval.results.at(-1)!.stars[2]).toBe(true);
    expect(sinAval.company.loans!.find((l) => l.id === "l9-prestamo")!.annualRate).toBeCloseTo(LOANS.fixed.rate + LOANS.noGuaranteeSpread, 6);
    const aval = playCampaign(SEEDS[1], plan("servicio", "renting", "variable")).state;
    expect(aval.company.legal!.avalPersonal).toBe(true);
    expect(aval.results.at(-1)!.stars[2]).toBe(false);
    expect(aval.learning.find((l) => l.id === "forma")!.feedback).toMatch(/art\. 1\.2/);
    // El variable sube en la semana 5.
    expect(aval.company.loans!.find((l) => l.id === "l9-prestamo")!.annualRate).toBeCloseTo(LOANS.variable.rate + LOANS.variable.shock, 6);
    const mala = playCampaign(SEEDS[1], plan("servicio", "renting", "mala")).state;
    expect(mala.learning.find((l) => l.id === "cuota")!.grade).toBe("grave");
    expect(mala.company.legal).toBeUndefined();
  }, 60_000);
  it("nivel 9: deuda ÷ EBITDA con lo que genera el negocio; sin beneficio, infinito", () => {
    const s = newCampaign(1);
    expect(debtRatio(s)).toBe(0);
    expect(debtRatio(s, 10_000)).toBe(Infinity);
    s.logs.push({ abs: 1, week: 1, level: 0, revenue: 1_000, variable: 200, fixed: 300, financial: 50, other: 0, amortization: 30, result: 420, kmDemand: 0, kmCapacity: 0, kmServed: 0, pallets: 0, palletCapacity: 0, collections: 0, payments: 0, cashEnd: 0, notes: [] });
    expect(ebitdaYear(s)).toBe(500 * 52);
    expect(debtRatio(s, 26_000)).toBe(1);
  });
});

describe("guardado propio de la campaña", () => {
  it("una acción que ya no vale corta ahí y lo indica", () => {
    const acts: Action[] = [{ t: "empezar" }, { t: "cerrar" }];
    const r = restore({ seed: 3, levels: [acts] });
    expect(r.dropped).toBe(1);
    expect(r.levels[0]).toHaveLength(1);
  });
});
