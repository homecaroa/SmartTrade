import { round2 } from "../learning/money";
import type { Offer } from "./model";
import { INTERNATIONAL, P, WEEKS_PER_MONTH } from "./params";
import { intIn, pick, stream } from "./rng";

/**
 * Viajes internacionales por carretera (reglas v5; docs/simulador.md §17 octies). Un cliente de Valencia te encarga
 * llevar un camión completo a Francia o Portugal. Lo que cambia frente a un viaje nacional:
 * - Ocupa días enteros de camión, no kilómetros sueltos de reparto: en capacidad cuenta como `days × P.kmPerDay`.
 * - Además del gasóleo hay peajes extranjeros y dietas del conductor.
 * - El contrato se rige por el Convenio CMR (BOE-A-1974-753, art. 1): toma de carga y entrega en dos países distintos.
 *   La carta de porte CMR (arts. 4-6) sirve también como documento de control si lleva sus datos (Orden FOM/2861/2012,
 *   art. 2.2), y en cada vehículo va una copia certificada de la licencia comunitaria (Reglamento (CE) 1072/2009, art. 4).
 * - Dentro de la UE no hay aduana: el DUA sobra.
 * Cifras SIMULADAS en INTERNATIONAL (params.ts).
 */
export const isTrip = (kind: Offer["kind"]) => kind === "puntual" || kind === "internacional";

/** Días de camión: ida y vuelta a unos 600 km al día, más la carga y la descarga. */
export const tripDays = (kmOneWay: number) => Math.ceil((2 * kmOneWay) / INTERNATIONAL.kmPerDayLong) + INTERNATIONAL.loadDays;

/** Coste directo del viaje: gasóleo, mantenimiento y peajes españoles por km, peajes extranjeros y dietas. */
export function directCost(o: Pick<Offer, "kmOneWay" | "tolls" | "days">) {
  const fuel = round2(2 * o.kmOneWay! * P.variablePerKm);
  const extras = round2(o.tolls! + o.days! * INTERNATIONAL.dietPerDay);
  return { fuel, extras, total: round2(fuel + extras) };
}

/** Parte del conductor, el seguro y la amortización que corresponde a los días que el camión está fuera. */
export const fixedShare = (days: number) => round2(days * (P.fixedMonthly.conductor / WEEKS_PER_MONTH + P.fixedMonthly.seguro / WEEKS_PER_MONTH + P.amortizationWeek) / P.workDays);

/** Oferta internacional de la semana (como mucho una), de su propia secuencia: no altera las demás ofertas. */
export function internationalOffer(seed: number, week: number, version: number, clientId: string, clientHint: string): Offer | null {
  if (version < INTERNATIONAL.fromVersion || week < INTERNATIONAL.fromWeek) return null;
  const r = stream(seed, week, "internacional");
  if (r() >= INTERNATIONAL.chance) return null;
  const d = pick(r, INTERNATIONAL.destinations);
  const price = Math.round(d.km * (INTERNATIONAL.pricePerKmOneWay.min + r() * (INTERNATIONAL.pricePerKmOneWay.max - INTERNATIONAL.pricePerKmOneWay.min)));
  const backhaul = r() < INTERNATIONAL.backhaulChance ? { pallets: intIn(r, 10, 33), price: Math.round(d.km * (INTERNATIONAL.backhaulPerKm.min + r() * (INTERNATIONAL.backhaulPerKm.max - INTERNATIONAL.backhaulPerKm.min))) } : undefined;
  return { id: `s${week}-int`, week, kind: "internacional", clientId, clientHint, payWeeks: P.transportPayWeeks, weeks: 1, kmOneWay: d.km, price, days: tripDays(d.km), tolls: d.tolls, destination: { city: d.city, country: d.country }, ...(backhaul ? { backhaul } : {}) };
}
