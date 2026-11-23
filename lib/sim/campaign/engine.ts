import { round2, sum } from "../../learning/money";
import { LEVELS, type LevelDef } from "./levels";
import type { Action, CampaignSave, CampaignState, Company, Decision, LearningRec, WeekLog } from "./model";
import { BANKRUPT_WEEKS, CAMPAIGN_VERSION, REPUTATION, START, SUB_RATE, VAN } from "./params";
import { decideSpot } from "./spot";
import { decideLead } from "./leads";
import { has, upgradeById, UPGRADES } from "./upgrades";
import { activeDeals, capacityKm, charge, clientName, invest, learn, palletCapacity, relate, remember, staffWeekly, transportKm, unlock, variablePerKm, weeklyFixed } from "./helpers";
export * from "./helpers";

/**
 * Motor de la campaña (23/11/2026; docs/simulador-campana.md). NUEVO y separado del de la Temporada y la Carrera
 * (decisión del dueño, 23/11/2026): no comparte su estado ni sus versiones, así que sus partidas no corren ningún riesgo.
 *
 * Puro y determinista: el estado se obtiene aplicando las acciones en orden, nivel a nivel, desde la semilla. Nada de
 * Math.random ni de la hora del sistema.
 *
 * Contabilidad (se comprueba en cada paso, balanceGap): caja + clientes pendientes + fianzas + inmovilizado = capital +
 * resultado acumulado + proveedores pendientes.
 */

const clone = <T>(x: T): T => structuredClone(x);
export const levelDef = (i: number): LevelDef => LEVELS[i];

export function newCompany(): Company {
  return {
    name: "Tu empresa de transporte", cash: START.cash, capital: START.cash, partnerShare: 0, result: 0,
    vehicles: [{ ...VAN }], facility: null, deals: [], invoices: [], payables: [], deposits: 0, assets: 0, assetsWeekly: 0,
    credit: null, relation: {}, reputation: { fiabilidad: 70, precio: 50 }, upgrades: [], memory: [],
  };
}

export function newCampaign(seed: number): CampaignState {
  return { version: CAMPAIGN_VERSION, seed: seed >>> 0, company: newCompany(), level: 0, week: 0, abs: 1, status: "sede", pending: [], answers: {}, logs: [], learning: [], manual: [], debrief: {}, data: {}, results: [], negativeWeeks: 0, charges: [], history: [] };
}

// ── Acciones ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function apply(prev: CampaignState, a: Action): CampaignState {
  const s = clone(prev);
  const def = levelDef(s.level);
  if (a.t === "mejora") {
    if (s.status !== "sede") throw new Error("Las mejoras se compran en la sede, entre niveles.");
    const u = upgradeById(a.id);
    if (!u || u.unlockAfter > s.level) throw new Error("Mejora no disponible.");
    if (has(s.company, u.id)) throw new Error("Ya tienes esta mejora.");
    const why = u.requires?.(s.company);
    if (why) throw new Error(why);
    if (s.company.cash < u.cost) throw new Error("No tienes caja suficiente.");
    invest(s, u.cost, 156);
    s.company.upgrades.push(u.id);
    return s;
  }
  if (a.t === "rescate") {
    if (s.status !== "sede" || !rescueAvailable(s)) throw new Error("No hace falta un socio ahora.");
    s.company.cash = round2(s.company.cash + RESCUE.amount); s.company.capital = round2(s.company.capital + RESCUE.amount);
    s.company.partnerShare = Math.min(90, s.company.partnerShare + RESCUE.share);
    remember(s, `socio-nivel-${s.level + 1}`);
    return s;
  }
  if (a.t === "empezar") {
    if (s.status !== "sede") throw new Error("El nivel ya ha empezado.");
    s.status = "jugando"; s.week = 1;
    def.start(s);
    unlock(s, ...def.concepts);
    s.pending = def.decisionsAt(s);
    return s;
  }
  if (a.t === "pregunta") {
    if (s.status !== "fin_nivel" && s.status !== "quiebra") throw new Error("Las preguntas son del informe final.");
    const q = def.debrief(s).find((x) => x.id === a.id);
    if (!q || s.debrief[a.id]) throw new Error("Pregunta no disponible.");
    const o = q.options.find((x) => x.id === a.opcion);
    if (!o) throw new Error("Opción no válida.");
    s.debrief[a.id] = a.opcion;
    s.learning.push({ week: s.week, level: s.level, id: a.id, what: `Informe del nivel ${s.level + 1}: ${q.topic}`, answer: o.label, grade: o.grade, feedback: o.feedback, competences: q.competences, key: false });
    return s;
  }
  if (s.status !== "jugando") throw new Error(s.status === "sede" ? "Primero empieza el nivel." : "El nivel ha terminado.");
  if (a.t === "decidir") {
    const d = s.pending.find((x) => x.id === a.id);
    if (!d) throw new Error("No hay esa decisión pendiente.");
    if (!d.options.some((o) => o.id === a.opcion)) throw new Error("Opción no válida.");
    s.answers[a.id] = a.opcion;
    s.pending = s.pending.filter((x) => x.id !== a.id);
    if (d.key) s.history.push({ level: s.level, week: s.week, id: d.id, title: d.title, options: d.options, chosen: a.opcion });
    if (a.id.startsWith("urgente-")) decideSpot(s, d, a.opcion);
    else if (a.id.startsWith("cliente-")) decideLead(s, d, a.opcion);
    else def.decide(s, d, a.opcion);
    return s;
  }
  // cerrar
  if (s.pending.length) throw new Error("Te quedan decisiones de esta semana.");
  resolveWeek(s, def);
  if (s.status !== "jugando") return s;
  if (s.week >= def.weeks) { finishLevel(s, def); return s; }
  s.week += 1; s.abs += 1;
  s.pending = def.decisionsAt(s);
  return s;
}

// ── La semana ─────────────────────────────────────────────────────────────────────────────────────────────────────

function resolveWeek(s: CampaignState, def: LevelDef) {
  const c = s.company, w = s.abs;
  const notes: string[] = [];
  def.beforeClose?.(s, notes);
  const startCash = c.cash;
  // Transporte: primero los clientes fijos (por antigüedad), luego los km de ir a la nave, luego los urgentes.
  let left = capacityKm(c);
  let revenue = 0, kmServed = 0, missedKm = 0;
  const billed = new Map<string, { amount: number; payWeeks: number }>();
  const bill = (client: string, amount: number, payWeeks: number) => { if (amount <= 0) return; const x = billed.get(client) ?? { amount: 0, payWeeks }; x.amount = round2(x.amount + amount); billed.set(client, x); };
  // Lo subcontratado: se hace entero, se factura y el subcontratista cobra (sale de la caja esa semana).
  for (const d of activeDeals(c, w).filter((x) => x.kind === "transporte" && x.sub)) { const amount = round2(d.km! * d.rate!); revenue += amount; bill(d.client, amount, d.payWeeks); if (!d.selfCovered) charge(s, `Subcontratista para ${clientName(d.client)}`, d.km! * SUB_RATE); }
  for (const d of activeDeals(c, w).filter((x) => x.kind === "transporte" && !x.sub).sort((a, b) => a.fromAbs - b.fromAbs || a.id.localeCompare(b.id))) {
    const served = Math.min(d.km!, Math.max(0, left));
    left -= served; kmServed += served;
    const amount = round2(served * d.rate!);
    revenue += amount; bill(d.client, amount, d.payWeeks);
    if (served < d.km!) {
      missedKm += d.km! - served; d.missed += 1; relate(s, d.client, -10);
      notes.push(`${d.km! - served} km de ${clientName(d.client)} sin hacer: no se facturan.`);
      if (d.missed >= 2) { d.ended = true; d.toAbs = w; notes.push(`${clientName(d.client)} se va: dos semanas sin servirle entero.`); }
    } else d.missed = 0;
  }
  const extra = c.facility && w >= c.facility.readyAbs ? Math.min(c.facility.kmExtra, Math.max(0, left)) : 0;
  left -= extra; kmServed += extra;
  const spotKm = Number(s.data.spotKm ?? 0), spotRev = Number(s.data.spotRev ?? 0);
  if (spotKm) {
    const served = Math.min(spotKm, Math.max(0, left));
    left -= served; kmServed += served;
    const share = served / spotKm;
    revenue += round2(spotRev * share); bill("urgentes", round2(spotRev * share), 4);
    if (served < spotKm) { charge(s, "Penalización por encargo urgente fallado", 150); c.reputation.fiabilidad = Math.max(0, c.reputation.fiabilidad - REPUTATION.spotFailed); notes.push(`Un encargo urgente se quedó sin hacer (${spotKm - served} km): penalización y peor reputación.`); }
  }
  s.data.spotKm = 0; s.data.spotRev = 0;
  if (missedKm) c.reputation.fiabilidad = Math.max(0, round2(c.reputation.fiabilidad - REPUTATION.per100kmMissed * missedKm / 100));
  else c.reputation.fiabilidad = Math.min(100, c.reputation.fiabilidad + 1);
  // Almacén: palés por orden de llegada hasta la capacidad de la nave.
  const cap = palletCapacity(c, w);
  let room = cap, pallets = 0;
  // Almacenaje en espacio externo: se factura entero y no ocupa tu nave.
  for (const d of activeDeals(c, w).filter((x) => x.kind === "almacen" && x.external)) { const amount = round2(d.pallets! * d.palletRate!); revenue += amount; bill(d.client, amount, d.payWeeks); }
  for (const d of activeDeals(c, w).filter((x) => x.kind === "almacen" && !x.external).sort((a, b) => a.fromAbs - b.fromAbs || a.id.localeCompare(b.id))) {
    const put = Math.min(d.pallets!, room);
    room -= put; pallets += put;
    const amount = round2(put * d.palletRate!);
    revenue += amount; bill(d.client, amount, d.payWeeks);
    if (put < d.pallets!) { d.missed += 1; relate(s, d.client, -10); notes.push(`${d.pallets! - put} palés de ${clientName(d.client)} no caben.`); if (d.missed >= 2) { d.ended = true; d.toAbs = w; notes.push(`${clientName(d.client)} se lleva su mercancía.`); } }
    else d.missed = 0;
  }
  revenue = round2(revenue);
  // Facturas: vencen según lo pactado; algunos clientes se retrasan (lo fija el nivel: s.data.late_<cliente>).
  for (const [client, x] of billed) {
    const late = Math.max(0, Number(s.data[`late_${client}`] ?? 0) - (has(c, "cobros") && Number(s.data[`late_${client}`] ?? 0) > 0 ? 1 : 0));
    c.invoices.push({ id: `f${w}-${client}`, client, amount: x.amount, issuedAbs: w, dueAbs: w + x.payWeeks, payAbs: w + x.payWeeks + late });
  }
  // Costes de la semana.
  const variable = round2(kmServed * variablePerKm(c));
  const fixed = weeklyFixed(c, w);
  // Plantilla (nivel 4 en adelante): sueldos y cotizaciones; los temporales que acaban esta semana se van después.
  const staff = staffWeekly(c);
  const financial = c.credit && startCash < 0 ? round2(-startCash * c.credit.annualRate / 52) : 0;
  if (financial) notes.push(`Intereses de la póliza: ${financial.toLocaleString("es-ES")} €.`);
  const other = round2(sum(s.charges.map((x) => x.amount)));
  for (const x of s.charges) if (x.amount && x.label) notes.push(`${x.label}: ${x.amount > 0 ? "−" : "+"}${Math.abs(x.amount).toLocaleString("es-ES")} €.`);
  const amortization = round2(Math.min(c.assets, c.assetsWeekly));
  c.assets = round2(c.assets - amortization);
  const result = round2(revenue - variable - fixed - staff - financial - other - amortization);
  c.result = round2(c.result + result);
  // Caja: cobros y pagos que vencen; costes de la semana; gastos que salen de la caja.
  let collections = 0, payments = 0;
  for (const i of c.invoices) if (i.paidAbs === undefined && !i.factored && i.payAbs === w) { i.paidAbs = w; collections += i.amount; }
  for (const p of c.payables) if (p.paidAbs === undefined && p.dueAbs === w) { p.paidAbs = w; payments += p.amount; }
  const cashCharges = round2(sum(s.charges.filter((x) => x.cash).map((x) => x.amount)));
  const nonCash = round2(sum(s.charges.filter((x) => !x.cash).map((x) => x.amount)));
  if (nonCash) c.payables.push({ id: `p${w}-otros`, label: "Gastos pendientes de pago", amount: nonCash, dueAbs: w + 4 });
  s.charges = [];
  c.cash = round2(c.cash + collections - payments - variable - fixed - staff - financial - cashCharges);
  for (const p of c.staff ?? []) if (!p.left && p.endAbs !== undefined && p.endAbs <= w) { p.left = true; notes.push(`${p.name} termina su contrato.`); }
  def.afterWeek?.(s, notes);
  const log: WeekLog = { abs: w, week: s.week, level: s.level, revenue, variable, fixed, financial, other, amortization, result, ...(staff ? { staff } : {}), kmDemand: transportKm(c, w) + spotKm, kmCapacity: capacityKm(c), kmServed, pallets, palletCapacity: cap, collections: round2(collections), payments: round2(payments), cashEnd: c.cash, notes };
  s.logs.push(log);
  const limit = c.credit?.limit ?? 0;
  s.negativeWeeks = c.cash < -limit ? s.negativeWeeks + 1 : 0;
  if (s.negativeWeeks >= BANKRUPT_WEEKS) {
    s.status = "quiebra";
    s.endReason = limit ? "La caja ha superado el límite de la póliza dos semanas seguidas: no puedes pagar a tus proveedores ni tu sueldo." : "La caja ha estado en negativo dos semanas seguidas: no puedes pagar a tus proveedores ni tu sueldo.";
    s.results.push({ level: s.level, stars: [false, false, false], passed: false, resultLevel: levelResult(s), cashEnd: c.cash });
  }
}

function finishLevel(s: CampaignState, def: LevelDef) {
  const stars = def.stars(s);
  s.status = "fin_nivel";
  s.results.push({ level: s.level, stars, passed: stars[0], resultLevel: levelResult(s), cashEnd: s.company.cash });
}

export const levelResult = (s: CampaignState, level = s.level) => round2(sum(s.logs.filter((l) => l.level === level).map((l) => l.result)));

/** Al pasar de nivel: la empresa sigue, el nivel nuevo empieza en la sede. Solo si el anterior se superó. */
export function nextLevel(prev: CampaignState): CampaignState {
  const s = clone(prev);
  const last = s.results.at(-1);
  if (s.status !== "fin_nivel" || !last?.passed) throw new Error("Supera el nivel para seguir.");
  if (s.level + 1 >= LEVELS.length) throw new Error("No hay más niveles en esta entrega.");
  s.level += 1; s.week = 0; s.abs += 1; s.status = "sede"; s.pending = []; s.data = {}; s.debrief = {}; s.negativeWeeks = 0;
  return s;
}

/** Socio que entra si empiezas un nivel con poca caja: aporta capital a cambio de una parte de la empresa. */
export const RESCUE = { threshold: 3_000, amount: 10_000, share: 20 };
export const rescueAvailable = (s: CampaignState) => s.status === "sede" && s.company.cash < RESCUE.threshold;

export const upgradesFor = (s: CampaignState) => UPGRADES.filter((u) => u.unlockAfter <= s.level);

// ── Contabilidad, estrellas y dominio ─────────────────────────────────────────────────────────────────────────────

export function balanceGap(s: CampaignState): number {
  const c = s.company;
  const assets = c.cash + sum(c.invoices.filter((i) => i.paidAbs === undefined && !i.factored).map((i) => i.amount)) + c.deposits + c.assets;
  const sources = c.capital + c.result + sum(c.payables.filter((p) => p.paidAbs === undefined).map((p) => p.amount));
  return round2(assets - sources) || 0;
}

export const POINTS = { correcta: 10, razonable: 6, grave: 0 } as const;
/** Dominio por resultado de aprendizaje (0-100), separado de las estrellas. */
export function mastery(s: CampaignState): { competence: string; pct: number; n: number }[] {
  const by = new Map<string, { pts: number; n: number }>();
  for (const e of s.learning) for (const k of e.competences) { const x = by.get(k) ?? { pts: 0, n: 0 }; x.pts += POINTS[e.grade]; x.n += 1; by.set(k, x); }
  return [...by.entries()].map(([competence, x]) => ({ competence, pct: Math.round(x.pts / (x.n * 10) * 100), n: x.n })).sort((a, b) => a.competence.localeCompare(b.competence));
}

// ── Guardado, reproducción y «qué habría pasado si» ──────────────────────────────────────────────────────────────

export const CAMPAIGN_SAVE_KEY = "smartrade:simulador:campana";
export const toSave = (seed: number, levels: Action[][], now = new Date()): CampaignSave => ({ app: "smartrade-campana", version: CAMPAIGN_VERSION, seed, levels, savedAt: now.toISOString() });

/** Reconstruye la campaña: cada nivel desde el final del anterior. Se detiene en la primera acción que ya no valga. */
export function restore(save: Pick<CampaignSave, "seed" | "levels">): { state: CampaignState; levels: Action[][]; dropped: number } {
  let s = newCampaign(save.seed);
  const kept: Action[][] = [];
  let dropped = 0;
  for (let i = 0; i < save.levels.length; i++) {
    if (i > 0) { try { s = nextLevel(s); } catch { dropped += save.levels.slice(i).reduce((a, l) => a + l.length, 0); break; } }
    const ok: Action[] = [];
    for (const a of save.levels[i]) { try { s = apply(s, a); ok.push(a); } catch { break; } }
    dropped += save.levels[i].length - ok.length;
    kept.push(ok);
    if (ok.length < save.levels[i].length) break;
  }
  return { state: s, levels: kept, dropped };
}

/**
 * «Qué habría pasado si…»: rejuega el nivel cambiando UNA decisión y deja el resto de tus acciones igual (las que ya no
 * tengan sentido se saltan). Es posible porque el motor es determinista. Compara el final del nivel.
 */
export function whatIf(save: Pick<CampaignSave, "seed" | "levels">, level: number, decisionId: string, opcion: string) {
  const levels = save.levels.map((l, i) => (i === level ? l.map((a) => (a.t === "decidir" && a.id === decisionId ? { ...a, opcion } : a)) : l)).slice(0, level + 1);
  let s = newCampaign(save.seed);
  for (let i = 0; i <= level; i++) {
    if (i > 0) s = nextLevel(s);
    for (const a of levels[i]) { try { s = apply(s, a); } catch { /* acción que ya no vale en la alternativa */ } }
    // Si la alternativa abre decisiones nuevas, se cierran las semanas que falten con la primera opción de cada una.
    if (i === level) for (let guard = 0; guard < 400 && s.status === "jugando"; guard++) s = s.pending.length ? apply(s, { t: "decidir", id: s.pending[0].id, opcion: s.pending[0].options[s.pending[0].options.length - 1].id }) : apply(s, { t: "cerrar" });
  }
  return { cash: s.company.cash, result: levelResult(s, level), stars: s.results.find((r) => r.level === level)?.stars ?? [false, false, false], bankrupt: s.status === "quiebra" };
}
