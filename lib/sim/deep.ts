import { round2, sum } from "../learning/money";
import { directCost, fixedShare } from "./international";
import { clientOf, handlingRevenue, kmOf, offersFor, scaleRates, weeklyRevenue, workOf } from "./market";
import type { Contract, Grade, Offer, SimState } from "./model";
import { CAREER_DEEP, P, WEEKS_PER_MONTH } from "./params";
import { intIn, stream } from "./rng";

/**
 * Carrera, fase B1: operaciones más profundas (21/11/2026; docs/simulador-carrera.md §6). Petición del dueño: «menos
 * ofertas de trabajos y más profundidad en cada una». Solo en la Carrera con reglas v11 o posteriores: la Temporada y
 * las Carreras guardadas antes se juegan igual que siempre.
 *
 * Una operación pasa por estas fases:
 * 1. Ficha: quién, qué mercancía, cuántos palés y toneladas, qué ruta, con qué frecuencia y durante cuánto tiempo.
 * 2. Informe comercial (opcional, se paga): cómo paga el cliente de verdad. Sin él solo tienes referencias de terceros.
 * 3. Escandallo (obligatorio antes de negociar o aceptar): calculas el coste completo de la operación con los datos de
 *    tu empresa y el juego lo compara con el real, explicado partida a partida.
 * 4. Negociación y documentación (las de siempre).
 * 5. Evaluación al terminar el contrato: margen previsto (con TU escandallo) frente al real.
 *
 * Coste completo = costes directos + la parte de los fijos de la línea que ocupa la operación (conductor, seguro y
 * amortización del camión; alquiler y mozo del almacén). No incluye la estructura (gerente y gestoría), que no depende
 * de una operación. Es una convención de escandallo declarada, no la única posible.
 */

export const isDeep = (s: Pick<SimState, "mode" | "version">) => s.mode === "carrera" && s.version >= CAREER_DEEP.fromVersion;

// ── Mercado: pocas ofertas, más grandes y más largas ────────────────────────────────────────────────────────────────

/** Destinos de reparto desde Valencia, con distancias APROXIMADAS por carretera (simuladas, para el juego). */
export const ROUTES = [
  { city: "Castellón", km: 75 }, { city: "Gandía", km: 65 }, { city: "Xàtiva", km: 60 }, { city: "Requena", km: 70 },
  { city: "Teruel", km: 145 }, { city: "Alicante", km: 170 }, { city: "Albacete", km: 190 }, { city: "Cuenca", km: 205 },
  { city: "Murcia", km: 240 }, { city: "Madrid", km: 355 },
] as const;

/** Mercancía por sector del cliente: toneladas por palé y valor por kg (SIMULADOS; servirán para el valor declarado). */
const GOODS: Record<string, { goods: string; tPerPallet: number; valuePerKg: number }> = {
  "alimentación": { goods: "alimentación envasada", tPerPallet: 0.7, valuePerKg: 3 },
  "cerámica": { goods: "pavimento y revestimiento cerámico", tPerPallet: 1.0, valuePerKg: 0.6 },
  "fruta": { goods: "fruta fresca en cajas", tPerPallet: 0.5, valuePerKg: 1.2 },
  "muebles": { goods: "muebles embalados", tPerPallet: 0.25, valuePerKg: 6 },
  "recambios de automóvil": { goods: "recambios de automóvil", tPerPallet: 0.4, valuePerKg: 12 },
  "bebidas": { goods: "bebidas embotelladas", tPerPallet: 0.8, valuePerKg: 1.5 },
  "textil": { goods: "prendas textiles en cajas", tPerPallet: 0.2, valuePerKg: 15 },
  "electrodomésticos": { goods: "electrodomésticos", tPerPallet: 0.3, valuePerKg: 8 },
};

/** Ruta y mercancía de una operación: lo que el cliente cuenta en su solicitud. */
function withFicha(o: Offer, seed: number): Offer {
  const r = stream(seed, o.week, `ficha-${o.id}`);
  const g = GOODS[clientOf(o.clientId).sector];
  const pallets = o.kind === "almacenaje" ? o.pallets! : intIn(r, 8, 18);
  const ficha = { goods: g.goods, pallets, tonnes: round2(pallets * g.tPerPallet), valuePerKg: g.valuePerKg };
  if (o.kind !== "distribucion") return { ...o, ficha };
  // Distribución: un destino y los viajes por semana que dan unos km parecidos a los que pedía (como mucho 1.000).
  const route = ROUTES[Math.floor(r() * ROUTES.length)];
  const target = o.kmWeek! * (CAREER_DEEP.volume.min + r() * (CAREER_DEEP.volume.max - CAREER_DEEP.volume.min));
  const trips = Math.max(1, Math.min(Math.floor(CAREER_DEEP.maxKmWeek / (2 * route.km)), Math.round(target / (2 * route.km))));
  return { ...o, kmWeek: trips * 2 * route.km, ficha: { ...ficha, route: route.city, kmOneWay: route.km, trips } };
}

/** Un contrato recurrente dura de 2 a 6 meses; el almacenaje mueve más palés (y su manipulación en proporción). */
function deepen(o: Offer, seed: number): Offer {
  const r = stream(seed, o.week, `profunda-${o.id}`);
  const weeks = o.kind === "distribucion" || o.kind === "almacenaje" ? intIn(r, CAREER_DEEP.weeks.min, CAREER_DEEP.weeks.max) : o.weeks;
  if (o.kind !== "almacenaje") return withFicha({ ...o, weeks }, seed);
  const k = CAREER_DEEP.volume.min + r() * (CAREER_DEEP.volume.max - CAREER_DEEP.volume.min);
  const pallets = Math.max(10, Math.round(o.pallets! * k / 10) * 10);
  const f = pallets / o.pallets!;
  const handling = o.movesWeek !== undefined ? { movesWeek: Math.max(1, Math.round(o.movesWeek * f)), linesWeek: Math.round(o.linesWeek! * f) } : {};
  return withFicha({ ...o, weeks, pallets, ...handling }, seed);
}

/**
 * Ofertas de una semana de la Carrera (v11). Salen de la lista de siempre de esa semana (mismos clientes y precios por
 * unidad, con la reputación ya aplicada), pero llegan muchas menos y más grandes: 0, 1 o 2 por semana (probabilidades en
 * CAREER_DEEP.count; una de media), y la semana 1, una de distribución y una de almacenaje para poder empezar.
 */
export function deepOffers(seed: number, week: number, serviceLevel: number, version: number): Offer[] {
  const all = offersFor(seed, week, serviceLevel, version);
  if (week === 1) return scaleRates(all.filter((o) => o.kind === "distribucion" || o.kind === "almacenaje").slice(0, 2), CAREER_DEEP.priceFactor, version).map((o) => deepen(o, seed));
  const r = stream(seed, week, "carrera-ofertas");
  const x = r();
  let acc = 0, k = 0;
  for (; k < CAREER_DEEP.count.length - 1; k++) { acc += CAREER_DEEP.count[k]; if (x < acc) break; }
  const n = Math.min(all.length, k);
  const pool = [...all];
  const out: Offer[] = [];
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return scaleRates(out.sort((a, b) => a.id.localeCompare(b.id)), CAREER_DEEP.priceFactor, version).map((o) => deepen(o, seed));
}

// ── Escandallo ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Fijos semanales de la línea de transporte que se reparten por km: conductor, seguro y amortización. */
const TRUCK_FIXED_WEEK = P.fixedMonthly.conductor / WEEKS_PER_MONTH + P.fixedMonthly.seguro / WEEKS_PER_MONTH + P.amortizationWeek;
const TRUCK_KM = P.kmPerDay * P.workDays;
const RENT_PER_PALLET_WEEK = P.fixedMonthly.alquiler / WEEKS_PER_MONTH / P.warehousePallets;
const WORKER_WEEK_COST = P.fixedMonthly.mozo / WEEKS_PER_MONTH;

export type CostUnit = "€/km" | "€ el viaje" | "€ por semana";
export interface CostLine { label: string; amount: number }
export interface FullCost { unit: CostUnit; value: number; lines: CostLine[]; weekly: number; note: string }

/** Coste completo de una operación con los costes de tu empresa (la convención está arriba). */
export function fullCost(o: Offer): FullCost {
  if (o.kind === "distribucion") {
    const v = P.variablePerKm, f = round2(TRUCK_FIXED_WEEK / TRUCK_KM);
    return { unit: "€/km", value: round2(v + f), weekly: round2((v + f) * o.kmWeek!), note: `Por km: ${o.kmWeek} km a la semana.`, lines: [
      { label: `Gasóleo, mantenimiento y peajes: ${P.variablePerKm.toLocaleString("es-ES")} €/km`, amount: v },
      { label: `Conductor, seguro y amortización: ${round2(TRUCK_FIXED_WEEK).toLocaleString("es-ES")} € a la semana ÷ ${TRUCK_KM.toLocaleString("es-ES")} km que puede hacer el camión`, amount: f },
    ] };
  }
  if (o.kind === "puntual") {
    const km = kmOf(o), v = round2(km * P.variablePerKm), f = round2(km * TRUCK_FIXED_WEEK / TRUCK_KM);
    return { unit: "€ el viaje", value: round2(v + f), weekly: round2(v + f), note: `Ida y vuelta: ${km} km (la vuelta en vacío también cuesta).`, lines: [
      { label: `Gasóleo, mantenimiento y peajes: ${km} km × ${P.variablePerKm.toLocaleString("es-ES")} €`, amount: v },
      { label: `Conductor, seguro y amortización por los ${km} km que ocupa el camión`, amount: f },
    ] };
  }
  if (o.kind === "internacional") {
    const d = directCost(o), f = fixedShare(o.days!);
    return { unit: "€ el viaje", value: round2(d.total + f), weekly: round2(d.total + f), note: `${o.days} días de camión.`, lines: [
      { label: `Gasóleo, mantenimiento y peajes españoles: ${2 * o.kmOneWay!} km`, amount: d.fuel },
      { label: "Peajes extranjeros y dietas del conductor", amount: d.extras },
      { label: `Conductor, seguro y amortización por ${o.days} días de camión`, amount: f },
    ] };
  }
  const site = round2(o.pallets! * RENT_PER_PALLET_WEEK);
  const staff = round2(workOf(o) * WORKER_WEEK_COST);
  return { unit: "€ por semana", value: round2(site + staff), weekly: round2(site + staff), note: `${o.pallets} palés${o.movesWeek !== undefined ? `, ${o.movesWeek} movimientos y ${o.linesWeek} líneas` : ""} a la semana.`, lines: [
    { label: `Sitio: ${o.pallets} palés × ${round2(RENT_PER_PALLET_WEEK).toLocaleString("es-ES")} € (alquiler de la nave ÷ ${P.warehousePallets} palés)`, amount: site },
    { label: `Trabajo del mozo: ${Math.round(workOf(o) * 100)} % de su semana × ${round2(WORKER_WEEK_COST).toLocaleString("es-ES")} €`, amount: staff },
  ] };
}

/** Precio por la misma unidad del escandallo (para comparar). */
export const priceIn = (o: Offer) => (o.kind === "distribucion" ? o.ratePerKm! : o.kind === "almacenaje" ? weeklyRevenue(o) : o.price! + (o.backhaul?.price ?? 0));

/** Corrección del escandallo: dentro del 10 %, bien; dentro del 25 %, razonable; más lejos, error importante. */
export function gradeEstimate(o: Offer, estimate: number): { grade: Grade; feedback: string; real: FullCost } {
  const real = fullCost(o);
  const dev = real.value ? Math.abs(estimate - real.value) / real.value : 1;
  const grade: Grade = dev <= CAREER_DEEP.tolerance.ok ? "correcta" : dev <= CAREER_DEEP.tolerance.close ? "razonable" : "grave";
  const fmt = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${real.unit}`;
  const price = priceIn(o);
  const margin = price ? round2((price - real.value) / price * 100) : 0;
  const how = real.lines.map((l) => `${l.label}: ${l.amount.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" + ");
  const verdict = grade === "correcta" ? "Buen escandallo." : estimate < real.value ? "Te has quedado corto: olvidar costes lleva a aceptar precios que no cubren lo que gastas." : "Te has pasado: con un coste inflado rechazarías operaciones que sí son rentables.";
  const below = price < real.value && o.kind !== "almacenaje" ? " El precio no cubre el coste completo: desde 2022, la Ley 15/2009 (art. 10 bis.1.g) exige que el precio pactado con el transportista que hace el servicio cubra sus costes efectivos." : "";
  return { grade, real, feedback: `${verdict} Tu coste: ${fmt(estimate)}; el completo es ${fmt(real.value)} (${how}). ${real.note} Con su precio (${fmt(price)}) el margen sobre el precio sería del ${margin.toLocaleString("es-ES")} %.${below}` };
}

// ── Evaluación al terminar: previsto frente a real ─────────────────────────────────────────────────────────────────

export interface ContractReview {
  contract: Contract; ended: number; plannedWeeks: number; servedShare: number;
  plannedRevenue: number; realRevenue: number; plannedCost: number; realCost: number; plannedMargin: number; realMargin: number;
  reasons: string[];
}

/** Contratos ya terminados (o cancelados) con su escandallo: margen previsto con TU coste frente al real. */
export function contractReviews(s: SimState): ContractReview[] {
  const last = s.weeks.length ? s.weeks[s.weeks.length - 1].week : 0;
  return s.contracts.filter((c) => c.estimate !== undefined && Math.min(c.endWeek, (c.cancelledWeek ?? Infinity) - 1) <= last).map((c) => {
    const ended = Math.min(c.endWeek, (c.cancelledWeek ?? Infinity) - 1);
    const unitsPerWeek = c.kind === "distribucion" ? c.kmWeek! : 1;
    const plannedRevenue = round2(weeklyRevenue(c) * c.weeks + (c.withBackhaul && c.backhaul ? c.backhaul.price : 0));
    const realRevenue = round2(sum(s.receivables.filter((i) => i.contractId === c.id).map((i) => i.amount)));
    const servedShare = plannedRevenue ? Math.min(1, realRevenue / plannedRevenue) : 0;
    const cost = fullCost(c);
    const plannedCost = round2(c.estimate! * unitsPerWeek * c.weeks);
    const realCost = round2(cost.value * unitsPerWeek * c.weeks * servedShare);
    const reasons: string[] = [];
    if (c.cancelledWeek !== undefined && c.cancelledWeek <= c.endWeek) reasons.push(`El cliente lo canceló en la semana ${c.cancelledWeek}.`);
    else if (servedShare < 0.999) reasons.push("Parte del servicio no se hizo (avería, falta de capacidad o incidencia) y no se facturó.");
    if (Math.abs(c.estimate! - cost.value) / cost.value > CAREER_DEEP.tolerance.ok) reasons.push(`Tu escandallo (${c.estimate!.toLocaleString("es-ES")} ${cost.unit}) se alejaba del coste completo (${cost.value.toLocaleString("es-ES")} ${cost.unit}).`);
    if (!reasons.length) reasons.push("Salió como lo previste.");
    return { contract: c, ended, plannedWeeks: c.weeks, servedShare: round2(servedShare), plannedRevenue, realRevenue, plannedCost, realCost, plannedMargin: round2(plannedRevenue - plannedCost), realMargin: round2(realRevenue - realCost), reasons };
  });
}

export { handlingRevenue };
