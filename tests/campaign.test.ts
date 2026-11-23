import { describe, expect, it } from "vitest";
import { apply, balanceGap, levelDef, levelResult, mastery, newCampaign, nextLevel, rescueAvailable, restore, toSave, whatIf, RESCUE } from "@/lib/sim/campaign/engine";
import { LEVELS } from "@/lib/sim/campaign/levels";
import { collectionDays, financialCost, FIN_LIMIT } from "@/lib/sim/campaign/levels/l3";
import { manualById } from "@/lib/sim/campaign/manual";
import type { Action, CampaignState } from "@/lib/sim/campaign/model";
import { L1_STRATEGIES, playCampaign, type Plan } from "@/lib/sim/campaign/strategies";
import { UPGRADES } from "@/lib/sim/campaign/upgrades";
import { COMPETENCE_LABELS } from "@/lib/sim/competences";

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

describe("guardado propio de la campaña", () => {
  it("una acción que ya no vale corta ahí y lo indica", () => {
    const acts: Action[] = [{ t: "empezar" }, { t: "cerrar" }];
    const r = restore({ seed: 3, levels: [acts] });
    expect(r.dropped).toBe(1);
    expect(r.levels[0]).toHaveLength(1);
  });
});
