import { round2, sum } from "../learning/money";
import { clientOf, kmOf, offersFor } from "./market";
import type { Action, Contract, Grade, Incident, IncidentOption, LearningEntry, Offer, SimState, WeekRecord } from "./model";
import { ENGINE_VERSION, FIXED_PER_WEEK, P, PHASE1_WEEKS, TRUCK_KM_WEEK, WEEKS_PER_MONTH } from "./params";
import { intIn, stream } from "./rng";

/**
 * Motor del Business Simulator, Fase 1 (docs/simulador.md). Puro y determinista: el estado se obtiene aplicando las
 * acciones en orden a newGame(semilla). Nada de Math.random, red ni hora del sistema.
 *
 * Contabilidad (§9.1): ingresos y costes se devengan la semana del servicio; la caja se mueve en el vencimiento real.
 * Invariante (checkInvariants): caja + clientes pendientes + fianza + camión = patrimonio inicial + resultado acumulado
 * + proveedores pendientes + fijos devengados no pagados.
 */
const clone = <T>(x: T): T => structuredClone(x);
/** Importe unitario con dos decimales (tarifas y costes por km o palé). */
export const n2 = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function newGame(seed: number): SimState {
  return {
    version: ENGINE_VERSION, seed: seed >>> 0, week: 1, status: "jugando",
    cash: P.initialCash, deposit: 0, truckValue: P.truckBookValue, equity0: P.initialCash + P.truckBookValue, result: 0, accruedFixed: 0,
    receivables: [], payables: [], contracts: [], offers: offersFor(seed >>> 0, 1), weeks: [], ledger: [], pending: null, answers: {}, negativeWeeks: 0, learning: [],
  };
}

const activeIn = (c: Contract, w: number) => c.startWeek <= w && w <= c.endWeek && !(c.cancelledWeek !== undefined && w >= c.cancelledWeek);
export const kmCommitted = (s: Pick<SimState, "contracts">, w: number) => sum(s.contracts.filter((c) => activeIn(c, w)).map(kmOf));
export const palletsCommitted = (s: Pick<SimState, "contracts">, w: number) => sum(s.contracts.filter((c) => activeIn(c, w) && c.kind === "almacenaje").map((c) => c.pallets!));

/** Coste completo del camión por km a plena capacidad: variable + (conductor + seguro + amortización) / km semanales. */
export const TRUCK_FULL_COST_PER_KM = round2(P.variablePerKm + (P.fixedMonthly.conductor / WEEKS_PER_MONTH + P.fixedMonthly.seguro / WEEKS_PER_MONTH + P.amortizationWeek) / TRUCK_KM_WEEK);
/** Coste del almacén por palé y semana con el almacén lleno: (alquiler + mozo) / capacidad. */
export const WAREHOUSE_FULL_COST_PER_PALLET = round2((P.fixedMonthly.alquiler + P.fixedMonthly.mozo) / WEEKS_PER_MONTH / P.warehousePallets);

/** Calificación de aceptar una oferta (docs/simulador.md §6): capacidad, margen sobre el coste variable y sobre el coste completo. */
export function gradeOffer(s: Pick<SimState, "contracts">, o: Offer): { grade: Grade; feedback: string } {
  const weeks = Array.from({ length: o.weeks }, (_, i) => o.week + i);
  if (o.kind !== "almacenaje" && weeks.some((w) => kmCommitted(s, w) + kmOf(o) > TRUCK_KM_WEEK))
    return { grade: "grave", feedback: `No tenías capacidad: con esta oferta el camión supera sus ${TRUCK_KM_WEEK} km semanales. Lo que no puedas hacer no se factura y baja tu nivel de servicio.` };
  if (o.kind === "almacenaje" && weeks.some((w) => palletsCommitted(s, w) + o.pallets! > P.warehousePallets))
    return { grade: "grave", feedback: `No tenías sitio: el almacén supera sus ${P.warehousePallets} palés. Los palés que no caben no se facturan y baja tu nivel de servicio.` };
  if (o.kind === "puntual") {
    const perKm = round2(o.price! / (2 * o.kmOneWay!));
    if (perKm < P.variablePerKm) return { grade: "grave", feedback: `Pierdes dinero: contando el retorno en vacío cobras ${n2(perKm)} €/km recorrido y solo el gasóleo, el mantenimiento y los peajes cuestan ${n2(P.variablePerKm)} €/km.` };
    if (perKm < TRUCK_FULL_COST_PER_KM) return { grade: "razonable", feedback: `Cubre el coste variable (${n2(perKm)} frente a ${n2(P.variablePerKm)} €/km recorrido, retorno incluido), pero no el coste completo del camión (${n2(TRUCK_FULL_COST_PER_KM)} €/km). Útil para llenar huecos, no como base del negocio.` };
    return { grade: "correcta", feedback: `Cubre el coste completo del camión aun con el retorno en vacío (${n2(perKm)} €/km recorrido).` };
  }
  if (o.kind === "distribucion") {
    if (o.ratePerKm! < TRUCK_FULL_COST_PER_KM) return { grade: "razonable", feedback: `La tarifa (${n2(o.ratePerKm!)} €/km) cubre el gasóleo, pero no el coste completo del camión (${n2(TRUCK_FULL_COST_PER_KM)} €/km con conductor, seguro y amortización).` };
    return { grade: "correcta", feedback: `La tarifa (${n2(o.ratePerKm!)} €/km) cubre el coste completo del camión (${n2(TRUCK_FULL_COST_PER_KM)} €/km).` };
  }
  if (o.palletRate! < WAREHOUSE_FULL_COST_PER_PALLET) return { grade: "razonable", feedback: `La tarifa (${n2(o.palletRate!)} €/palé/semana) no cubre el coste del almacén lleno (${n2(WAREHOUSE_FULL_COST_PER_PALLET)} €).` };
  return { grade: "correcta", feedback: `La tarifa (${n2(o.palletRate!)} €/palé/semana) cubre el coste del almacén lleno (${n2(WAREHOUSE_FULL_COST_PER_PALLET)} €).` };
}

// ── Incidencias (docs/simulador.md §10) ─────────────────────────────────────────────────────────────────────────────

/** La avería ocurre una vez, entre las semanas 2 y 5, según la semilla. */
export function breakdownOf(seed: number) {
  const r = stream(seed, 0, "averia");
  return { week: intIn(r, 2, 5), days: intIn(r, P.breakdownDays.min, P.breakdownDays.max), repair: intIn(r, P.repair.min, P.repair.max, 50) };
}

export const INCIDENT_OPTIONS: Record<"averia" | "mora", IncidentOption[]> = {
  averia: [
    { id: "subcontratar", label: "Subcontratar a otro transportista los kilómetros que no puedes hacer", grade: "correcta", feedback: "Cumples con tus clientes a costa de margen: el subcontratista cobra 1,05 €/km y tú respondes ante el cliente de su trabajo." },
    { id: "avisar", label: "Avisar hoy a los clientes y reprogramar lo que no llegues a hacer", grade: "razonable", feedback: "No facturas lo que no haces, pero avisar a tiempo limita el daño: el cliente puede organizarse y tu reputación sufre menos." },
    { id: "callar", label: "No decir nada y hacer lo que se pueda", grade: "grave", feedback: "El cliente descubre el fallo al no recibir la mercancía. Pierdes la facturación y tu cliente más grande cancela el contrato." },
  ],
  mora: [
    { id: "reclamar", label: "Reclamar por escrito el pago, recordando que está en mora desde el día 30 y que se pueden exigir intereses de demora", grade: "correcta", feedback: "En transporte, quien paga incurre en mora a los 30 días (Ley 15/2009, art. 41). Reclamar a tiempo y por escrito acelera el cobro: paga la semana siguiente." },
    { id: "esperar", label: "Esperar: es un cliente nuevo y no quieres molestarle", grade: "razonable", feedback: "Mantienes la relación, pero financias a tu cliente con tu caja: sigue pagando tarde." },
    { id: "suspender", label: "Suspender de inmediato todos sus servicios, sin avisar", grade: "grave", feedback: "Cortar sin preaviso puede incumplir tus propios compromisos con él. Acaba pagando, pero pierdes el cliente y su facturación futura." },
  ],
};

function shortfall(s: SimState, w: number, capacity: number) {
  return Math.max(0, kmCommitted(s, w) - capacity);
}

/** Incidencias que exigen decisión en la semana actual, en orden, aún sin responder. */
export function dueIncidents(s: SimState): Incident[] {
  const w = s.week;
  const out: Incident[] = [];
  const b = breakdownOf(s.seed);
  if (b.week === w && !s.answers.averia) {
    const cap = TRUCK_KM_WEEK - b.days * P.kmPerDay;
    const short = shortfall(s, w, cap);
    if (short > 0) out.push({ id: "averia", kind: "averia", week: w, title: "Avería del camión", concept: "Un plan de contingencia (subcontratar, reprogramar, avisar) evita que una avería se convierta en un incumplimiento con el cliente.",
      prompt: `El camión entra en el taller ${b.days} ${b.days === 1 ? "día" : "días"} (reparación: ${b.repair} €). Esta semana podrás hacer ${cap} km y tienes comprometidos ${kmCommitted(s, w)}: te faltan ${short} km.`, data: { days: b.days, repair: b.repair, short } });
  }
  for (const inv of s.receivables) {
    const c = clientOf(inv.clientId);
    if (c.profile !== "tardio" || inv.paidWeek !== undefined || inv.dueWeek !== w || inv.payWeek <= w || s.answers[`mora-${c.id}`]) continue;
    if (out.some((i) => i.id === `mora-${c.id}`)) continue;
    out.push({ id: `mora-${c.id}`, kind: "mora", week: w, title: "Un cliente no paga a su vencimiento", concept: "Facturar no es cobrar. En el transporte por carretera, quien paga incurre en mora a los 30 días (Ley 15/2009, art. 41); el resto de servicios nunca puede pactarse a más de 60 días (Ley 3/2004, art. 4).",
      prompt: `${c.name} no ha pagado la factura de ${inv.amount.toLocaleString("es-ES", { minimumFractionDigits: 2 })} € que vencía esta semana.`, data: { client: c.id, amount: inv.amount } });
  }
  return out;
}

// ── Acciones ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const MONTH_QUESTION = {
  id: "mes1",
  prompt: "En la semana 4 pagaste de golpe el alquiler y las nóminas del mes. ¿Por qué la caja ha bajado mucho más que el resultado de la semana?",
  options: [
    { id: "fijos", label: "Porque los costes fijos se reconocen cada semana pero se pagan juntos cada 4 semanas, y las primeras facturas aún no se han cobrado", grade: "correcta" as Grade, feedback: "Exacto: resultado (devengo) y caja (cobros y pagos) van con calendarios distintos." },
    { id: "perdidas", label: "Porque la empresa ha perdido esa semana exactamente lo que ha bajado la caja", grade: "grave" as Grade, feedback: "No: el resultado de la semana solo incluye la parte de fijos de esa semana; la caja pagó los de cuatro semanas." },
    { id: "amortizacion", label: "Por la amortización del camión", grade: "grave" as Grade, feedback: "La amortización es un coste que no sale de la caja: reparte el valor del camión en el tiempo." },
  ],
};

const learn = (s: SimState, e: LearningEntry) => { s.learning.push(e); };

export function apply(prev: SimState, a: Action): SimState {
  // Con la partida terminada solo se puede responder a la pregunta del informe mensual, si quedó pendiente.
  if ((prev.status === "fin" || prev.status === "quiebra") && a.t !== "pregunta") throw new Error("La partida ha terminado.");
  const s = clone(prev);
  if (a.t === "aceptar") {
    if (s.status !== "jugando") throw new Error(s.status === "incidencia" ? "Primero resuelve la incidencia." : "La partida ha terminado.");
    const o = s.offers.find((x) => x.id === a.oferta);
    if (!o) throw new Error("Oferta no disponible.");
    const g = gradeOffer(s, o);
    s.contracts.push({ ...o, startWeek: o.week, endWeek: o.week + o.weeks - 1 });
    s.offers = s.offers.filter((x) => x.id !== o.id);
    learn(s, { week: s.week, what: `Aceptar: ${describeOffer(o)}`, answer: "Aceptada", grade: g.grade, feedback: g.feedback, competences: o.kind === "almacenaje" ? ["0625-RA3", "0623-RA7"] : ["0622-RA2", "0622-RA3", "0623-RA7"] });
    return s;
  }
  if (a.t === "pregunta") {
    if (a.pregunta !== MONTH_QUESTION.id || s.weeks.length < WEEKS_PER_MONTH || s.answers[a.pregunta]) throw new Error("Pregunta no disponible.");
    const opt = MONTH_QUESTION.options.find((x) => x.id === a.opcion);
    if (!opt) throw new Error("Opción no válida.");
    s.answers[a.pregunta] = a.opcion;
    learn(s, { week: s.week, what: "Informe del mes: caja frente a resultado", answer: opt.label, grade: opt.grade, feedback: opt.feedback, competences: ["0623-RA6", "0623-RA7"] });
    return s;
  }
  if (a.t === "responder") {
    if (!s.pending || s.pending.id !== a.incidencia) throw new Error("No hay esa incidencia pendiente.");
    const opt = INCIDENT_OPTIONS[s.pending.kind].find((x) => x.id === a.opcion);
    if (!opt) throw new Error("Opción no válida.");
    s.answers[a.incidencia] = a.opcion;
    learn(s, { week: s.week, what: s.pending.title, answer: opt.label, grade: opt.grade, feedback: opt.feedback, competences: s.pending.kind === "averia" ? ["0622-RA6"] : ["0623-RA5"] });
    if (s.pending.kind === "mora") applyMoraDecision(s, String(s.pending.data.client), a.opcion);
    s.pending = null;
    s.status = "jugando";
    return close(s);
  }
  if (s.status !== "jugando") throw new Error("Primero resuelve la incidencia.");
  return close(s);
}

export const replay = (seed: number, actions: Action[]): SimState => actions.reduce(apply, newGame(seed));

function applyMoraDecision(s: SimState, client: string, option: string) {
  for (const inv of s.receivables) {
    if (inv.clientId !== client || inv.paidWeek !== undefined) continue;
    if (option === "reclamar") inv.payWeek = Math.min(inv.payWeek, Math.max(inv.dueWeek, s.week) + 1);
    if (option === "suspender") inv.payWeek = Math.max(inv.dueWeek, s.week) + 2;
  }
  if (option === "suspender") for (const c of s.contracts) if (c.clientId === client && activeIn(c, s.week + 1)) c.cancelledWeek = s.week + 1;
}

/** Cerrar la semana: primero las incidencias que exigen decisión; después, la resolución. */
function close(s: SimState): SimState {
  const due = dueIncidents(s);
  if (due.length) { s.pending = due[0]; s.status = "incidencia"; return s; }
  resolveWeek(s);
  return s;
}

function resolveWeek(s: SimState) {
  const w = s.week;
  const notes: string[] = [];
  const move = (label: string, amount: number) => { if (amount === 0) return; s.cash = round2(s.cash + amount); s.ledger.push({ week: w, label, amount: round2(amount) }); };

  if (w === 1) { move("Fianza del almacén", -P.deposit); s.deposit = P.deposit; }

  // Capacidad del camión (avería) y reparto de kilómetros: primero los contratos más antiguos.
  const b = breakdownOf(s.seed);
  const broke = b.week === w;
  const capacity = TRUCK_KM_WEEK - (broke ? b.days * P.kmPerDay : 0);
  const repair = broke ? b.repair : 0;
  if (broke) notes.push(`Avería: ${b.days} ${b.days === 1 ? "día" : "días"} en el taller y ${b.repair} € de reparación.`);
  const decision = s.answers.averia;
  const transport = s.contracts.filter((c) => activeIn(c, w) && c.kind !== "almacenaje").sort((a, c) => a.startWeek - c.startWeek || (a.kind === c.kind ? a.id.localeCompare(c.id) : a.kind === "distribucion" ? -1 : 1));
  let left = capacity;
  let kmOwn = 0, kmSub = 0, kmUnserved = 0, unservedWeight = 0;
  let revenueTransport = 0;
  const breached: Contract[] = [];
  const invoices: { c: Contract; amount: number }[] = [];
  for (const c of transport) {
    const need = kmOf(c);
    let served = Math.min(need, left);
    if (c.kind === "puntual" && served < need) served = 0;
    left -= served;
    kmOwn += served;
    let missing = need - served;
    if (missing > 0 && broke && decision === "subcontratar") { kmSub += missing; missing = 0; }
    kmUnserved += missing;
    unservedWeight += missing * (broke && decision === "avisar" ? 0.5 : 1);
    // Un contrato recurrente que se incumple sin avisar se pierde: el cliente lo cancela desde la semana siguiente.
    if (missing > 0 && c.kind === "distribucion" && !(broke && decision === "avisar")) breached.push(c);
    const amount = c.kind === "distribucion" ? round2((need - missing) * c.ratePerKm!) : missing === 0 ? c.price! : 0;
    revenueTransport += amount;
    if (amount > 0) invoices.push({ c, amount });
  }
  if (kmUnserved > 0) notes.push(`${kmUnserved} km comprometidos sin hacer: no se facturan.`);
  if (broke && decision === "callar") {
    const biggest = transport.filter((c) => c.kind === "distribucion").sort((a, c) => kmOf(c) - kmOf(a))[0];
    if (biggest) { biggest.cancelledWeek = w + 1; notes.push(`${clientOf(biggest.clientId).name} cancela su contrato por el fallo sin aviso.`); }
  }

  // Almacén: palés por orden de llegada hasta la capacidad.
  let room = P.warehousePallets;
  let stored = 0, rejected = 0, revenueWarehouse = 0;
  for (const c of s.contracts.filter((x) => activeIn(x, w) && x.kind === "almacenaje").sort((a, c) => a.startWeek - c.startWeek || a.id.localeCompare(c.id))) {
    const put = Math.min(c.pallets!, room);
    room -= put; stored += put; rejected += c.pallets! - put;
    if (put < c.pallets!) breached.push(c);
    const amount = round2(put * c.palletRate!);
    revenueWarehouse += amount;
    if (amount > 0) invoices.push({ c, amount });
  }
  if (rejected > 0) notes.push(`${rejected} palés no caben en el almacén: no se facturan.`);
  for (const c of breached) if (c.cancelledWeek === undefined && c.endWeek > w) { c.cancelledWeek = w + 1; notes.push(`${clientOf(c.clientId).name} cancela su contrato porque no se cumplió lo pactado.`); }

  // Facturas: vencen según el plazo pactado; un cliente tardío paga 1-3 semanas después (según la semilla).
  for (const { c, amount } of invoices) {
    const due = w + c.payWeeks;
    const late = clientOf(c.clientId).profile === "tardio" ? intIn(stream(s.seed, w, `pago-${c.id}`), 1, 3) : 0;
    const decided = s.answers[`mora-${c.clientId}`];
    const payWeek = decided === "reclamar" ? due + Math.min(late, 1) : due + late;
    s.receivables.push({ id: `f${w}-${c.id}`, contractId: c.id, clientId: c.clientId, amount: round2(amount), week: w, dueWeek: due, payWeek });
  }

  // Costes del devengo.
  const costVariable = round2(kmOwn * P.variablePerKm);
  const costSubcontract = round2(kmSub * P.subcontractPerKm);
  if (kmSub > 0) s.payables.push({ id: `p${w}-sub`, label: `Subcontratista (${kmSub} km)`, amount: costSubcontract, week: w, dueWeek: w + P.transportPayWeeks });
  move("Gasóleo, mantenimiento y peajes", -costVariable);
  if (repair) move("Reparación del camión", -repair);
  s.accruedFixed = round2(s.accruedFixed + FIXED_PER_WEEK);
  s.truckValue = round2(s.truckValue - P.amortizationWeek);
  revenueTransport = round2(revenueTransport);
  revenueWarehouse = round2(revenueWarehouse);
  const result = round2(revenueTransport + revenueWarehouse - costVariable - costSubcontract - repair - FIXED_PER_WEEK - P.amortizationWeek);
  s.result = round2(s.result + result);

  // Caja: cobros y pagos que vencen esta semana; fijos cada 4 semanas.
  let collections = 0;
  for (const inv of s.receivables) if (inv.paidWeek === undefined && inv.payWeek === w) { inv.paidWeek = w; collections += inv.amount; move(`Cobro de ${clientOf(inv.clientId).name}`, inv.amount); }
  let payments = 0;
  for (const p of s.payables) if (p.paidWeek === undefined && p.dueWeek === w) { p.paidWeek = w; payments += p.amount; move(`Pago: ${p.label}`, -p.amount); }
  if (w % WEEKS_PER_MONTH === 0) { move("Alquiler, nóminas, seguro y gestoría del mes", -s.accruedFixed); s.accruedFixed = 0; }

  // Nivel de servicio: lo servido sobre lo comprometido (km y palés); lo avisado cuenta la mitad.
  const committedUnits = kmCommitted(s, w) + palletsCommitted(s, w);
  const serviceLevel = committedUnits ? round2((committedUnits - unservedWeight - rejected) / committedUnits * 100) : 100;

  const rec: WeekRecord = {
    week: w, kmCapacity: capacity, kmCommitted: kmCommitted(s, w), kmOwn, kmSubcontracted: kmSub, kmUnserved, palletsCommitted: palletsCommitted(s, w), palletsStored: stored,
    revenueTransport, revenueWarehouse, costVariable, costSubcontract, costRepair: repair, costFixed: FIXED_PER_WEEK, amortization: P.amortizationWeek, result,
    collections: round2(collections), payments: round2(payments), cashEnd: s.cash, serviceLevel, notes,
  };
  s.weeks.push(rec);

  s.negativeWeeks = s.cash < 0 ? s.negativeWeeks + 1 : 0;
  if (s.negativeWeeks >= 2) { s.status = "quiebra"; return; }
  if (w >= PHASE1_WEEKS) { s.status = "fin"; return; }
  s.week = w + 1;
  s.offers = offersFor(s.seed, s.week, serviceLevelToDate(s));
}

// ── Lecturas para la interfaz y las pruebas ───────────────────────────────────────────────────────────────────────

export function describeOffer(o: Offer): string {
  const c = clientOf(o.clientId).name;
  if (o.kind === "distribucion") return `${c}: distribución regional, ${o.kmWeek} km/semana a ${n2(o.ratePerKm!)} €/km durante ${o.weeks} semanas`;
  if (o.kind === "puntual") return `${c}: viaje puntual de ${o.kmOneWay} km (retorno en vacío) por ${o.price} €`;
  return `${c}: almacenaje de ${o.pallets} palés a ${n2(o.palletRate!)} €/palé/semana durante ${o.weeks} semanas`;
}

export const pendingReceivables = (s: SimState) => s.receivables.filter((i) => i.paidWeek === undefined);
export const pendingPayables = (s: SimState) => s.payables.filter((p) => p.paidWeek === undefined);

/** Comprueba el cuadre contable. Devuelve la diferencia (0 si cuadra). */
export function balanceGap(s: SimState): number {
  const assets = s.cash + sum(pendingReceivables(s).map((i) => i.amount)) + s.deposit + s.truckValue;
  const sources = s.equity0 + s.result + sum(pendingPayables(s).map((p) => p.amount)) + s.accruedFixed;
  return round2(assets - sources);
}

export function serviceLevelToDate(s: SimState): number {
  const recent = s.weeks.slice(-8);
  const committed = recent.reduce((a, r) => a + r.kmCommitted + r.palletsCommitted, 0);
  if (!committed) return 100;
  return round2(recent.reduce((a, r) => a + (r.kmCommitted + r.palletsCommitted) * r.serviceLevel / 100, 0) / committed * 100);
}

export const POINTS: Record<Grade, number> = { correcta: 10, razonable: 6, grave: 0 };
export function knowledge(s: SimState) {
  const max = s.learning.length * POINTS.correcta;
  const pts = s.learning.reduce((a, e) => a + POINTS[e.grade], 0);
  return { points: pts, max, pct: max ? round2(pts / max * 100) : 0 };
}

