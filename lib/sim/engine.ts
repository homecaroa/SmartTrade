import { round2, sum } from "../learning/money";
import { bestDocs, DOC_RISK, docsFor, gradeDocs, originalTerms, respond, validateProposal, withTerms, type Terms } from "./deal";
import { clientOf, kmOf, offersFor } from "./market";
import type { Action, Contract, Grade, Growth, GrowthOption, Incident, IncidentOption, LearningEntry, Offer, SimState, WeekRecord } from "./model";
import { BREAKDOWN_WINDOWS, ENGINE_VERSION, FIXED_PER_WEEK, GROWTH, OBJECTIVES, P, SEASON_WEEKS, SERVICE_FLOOR, TRUCK_KM_WEEK, WEEKS_PER_MONTH } from "./params";
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

/** Partida nueva. `version`: reglas con las que se juega (las guardadas se reproducen con la suya; ver params.ts). */
export function newGame(seed: number, version: number = ENGINE_VERSION): SimState {
  return {
    version, seed: seed >>> 0, week: 1, status: "jugando",
    cash: P.initialCash, deposit: 0, truckValue: P.truckBookValue, equity0: P.initialCash + P.truckBookValue, result: 0, accruedFixed: 0,
    receivables: [], payables: [], contracts: [], offers: offersFor(seed >>> 0, 1, 100, version), weeks: [], ledger: [], pending: null, answers: {}, negativeWeeks: 0, learning: [],
  };
}

const activeIn = (c: Contract, w: number) => c.startWeek <= w && w <= c.endWeek && !(c.cancelledWeek !== undefined && w >= c.cancelledWeek);
export const kmCommitted = (s: Pick<SimState, "contracts">, w: number) => sum(s.contracts.filter((c) => activeIn(c, w)).map(kmOf));
/** Km encargados a subcontratistas al aceptar (tienen un límite semanal: GROWTH.subcontract.maxKmWeek). */
export const kmSubCommitted = (s: Pick<SimState, "contracts">, w: number) => sum(s.contracts.filter((c) => activeIn(c, w) && c.subcontracted).map(kmOf));
/** Km que aún puedes subcontratar en todas las semanas de una oferta. */
export const subcontractRoom = (s: Pick<SimState, "contracts">, o: Offer) => Math.min(...Array.from({ length: o.weeks }, (_, i) => GROWTH.subcontract.maxKmWeek - kmSubCommitted(s, o.week + i)));
/** Km que tiene que hacer tu propio camión (lo subcontratado no lo ocupa). */
export const kmOwnCommitted = (s: Pick<SimState, "contracts">, w: number) => sum(s.contracts.filter((c) => activeIn(c, w) && !c.subcontracted).map(kmOf));
export const palletsCommitted = (s: Pick<SimState, "contracts">, w: number) => sum(s.contracts.filter((c) => activeIn(c, w) && c.kind === "almacenaje").map((c) => c.pallets!));

// ── Capacidad y costes fijos según las herramientas para crecer (docs/simulador.md §17 sexies) ──────────────────────
type WithGrowth = { growth?: Growth };
/** El segundo camión y la nave ampliada funcionan desde la semana SIGUIENTE a la decisión; la póliza, desde la misma. */
const from = (x: { week: number } | undefined, w: number) => !!x && w > x.week;
export const truckKmAt = (s: WithGrowth, w: number) => TRUCK_KM_WEEK * (from(s.growth?.camion, w) ? 2 : 1);
export const palletCapacityAt = (s: WithGrowth, w: number) => P.warehousePallets + (from(s.growth?.almacen, w) ? GROWTH.warehouse.pallets : 0);
export const creditLimitAt = (s: WithGrowth, w: number) => (s.growth?.poliza && w >= s.growth.poliza.week ? GROWTH.credit.limit : 0);
/** Costes fijos por semana: los de siempre más el segundo camión (cuota o seguro, y conductor) y la nave (alquiler y mozo). */
export function fixedPerWeekAt(s: WithGrowth, w: number): number {
  const g = s.growth;
  let monthly = 0;
  if (from(g?.camion, w)) monthly += GROWTH.truck.driverMonthly + (g!.camion!.modo === "renting" ? GROWTH.truck.renting.monthly : GROWTH.truck.compra.insuranceMonthly);
  if (from(g?.almacen, w)) monthly += GROWTH.warehouse.rentMonthly + GROWTH.warehouse.workerMonthly;
  return round2(FIXED_PER_WEEK + monthly / WEEKS_PER_MONTH);
}
export const amortizationAt = (s: WithGrowth, w: number) => P.amortizationWeek + (from(s.growth?.camion, w) && s.growth!.camion!.modo === "compra" ? GROWTH.truck.compra.amortizationWeek : 0);

/** Coste completo del camión por km a plena capacidad: variable + (conductor + seguro + amortización) / km semanales. */
export const TRUCK_FULL_COST_PER_KM = round2(P.variablePerKm + (P.fixedMonthly.conductor / WEEKS_PER_MONTH + P.fixedMonthly.seguro / WEEKS_PER_MONTH + P.amortizationWeek) / TRUCK_KM_WEEK);
/** Coste del almacén por palé y semana con el almacén lleno: (alquiler + mozo) / capacidad. */
export const WAREHOUSE_FULL_COST_PER_PALLET = round2((P.fixedMonthly.alquiler + P.fixedMonthly.mozo) / WEEKS_PER_MONTH / P.warehousePallets);

/** Calificación de aceptar una oferta (docs/simulador.md §6): capacidad, margen sobre el coste variable y sobre el coste completo. */
export function gradeOffer(s: Pick<SimState, "contracts"> & WithGrowth, o: Offer, withBackhaul = false, subcontract = false): { grade: Grade; feedback: string } {
  const weeks = Array.from({ length: o.weeks }, (_, i) => o.week + i);
  if (subcontract && o.kind !== "almacenaje") return gradeSubcontract(s, o, weeks, withBackhaul);
  // Con un solo camión y la nave de siempre, los textos son exactamente los de antes (las partidas guardadas no cambian).
  const over = weeks.find((w) => kmOwnCommitted(s, w) + kmOf(o) > truckKmAt(s, w));
  if (o.kind !== "almacenaje" && over !== undefined)
    return { grade: "grave", feedback: `No tenías capacidad: con esta oferta ${truckKmAt(s, over) > TRUCK_KM_WEEK ? "tus dos camiones superan sus" : "el camión supera sus"} ${truckKmAt(s, over)} km semanales. Lo que no puedas hacer no se factura y baja tu nivel de servicio.` };
  const full = weeks.find((w) => palletsCommitted(s, w) + o.pallets! > palletCapacityAt(s, w));
  if (o.kind === "almacenaje" && full !== undefined)
    return { grade: "grave", feedback: `No tenías sitio: el almacén supera sus ${palletCapacityAt(s, full)} palés. Los palés que no caben no se facturan y baja tu nivel de servicio.` };
  if (o.kind === "puntual") {
    const back = withBackhaul && o.backhaul ? o.backhaul.price : 0;
    const perKm = round2((o.price! + back) / (2 * o.kmOneWay!));
    // Sin carga de retorno en la oferta, los textos son exactamente los de la v1 (las partidas guardadas no cambian).
    const ret = !o.backhaul ? null : back ? "con la carga de retorno" : "con el retorno en vacío";
    const missed = !withBackhaul && o.backhaul ? ` Además dejaste pasar la carga de retorno (+${o.backhaul.price} €): la vuelta iba a hacerse igual.` : "";
    if (perKm < P.variablePerKm) return { grade: "grave", feedback: `Pierdes dinero: ${ret ?? "contando el retorno en vacío"} cobras ${n2(perKm)} €/km recorrido y solo el gasóleo, el mantenimiento y los peajes cuestan ${n2(P.variablePerKm)} €/km.${missed}` };
    if (perKm < TRUCK_FULL_COST_PER_KM) return { grade: "razonable", feedback: `Cubre el coste variable (${n2(perKm)} frente a ${n2(P.variablePerKm)} €/km recorrido, ${ret ?? "retorno incluido"}), pero no el coste completo del camión (${n2(TRUCK_FULL_COST_PER_KM)} €/km). Útil para llenar huecos, no como base del negocio.${missed}` };
    return { grade: missed ? "razonable" : "correcta", feedback: `Cubre el coste completo del camión ${ret ?? "aun con el retorno en vacío"} (${n2(perKm)} €/km recorrido).${missed}` };
  }
  if (o.kind === "distribucion") {
    if (o.ratePerKm! < TRUCK_FULL_COST_PER_KM) return { grade: "razonable", feedback: `La tarifa (${n2(o.ratePerKm!)} €/km) cubre el gasóleo, pero no el coste completo del camión (${n2(TRUCK_FULL_COST_PER_KM)} €/km con conductor, seguro y amortización).` };
    return { grade: "correcta", feedback: `La tarifa (${n2(o.ratePerKm!)} €/km) cubre el coste completo del camión (${n2(TRUCK_FULL_COST_PER_KM)} €/km).` };
  }
  if (o.palletRate! < WAREHOUSE_FULL_COST_PER_PALLET) return { grade: "razonable", feedback: `La tarifa (${n2(o.palletRate!)} €/palé/semana) no cubre el coste del almacén lleno (${n2(WAREHOUSE_FULL_COST_PER_PALLET)} €).` };
  return { grade: "correcta", feedback: `La tarifa (${n2(o.palletRate!)} €/palé/semana) cubre el coste del almacén lleno (${n2(WAREHOUSE_FULL_COST_PER_PALLET)} €).` };
}

/** Precio por km recorrido de una oferta de transporte (el puntual cuenta ida y vuelta, con la carga de retorno si se acepta). */
const ratePerKmRun = (o: Offer, withBackhaul: boolean) => (o.kind === "distribucion" ? o.ratePerKm! : round2((o.price! + (withBackhaul && o.backhaul ? o.backhaul.price : 0)) / (2 * o.kmOneWay!)));

/** Subcontratar al aceptar: el margen es la tarifa menos lo que cobra el subcontratista; tu camión no se ocupa. */
function gradeSubcontract(s: Pick<SimState, "contracts"> & WithGrowth, o: Offer, weeks: number[], withBackhaul: boolean): { grade: Grade; feedback: string } {
  const rate = ratePerKmRun(o, withBackhaul);
  const margin = round2(rate - GROWTH.subcontract.perKm);
  const missed = o.kind === "puntual" && !withBackhaul && o.backhaul ? ` Además dejaste pasar la carga de retorno (+${o.backhaul.price} €).` : "";
  const liable = "Y respondes ante el cliente si el subcontratista falla (Ley 15/2009, art. 6.1).";
  if (margin < 0) return { grade: "grave", feedback: `Pierdes dinero: cobras ${n2(rate)} €/km y el subcontratista te cobra ${n2(GROWTH.subcontract.perKm)} €/km.${missed}` };
  if (weeks.every((w) => kmOwnCommitted(s, w) + kmOf(o) <= truckKmAt(s, w)))
    return { grade: "razonable", feedback: `Tenías camión libre: hacerlo tú costaba ${n2(P.variablePerKm)} €/km de gasóleo, mantenimiento y peajes (el conductor ya lo pagas); subcontratando pagas ${n2(GROWTH.subcontract.perKm)} €/km.${missed}` };
  if (margin < 0.1) return { grade: "razonable", feedback: `Margen muy corto: ganas ${n2(margin)} €/km (${n2(rate)} − ${n2(GROWTH.subcontract.perKm)}) sin usar tu camión. ${liable}${missed}` };
  return { grade: missed ? "razonable" : "correcta", feedback: `Ganas ${n2(margin)} €/km (${n2(rate)} − ${n2(GROWTH.subcontract.perKm)}) con un trabajo que tu camión no podía hacer. ${liable}${missed}` };
}

// ── Herramientas para crecer (docs/simulador.md §17 sexies) ─────────────────────────────────────────────────────────

export const GROWTH_LABELS: Record<GrowthOption, string> = { renting: "Segundo camión en renting", compra: "Comprar un segundo camión", almacen: "Ampliar el almacén", poliza: "Póliza de crédito" };

/** Media de lo comprometido las 4 semanas siguientes sobre la capacidad actual (en %). */
function nextUse(s: SimState, used: (w: number) => number, cap: number): number {
  const ws = [1, 2, 3, 4].map((k) => s.week + k);
  return Math.round(sum(ws.map(used)) / ws.length / cap * 100);
}

/** Por qué una herramienta está disponible o no ahora mismo (null = disponible). */
export function growthBlocked(s: SimState, opcion: GrowthOption): string | null {
  if (s.status !== "jugando") return s.status === "incidencia" ? "Primero resuelve la incidencia." : "La partida ha terminado.";
  if ((opcion === "renting" || opcion === "compra") && s.growth?.camion) return "Ya tienes el segundo camión.";
  if (opcion === "almacen" && s.growth?.almacen) return "Ya has ampliado el almacén.";
  if (opcion === "poliza" && s.growth?.poliza) return "Ya tienes la póliza de crédito.";
  if (s.week >= SEASON_WEEKS) return "Es la última semana de la temporada.";
  return null;
}

/** Calificación de una herramienta para crecer, con los números de la empresa en ese momento. */
export function gradeGrowth(s: SimState, opcion: GrowthOption): { grade: Grade; feedback: string } {
  const cushion = s.cash + creditLimitAt(s, s.week);
  if (opcion === "renting" || opcion === "compra") {
    const use = nextUse(s, (w) => kmOwnCommitted(s, w), TRUCK_KM_WEEK);
    const weekly = opcion === "renting" ? (GROWTH.truck.driverMonthly + GROWTH.truck.renting.monthly) / WEEKS_PER_MONTH : (GROWTH.truck.driverMonthly + GROWTH.truck.compra.insuranceMonthly) / WEEKS_PER_MONTH + GROWTH.truck.compra.amortizationWeek;
    const cost = `El segundo camión cuesta ${n2(weekly)} € a la semana (${opcion === "renting" ? "cuota de renting y conductor" : "conductor, seguro y amortización"}) desde la semana que viene, tengas trabajo para él o no.`;
    if (opcion === "compra" && cushion - GROWTH.truck.compra.price < 5_000)
      return { grade: "grave", feedback: `Pagar ${GROWTH.truck.compra.price.toLocaleString("es-ES")} € al contado te deja con ${n2(round2(s.cash - GROWTH.truck.compra.price))} € en caja${creditLimitAt(s, s.week) ? " (contando la póliza, casi sin margen)" : ""}: una inversión que se come la tesorería puede hundir una empresa rentable. El renting no inmoviliza caja.` };
    if (use < 85) return { grade: "razonable", feedback: `Tu camión tiene comprometido de media un ${use} % de sus km en las 4 próximas semanas: aún le cabe trabajo. ${cost} Se crece cuando la capacidad se queda corta, no antes.` };
    const vs = opcion === "renting" ? " El renting no inmoviliza caja y se devuelve; comprar sale algo más barato por semana, pero saca 48.000 € de la tesorería." : " Comprar sale algo más barato por semana que el renting, pero inmoviliza 48.000 € que ya no tienes para pagar a tiempo.";
    return { grade: "correcta", feedback: `Tu camión va al ${use} % de sus km las 4 próximas semanas: necesitas capacidad. ${cost}${vs}` };
  }
  if (opcion === "almacen") {
    const use = nextUse(s, (w) => palletsCommitted(s, w), P.warehousePallets);
    const weekly = (GROWTH.warehouse.rentMonthly + GROWTH.warehouse.workerMonthly) / WEEKS_PER_MONTH;
    const deposit = GROWTH.warehouse.rentMonthly * GROWTH.warehouse.depositMonths;
    const cost = `La nave contigua (${GROWTH.warehouse.pallets} palés) cuesta ${n2(weekly)} € a la semana (alquiler y un mozo más) y ${deposit.toLocaleString("es-ES")} € de fianza, que recuperas al irte.`;
    if (use < 85) return { grade: "razonable", feedback: `Tu almacén tiene comprometido de media un ${use} % de sus palés en las 4 próximas semanas: aún hay sitio. ${cost} Además, la ocupación media del objetivo se calcula sobre los palés que tengas: un almacén más grande y medio vacío la baja.` };
    return { grade: "correcta", feedback: `Tu almacén va al ${use} % las 4 próximas semanas: necesitas sitio. ${cost}` };
  }
  const fee = round2(GROWTH.credit.limit * GROWTH.credit.openingFee);
  const terms = `Límite de ${GROWTH.credit.limit.toLocaleString("es-ES")} €, ${n2(fee)} € de comisión de apertura y un ${n2(GROWTH.credit.annualRate * 100)} % anual solo sobre lo dispuesto.`;
  if (s.cash < 15_000 || s.growth?.camion || s.growth?.almacen) return { grade: "correcta", feedback: `${terms} Una póliza cubre desfases de caja (pagas antes de cobrar), no pérdidas: si la empresa pierde dinero, solo retrasa el problema.` };
  return { grade: "razonable", feedback: `${terms} Con ${n2(s.cash)} € en caja y sin inversiones, quizá no la uses; tenerla antes de necesitarla es prudente, pero la comisión se paga igual.` };
}

// ── Incidencias (docs/simulador.md §10) ─────────────────────────────────────────────────────────────────────────────

/**
 * Averías: una por tramo (BREAKDOWN_WINDOWS), según la semilla. La primera usa exactamente el mismo sorteo e
 * identificador que en la fase 1 («averia»), para que las partidas guardadas entonces se reproduzcan igual.
 */
export function breakdownsOf(seed: number) {
  return BREAKDOWN_WINDOWS.map((win, k) => {
    const r = stream(seed, k, "averia");
    return { id: k === 0 ? "averia" : `averia-${k + 1}`, week: intIn(r, win.from, win.to), days: intIn(r, P.breakdownDays.min, P.breakdownDays.max), repair: intIn(r, P.repair.min, P.repair.max, 50) };
  });
}
export const breakdownOf = (seed: number) => breakdownsOf(seed)[0];
export const breakdownAt = (seed: number, week: number) => breakdownsOf(seed).find((b) => b.week === week) ?? null;

/** Precio del subcontratista en una avería: 1,05 €/km hasta la v2 (partidas guardadas); desde la v3, el de mercado. */
export const subcontractPerKm = (version: number) => (version >= 3 ? GROWTH.subcontract.perKm : P.subcontractPerKm);

/** Opciones ante una incidencia con los precios de la versión de la partida. */
export const incidentOptions = (kind: "averia" | "mora", version: number): IncidentOption[] =>
  kind === "averia" && version >= 3 ? INCIDENT_OPTIONS.averia.map((o) => (o.id === "subcontratar" ? { ...o, feedback: o.feedback.replace(n2(P.subcontractPerKm), n2(subcontractPerKm(version))) } : o)) : INCIDENT_OPTIONS[kind];

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
  return Math.max(0, kmOwnCommitted(s, w) - capacity);
}

/** Incidencias que exigen decisión en la semana actual, en orden, aún sin responder. */
export function dueIncidents(s: SimState): Incident[] {
  const w = s.week;
  const out: Incident[] = [];
  const b = breakdownAt(s.seed, w);
  if (b && !s.answers[b.id]) {
    const cap = truckKmAt(s, w) - b.days * P.kmPerDay;
    const short = shortfall(s, w, cap);
    if (short > 0) out.push({ id: b.id, kind: "averia", week: w, title: "Avería del camión", concept: "Un plan de contingencia (subcontratar, reprogramar, avisar) evita que una avería se convierta en un incumplimiento con el cliente.",
      prompt: `${truckKmAt(s, w) > TRUCK_KM_WEEK ? "Uno de tus camiones" : "El camión"} entra en el taller ${b.days} ${b.days === 1 ? "día" : "días"} (reparación: ${b.repair} €). Esta semana podrás hacer ${cap} km y tienes comprometidos ${kmOwnCommitted(s, w)}: te faltan ${short} km.`, data: { days: b.days, repair: b.repair, short } });
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
    if (a.retorno && !o.backhaul) throw new Error("Esta oferta no tiene carga de retorno.");
    if (a.subcontratar && o.kind === "almacenaje") throw new Error("El almacenaje no se puede subcontratar.");
    if (a.subcontratar && subcontractRoom(s, o) < kmOf(o)) throw new Error(`Tus subcontratistas no tienen más camiones libres: como mucho ${GROWTH.subcontract.maxKmWeek} km por semana.`);
    const g = gradeOffer(s, o, !!a.retorno, !!a.subcontratar);
    const contract: Contract = { ...o, startWeek: o.week, endWeek: o.week + o.weeks - 1, ...(a.retorno ? { withBackhaul: true } : {}), ...(a.subcontratar ? { subcontracted: true } : {}) };
    learn(s, { week: s.week, what: `Aceptar: ${describeOffer(o)}`, answer: a.subcontratar ? "Aceptada y subcontratada" : "Aceptada", grade: g.grade, feedback: g.feedback, competences: o.kind === "almacenaje" ? ["0625-RA3", "0623-RA7"] : ["0622-RA2", "0622-RA3", "0623-RA7"] });
    // Documentación: solo si la acción la trae (las aceptaciones guardadas antes del 09/11/2026 no la tenían).
    if (a.docs) {
      const valid = new Set(docsFor(o.kind).map((d) => d.id));
      if (a.docs.some((d) => !valid.has(d))) throw new Error("Documento no válido para esta operación.");
      const d = gradeDocs(o.kind, a.docs);
      contract.docs = [...a.docs];
      contract.docIssues = d.issues;
      learn(s, { week: s.week, what: `Documentación: ${clientOf(o.clientId).name}`, answer: a.docs.map((id) => docsFor(o.kind).find((x) => x.id === id)!.label).join(", ") || "Ninguna", grade: d.grade, feedback: d.feedback.join(" "), competences: o.kind === "almacenaje" ? ["0625-RA1", "0625-RA2"] : ["0622-RA5"] });
    }
    s.contracts.push(contract);
    s.offers = s.offers.filter((x) => x.id !== o.id);
    return s;
  }
  if (a.t === "proponer") {
    if (s.status !== "jugando") throw new Error(s.status === "incidencia" ? "Primero resuelve la incidencia." : "La partida ha terminado.");
    const o = s.offers.find((x) => x.id === a.oferta);
    if (!o) throw new Error("Oferta no disponible.");
    const p: Terms = { rate: a.tarifa, weeks: o.kind === "puntual" ? 1 : a.semanas, payWeeks: a.plazo };
    const invalid = validateProposal(o, p);
    if (invalid) throw new Error(invalid);
    const reply = respond(s.seed, o, p);
    const base = originalTerms(o);
    const name = clientOf(o.clientId).name;
    if (reply.kind === "rechaza") {
      s.offers = s.offers.filter((x) => x.id !== o.id);
      learn(s, { week: s.week, what: `Negociación con ${name}`, answer: `Propusiste ${n2(p.rate)}`, grade: "razonable", feedback: `${reply.message} Pedir más es legítimo, pero hay que conocer el margen del cliente: has perdido la operación.`, competences: ["0824-RA3"] });
      return s;
    }
    const updated: Offer = { ...withTerms(o, reply.terms), original: base, round: (o.round ?? 0) + 1, note: reply.message, agreed: reply.kind === "acepta" };
    s.offers = s.offers.map((x) => (x.id === o.id ? updated : x));
    if (reply.kind === "acepta") {
      const gain = round2((reply.terms.rate / base.rate - 1) * 100);
      learn(s, { week: s.week, what: `Negociación con ${name}`, answer: `Propusiste ${n2(p.rate)}`, grade: gain >= 0 ? "correcta" : "razonable", feedback: gain > 0 ? `Acuerdo un ${n2(gain)} % por encima de su tarifa inicial.` : gain === 0 ? "Acuerdo con la tarifa inicial y tus condiciones." : `Acuerdo, pero ${n2(-gain)} % por debajo de su tarifa inicial: has cedido precio sin necesidad.`, competences: ["0824-RA3"] });
    }
    return s;
  }
  if (a.t === "crecer") {
    const blocked = growthBlocked(s, a.opcion);
    if (blocked) throw new Error(blocked);
    const g = gradeGrowth(s, a.opcion);
    const key = a.opcion === "renting" || a.opcion === "compra" ? "camion" : a.opcion;
    s.growth = { ...s.growth, [key]: key === "camion" ? { modo: a.opcion, week: s.week } : { week: s.week } };
    learn(s, { week: s.week, what: GROWTH_LABELS[a.opcion], answer: "Contratada", grade: g.grade, feedback: g.feedback, competences: a.opcion === "almacen" ? ["0625-RA3", "0623-RA4"] : a.opcion === "poliza" ? ["0623-RA3", "0623-RA7"] : ["0623-RA3", "0623-RA4"] });
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
    const opt = incidentOptions(s.pending.kind, s.version).find((x) => x.id === a.opcion);
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
  // Pagos de las herramientas para crecer, la semana de la decisión.
  const g = s.growth;
  let costFinancial = 0;
  if (g?.camion?.week === w && g.camion.modo === "compra") { move("Compra del segundo camión", -GROWTH.truck.compra.price); s.truckValue = round2(s.truckValue + GROWTH.truck.compra.price); }
  if (g?.almacen?.week === w) { const d = GROWTH.warehouse.rentMonthly * GROWTH.warehouse.depositMonths; move("Fianza de la nave ampliada", -d); s.deposit = round2(s.deposit + d); }
  if (g?.poliza?.week === w) { const fee = round2(GROWTH.credit.limit * GROWTH.credit.openingFee); costFinancial += fee; move("Comisión de apertura de la póliza", -fee); }
  // Intereses: solo por lo dispuesto (la caja negativa con la que empezó la semana).
  const start = cashStart(s, w);
  if (g?.poliza && w > g.poliza.week && start < 0) { const i = round2(-start * GROWTH.credit.annualRate / 52); costFinancial += i; move("Intereses de la póliza", -i); }

  // Capacidad del camión (avería) y reparto de kilómetros: primero los contratos más antiguos.
  const b = breakdownAt(s.seed, w);
  const broke = b !== null;
  const capacity = truckKmAt(s, w) - (b ? b.days * P.kmPerDay : 0);
  const repair = b ? b.repair : 0;
  if (b) notes.push(`Avería: ${b.days} ${b.days === 1 ? "día" : "días"} en el taller y ${b.repair} € de reparación.`);
  const decision = b ? s.answers[b.id] : undefined;
  const transport = s.contracts.filter((c) => activeIn(c, w) && c.kind !== "almacenaje" && !c.subcontracted).sort((a, c) => a.startWeek - c.startWeek || (a.kind === c.kind ? a.id.localeCompare(c.id) : a.kind === "distribucion" ? -1 : 1));
  let left = capacity;
  let kmOwn = 0, kmSub = 0, kmPlanned = 0, kmUnserved = 0, unservedWeight = 0;
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
    const amount = c.kind === "distribucion" ? round2((need - missing) * c.ratePerKm!) : missing === 0 ? c.price! + (c.withBackhaul && c.backhaul ? c.backhaul.price : 0) : 0;
    revenueTransport += amount;
    if (amount > 0) invoices.push({ c, amount });
  }
  // Lo subcontratado al aceptar: lo hace otro transportista, que alguna semana falla (y respondes tú ante el cliente).
  for (const c of s.contracts.filter((x) => activeIn(x, w) && x.kind !== "almacenaje" && x.subcontracted).sort((a, c) => a.id.localeCompare(c.id))) {
    const need = kmOf(c);
    if (stream(s.seed, w, `subcontrata-${c.id}`)() < GROWTH.subcontract.failChance) {
      kmUnserved += need; unservedWeight += need;
      if (c.kind === "distribucion") breached.push(c);
      notes.push(`El subcontratista no hizo el servicio de ${clientOf(c.clientId).name}: no se factura y respondes tú ante el cliente.`);
      continue;
    }
    kmSub += need; kmPlanned += need;
    const amount = c.kind === "distribucion" ? round2(need * c.ratePerKm!) : c.price! + (c.withBackhaul && c.backhaul ? c.backhaul.price : 0);
    revenueTransport += amount;
    invoices.push({ c, amount });
  }
  if (kmUnserved > 0) notes.push(`${kmUnserved} km comprometidos sin hacer: no se facturan.`);
  if (broke && decision === "callar") {
    const biggest = transport.filter((c) => c.kind === "distribucion").sort((a, c) => kmOf(c) - kmOf(a))[0];
    if (biggest) { biggest.cancelledWeek = w + 1; notes.push(`${clientOf(biggest.clientId).name} cancela su contrato por el fallo sin aviso.`); }
  }

  // Almacén: palés por orden de llegada hasta la capacidad.
  const palletCapacity = palletCapacityAt(s, w);
  let room = palletCapacity;
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

  // Documentación que falta: una vez por contrato puede aparecer la consecuencia (inspección o reclamación), según la semilla.
  let costPenalties = 0;
  for (const c of s.contracts.filter((x) => activeIn(x, w) && x.docIssues?.length && !x.docPenalized)) {
    const issue = c.docIssues![0];
    if (stream(s.seed, w, `documentos-${c.id}`)() < DOC_RISK[issue].chance) {
      c.docPenalized = true;
      costPenalties += DOC_RISK[issue].cost;
      notes.push(`${clientOf(c.clientId).name}: ${DOC_RISK[issue].text}`);
    }
  }

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
  const costSubcontract = round2((kmSub - kmPlanned) * subcontractPerKm(s.version) + kmPlanned * GROWTH.subcontract.perKm);
  if (kmSub > 0) s.payables.push({ id: `p${w}-sub`, label: `Subcontratista (${kmSub} km)`, amount: costSubcontract, week: w, dueWeek: w + GROWTH.subcontract.payWeeks });
  move("Gasóleo, mantenimiento y peajes", -costVariable);
  if (costPenalties) move("Sanciones y reclamaciones por documentación", -costPenalties);
  if (repair) move("Reparación del camión", -repair);
  const fixed = fixedPerWeekAt(s, w);
  const amortization = amortizationAt(s, w);
  s.accruedFixed = round2(s.accruedFixed + fixed);
  s.truckValue = round2(s.truckValue - amortization);
  revenueTransport = round2(revenueTransport);
  revenueWarehouse = round2(revenueWarehouse);
  costFinancial = round2(costFinancial);
  const result = round2(revenueTransport + revenueWarehouse - costVariable - costSubcontract - repair - costPenalties - costFinancial - fixed - amortization);
  s.result = round2(s.result + result);

  // Caja: cobros y pagos que vencen esta semana; fijos cada 4 semanas.
  let collections = 0;
  for (const inv of s.receivables) if (inv.paidWeek === undefined && inv.payWeek === w) { inv.paidWeek = w; collections += inv.amount; move(`Cobro de ${clientOf(inv.clientId).name}`, inv.amount); }
  let payments = 0;
  for (const p of s.payables) if (p.paidWeek === undefined && p.dueWeek === w) { p.paidWeek = w; payments += p.amount; move(`Pago: ${p.label}`, -p.amount); }
  if (w % WEEKS_PER_MONTH === 0) { move(g?.camion?.modo === "renting" && fixed > FIXED_PER_WEEK ? "Alquiler, nóminas, seguro, gestoría y renting del mes" : "Alquiler, nóminas, seguro y gestoría del mes", -s.accruedFixed); s.accruedFixed = 0; }

  // Nivel de servicio: lo servido sobre lo comprometido (km y palés); lo avisado cuenta la mitad.
  const committedUnits = kmCommitted(s, w) + palletsCommitted(s, w);
  const serviceLevel = committedUnits ? round2((committedUnits - unservedWeight - rejected) / committedUnits * 100) : 100;

  const rec: WeekRecord = {
    week: w, kmCapacity: capacity, kmCommitted: kmCommitted(s, w), kmOwn, kmSubcontracted: kmSub, kmUnserved, palletsCommitted: palletsCommitted(s, w), palletsStored: stored,
    revenueTransport, revenueWarehouse, costVariable, costSubcontract, costRepair: repair, costFixed: fixed, costPenalties, costFinancial, palletCapacity, amortization, result,
    collections: round2(collections), payments: round2(payments), cashEnd: s.cash, serviceLevel, notes,
  };
  s.weeks.push(rec);

  // Con póliza, la caja puede bajar de cero hasta el límite; la quiebra llega al pasarlo dos semanas seguidas.
  const limit = creditLimitAt(s, w);
  s.negativeWeeks = s.cash < -limit ? s.negativeWeeks + 1 : 0;
  s.lowServiceWeeks = serviceLevel < SERVICE_FLOOR.pct ? (s.lowServiceWeeks ?? 0) + 1 : 0;
  if (s.negativeWeeks >= 2) { s.status = "quiebra"; s.endReason = limit ? "La caja ha superado el límite de la póliza de crédito dos semanas seguidas: el banco no te da más y no puedes pagar a tus proveedores ni las nóminas." : "La caja ha estado en negativo dos semanas seguidas: no puedes pagar a tus proveedores ni las nóminas."; return; }
  if (s.lowServiceWeeks >= SERVICE_FLOOR.weeks) { s.status = "quiebra"; s.endReason = `Tu nivel de servicio ha estado por debajo del ${SERVICE_FLOOR.pct} % ${SERVICE_FLOOR.weeks} semanas seguidas: tus clientes clave se van y la empresa no puede seguir.`; return; }
  if (w >= SEASON_WEEKS) { s.status = "fin"; return; }
  s.week = w + 1;
  s.offers = offersFor(s.seed, s.week, serviceLevelToDate(s), s.version);
}

// ── Lecturas para la interfaz y las pruebas ───────────────────────────────────────────────────────────────────────

export { bestDocs };

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
  return round2(assets - sources) || 0; // sin «-0»
}

/** Nivel de servicio de las últimas `weeks` semanas (8 por defecto: es la reputación que ven los clientes). */
export function serviceLevelToDate(s: SimState, weeks = 8): number {
  const recent = s.weeks.slice(-weeks);
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


/** Objetivos de temporada (docs/simulador.md §12, revisado el 09/11/2026): beneficio al final y 1 de los otros 2. */
export function seasonOutcome(s: SimState) {
  const stored = s.weeks.reduce((a, w) => a + w.palletsStored, 0);
  const capacity = s.weeks.reduce((a, w) => a + (w.palletCapacity ?? P.warehousePallets), 0);
  const occupancy = capacity ? round2(stored / capacity * 100) : 0;
  const service = serviceLevelToDate(s, s.weeks.length);
  const last8 = round2(s.weeks.slice(-8).reduce((a, w) => a + w.result, 0));
  const objectives = [
    { id: "beneficio", label: "Beneficio en las últimas 8 semanas (la empresa ya es viable)", value: last8, ok: last8 > 0, shown: `${n2(last8)} €` },
    { id: "ocupacion", label: `Ocupación media del almacén de al menos el ${OBJECTIVES.minWarehouseOccupancyPct} %`, value: occupancy, ok: occupancy >= OBJECTIVES.minWarehouseOccupancyPct, shown: `${occupancy.toLocaleString("es-ES")} %` },
    { id: "servicio", label: `Nivel de servicio de la temporada de al menos el ${OBJECTIVES.minServicePct} %`, value: service, ok: service >= OBJECTIVES.minServicePct, shown: `${service.toLocaleString("es-ES")} %` },
  ];
  const met = objectives.filter((o) => o.ok).length;
  // Se gana con beneficio al final y al menos uno de los otros dos: sin beneficio, la empresa no es viable aunque cumpla.
  return { objectives, met, victory: s.status === "fin" && objectives[0].ok && met >= 2 };
}

/** Tu historial con un cliente: lo que ya sabes por experiencia propia (más fiable que las referencias de terceros). */
export function clientHistory(s: SimState, clientId: string) {
  const inv = s.receivables.filter((i) => i.clientId === clientId);
  const paid = inv.filter((i) => i.paidWeek !== undefined);
  const late = paid.filter((i) => i.paidWeek! > i.dueWeek);
  const overdue = inv.filter((i) => i.paidWeek === undefined && i.dueWeek < s.week);
  return { invoices: inv.length, paid: paid.length, paidLate: late.length, maxDelayWeeks: Math.max(0, ...late.map((i) => i.paidWeek! - i.dueWeek)), overdue: overdue.length };
}

/** Caja al empezar una semana: la del cierre anterior (o la inicial). */
export const cashStart = (s: SimState, week: number) => (week <= 1 ? P.initialCash : s.weeks.find((w) => w.week === week - 1)?.cashEnd ?? P.initialCash);

/** Movimientos de caja de una semana agrupados por concepto (tesorería, separada de la cuenta de resultados). */
export function cashByConcept(s: SimState, week: number) {
  const groups: Record<string, number> = {};
  for (const m of s.ledger.filter((x) => x.week === week)) {
    const k = m.amount > 0 ? "Cobros de clientes" : /^Pago: Subcontratista/.test(m.label) ? "Pagos a subcontratistas" : m.label;
    groups[k] = round2((groups[k] ?? 0) + m.amount);
  }
  return groups;
}
