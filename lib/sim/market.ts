import { round2 } from "../learning/money";
import type { Client, Offer, OfferKind } from "./model";
import { internationalOffer } from "./international";
import { ENGINE_VERSION, EXTRA_OFFERS, MARKET_GROWTH_FROM, P, PUNTUAL_V2, WAREHOUSE_V6, RELIABILITY_PREMIUM, SEASON_LOW, SEASON_PEAK } from "./params";
import { intIn, pick, stream, type Rng } from "./rng";

/**
 * Clientes y ofertas (docs/simulador.md §11). Empresas FICTICIAS; tarifas y volúmenes SIMULADOS. El perfil de pago es
 * fijo por cliente; en la oferta solo se insinúa (historial, referencias), como pasa en la realidad.
 */
export const CLIENTS: Client[] = [
  { id: "albufera", name: "Distribuciones Albufera (ficticia)", sector: "alimentación", profile: "puntual" },
  { id: "mijares", name: "Cerámicas del Mijares (ficticia)", sector: "cerámica", profile: "tardio" },
  { id: "ribera", name: "Frutas Ribera Alta (ficticia)", sector: "fruta", profile: "puntual" },
  { id: "hortanord", name: "Muebles Horta Nord (ficticia)", sector: "muebles", profile: "tardio" },
  { id: "sagunto", name: "Recambios Sagunto (ficticia)", sector: "recambios de automóvil", profile: "puntual" },
  { id: "requena", name: "Bebidas Requena (ficticia)", sector: "bebidas", profile: "puntual" },
  { id: "ontinyent", name: "Textil Ontinyent (ficticia)", sector: "textil", profile: "tardio" },
  { id: "silla", name: "Electro Silla (ficticia)", sector: "electrodomésticos", profile: "puntual" },
];
export const clientOf = (id: string) => CLIENTS.find((c) => c.id === id)!;

const HINTS: Record<Client["profile"], string[]> = {
  puntual: ["Cliente con buen historial de pagos.", "Nuevo cliente, sin historial.", "Referencias de otros transportistas: paga a su vencimiento."],
  tardio: ["Nuevo cliente, sin historial.", "Algún transportista comenta que a veces se retrasa en los pagos.", "Empresa conocida en su sector; historial de pagos desconocido."],
};

/**
 * Referencia de terceros sobre un cliente: la MISMA en toda la partida (hasta el 09/11/2026 se sorteaba en cada oferta y
 * un mismo cliente salía en la misma semana como «sin historial» y como «se retrasa»). Se sigue consumiendo el número
 * aleatorio de antes para no alterar el resto de la oferta ni las partidas guardadas.
 */
function hint(r: Rng, c: Client, seed: number): string {
  r();
  return pick(stream(seed, 0, `referencia-${c.id}`), HINTS[c.profile]);
}

function makeOffer(r: Rng, seed: number, week: number, n: number, kind: OfferKind, version: number): Offer {
  const c = pick(r, CLIENTS);
  const base = { id: `s${week}-${n}`, week, kind, clientId: c.id, clientHint: hint(r, c, seed), payWeeks: 4 };
  if (kind === "distribucion") return { ...base, kmWeek: intIn(r, 150, 600, 10), ratePerKm: round2(1.05 + r() * 0.5), weeks: intIn(r, 4, 8) };
  if (kind === "puntual") {
    const km = intIn(r, 150, 450, 10);
    if (version < 2) return { ...base, kmOneWay: km, price: Math.round(km * (0.7 + r() * 2.0)), weeks: 1 };
    // v2: mismo número de sorteos de la secuencia de ofertas; la carga de retorno sale de su propia secuencia.
    const price = Math.round(km * (PUNTUAL_V2.minPerKmOneWay + r() * (PUNTUAL_V2.maxPerKmOneWay - PUNTUAL_V2.minPerKmOneWay)));
    const rb = stream(seed, week, `retorno-${base.id}`);
    const backhaul = rb() < PUNTUAL_V2.backhaulChance ? { pallets: intIn(rb, 4, 18), price: Math.round(km * (PUNTUAL_V2.backhaulPerKm.min + rb() * (PUNTUAL_V2.backhaulPerKm.max - PUNTUAL_V2.backhaulPerKm.min))) } : undefined;
    return { ...base, kmOneWay: km, price, weeks: 1, ...(backhaul ? { backhaul } : {}) };
  }
  // Fase 1: la tarifa de almacenaje incluye la manipulación (entradas, salidas, preparación), que se separará en la
  // fase 2. Con solo 1,50 €/palé/semana, sin cobrar la manipulación, la empresa perdería dinero aun llena (ver params.ts).
  return { ...base, pallets: intIn(r, 50, 250, 10), palletRate: round2(2.4 + r() * 1.0), weeks: intIn(r, 4, 10), payWeeks: r() < 0.5 ? 4 : 8 };
}

/**
 * Ofertas de una semana: entre 3 y 5. La semana 1 trae siempre una de cada tipo, para que se pueda empezar a trabajar.
 * Mismas semilla y semana → mismas ofertas, decida lo que decida el jugador antes.
 */
export function offersFor(seed: number, week: number, serviceLevel = 100, version: number = ENGINE_VERSION): Offer[] {
  const r = stream(seed, week, "ofertas");
  // Estacionalidad: se ajusta DESPUÉS del sorteo base, así las semanas fuera de campaña dan las mismas ofertas que antes.
  // Desde la semana 7 el mercado ya conoce a la empresa: llega una oferta más por semana (MARKET_GROWTH_FROM).
  const n = intIn(r, 3, 5) + (week >= MARKET_GROWTH_FROM ? EXTRA_OFFERS : 0) + (week >= SEASON_PEAK.from && week <= SEASON_PEAK.to ? 1 : week >= SEASON_LOW.from && week <= SEASON_LOW.to ? -1 : 0);
  const kinds: OfferKind[] = week === 1 ? ["distribucion", "almacenaje", "puntual"] : [];
  while (kinds.length < n) kinds.push(pick(r, ["distribucion", "distribucion", "puntual", "puntual", "almacenaje"] as const));
  const base = kinds.map((k, i) => makeOffer(r, seed, week, i + 1, k, version));
  // v6: el almacenaje cobra la manipulación aparte; sus cifras salen de otra secuencia (el resto de la oferta no cambia).
  const all = version >= WAREHOUSE_V6.fromVersion ? base.map((o) => (o.kind === "almacenaje" ? withHandling(o, seed) : o)) : base;
  // v5: como mucho un viaje internacional, de su propia secuencia (las demás ofertas no cambian).
  const ri = stream(seed, week, "internacional-cliente");
  const c = pick(ri, CLIENTS);
  const intl = version >= 5 ? internationalOffer(seed, week, version, c.id, hint(ri, c, seed)) : null;
  return withReputation(intl ? [...all, intl] : all, serviceLevel, week);
}

/** Oferta de almacenaje con la manipulación cobrada aparte (v6, ver WAREHOUSE_V6 y lib/sim/warehouse.ts). */
export function withHandling(o: Offer, seed: number): Offer {
  const W = WAREHOUSE_V6;
  const r = stream(seed, o.week, `almacen-${o.id}`);
  const moves = Math.max(1, Math.round(o.pallets! * (W.rotation.min + r() * (W.rotation.max - W.rotation.min))));
  const lines = Math.round(moves * (W.linesPerMove.min + r() * (W.linesPerMove.max - W.linesPerMove.min)));
  return { ...o, palletRate: round2(W.storageRate.min + r() * (W.storageRate.max - W.storageRate.min)), movesWeek: moves, linesWeek: lines, moveRate: round2(W.moveRate.min + r() * (W.moveRate.max - W.moveRate.min)), lineRate: round2(W.lineRate.min + r() * (W.lineRate.max - W.lineRate.min)) };
}
/** Trabajo de una operación de almacenaje, en semanas de mozo (v6). */
export const workOf = (o: Pick<Offer, "movesWeek" | "linesWeek">) => (o.movesWeek ?? 0) / WAREHOUSE_V6.movesPerWorker + (o.linesWeek ?? 0) / WAREHOUSE_V6.linesPerWorker;
/** Lo que se factura por semana por la manipulación (v6). */
export const handlingRevenue = (o: Pick<Offer, "movesWeek" | "linesWeek" | "moveRate" | "lineRate">) => round2((o.movesWeek ?? 0) * (o.moveRate ?? 0) + (o.linesWeek ?? 0) * (o.lineRate ?? 0));

/**
 * Reputación (docs/simulador.md §11): es tu nivel de servicio de las últimas 8 semanas. Se aplica DESPUÉS del sorteo,
 * para que la semilla genere siempre la misma lista base. Umbrales: decisión de diseño, no estimada.
 * - Desde la semana 7, con un 95 % o más: los clientes pagan una prima por un proveedor fiable (RELIABILITY_PREMIUM).
 * - Por debajo del 90 %: una oferta menos y tarifas un 5 % más bajas; por debajo del 75 %: dos menos y un 10 % más bajas.
 */
export function reputationEffect(serviceLevel: number, week: number): { drop: number; factor: number; label: string } {
  if (serviceLevel < 75) return { drop: 2, factor: 0.9, label: "Mala: te llegan dos ofertas menos y un 10 % peor pagadas." };
  if (serviceLevel < 90) return { drop: 1, factor: 0.95, label: "Floja: te llega una oferta menos y un 5 % peor pagada." };
  if (week >= MARKET_GROWTH_FROM && serviceLevel >= RELIABILITY_PREMIUM.minServicePct) return { drop: 0, factor: RELIABILITY_PREMIUM.factor, label: `Excelente: los clientes pagan un ${Math.round((RELIABILITY_PREMIUM.factor - 1) * 100)} % más a un proveedor que cumple.` };
  if (week < MARKET_GROWTH_FROM) return { drop: 0, factor: 1, label: `Buena. Desde la semana ${MARKET_GROWTH_FROM}, con un ${RELIABILITY_PREMIUM.minServicePct} % o más, los clientes pagarán un ${Math.round((RELIABILITY_PREMIUM.factor - 1) * 100)} % más.` };
  return { drop: 0, factor: 1, label: `Correcta: con un ${RELIABILITY_PREMIUM.minServicePct} % o más, los clientes pagarían un ${Math.round((RELIABILITY_PREMIUM.factor - 1) * 100)} % más.` };
}

export function withReputation(offers: Offer[], serviceLevel: number, week = 1): Offer[] {
  const e = reputationEffect(serviceLevel, week);
  return scaleRates(offers.slice(0, Math.max(1, offers.length - e.drop)), e.factor);
}

/** Multiplica las tarifas de unas ofertas (reputación y crecimiento del mercado). */
export const scaleRates = (offers: Offer[], k: number): Offer[] => (k === 1 ? offers : offers.map((o) => ({ ...o, ratePerKm: o.ratePerKm && round2(o.ratePerKm * k), price: o.price && Math.round(o.price * k), palletRate: o.palletRate && round2(o.palletRate * k) })));

/**
 * Km que ocupa una oferta en cada semana de su duración (el servicio puntual cuenta la ida y el retorno en vacío). Un
 * viaje internacional ocupa días enteros de camión: cuenta como los km de reparto que se harían en esos días.
 */
export const kmOf = (o: Offer) => (o.kind === "distribucion" ? o.kmWeek! : o.kind === "puntual" ? 2 * o.kmOneWay! : o.kind === "internacional" ? o.days! * P.kmPerDay : 0);

/** Importe que se factura por semana si se presta entero el servicio. */
export const weeklyRevenue = (o: Offer) => (o.kind === "distribucion" ? round2(o.kmWeek! * o.ratePerKm!) : o.kind === "puntual" || o.kind === "internacional" ? o.price! : round2(o.pallets! * o.palletRate! + handlingRevenue(o)));
