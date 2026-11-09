import { round2 } from "../learning/money";
import type { Client, Offer, OfferKind } from "./model";
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

function hint(r: Rng, c: Client): string {
  if (c.profile === "puntual") return pick(r, ["Cliente con buen historial de pagos.", "Nuevo cliente, sin historial.", "Referencias de otros transportistas: paga a su vencimiento."]);
  return pick(r, ["Nuevo cliente, sin historial.", "Algún transportista comenta que a veces se retrasa en los pagos.", "Empresa conocida en su sector; historial de pagos desconocido."]);
}

function makeOffer(r: Rng, week: number, n: number, kind: OfferKind): Offer {
  const c = pick(r, CLIENTS);
  const base = { id: `s${week}-${n}`, week, kind, clientId: c.id, clientHint: hint(r, c), payWeeks: 4 };
  if (kind === "distribucion") return { ...base, kmWeek: intIn(r, 150, 600, 10), ratePerKm: round2(1.05 + r() * 0.5), weeks: intIn(r, 4, 8) };
  if (kind === "puntual") {
    const km = intIn(r, 150, 450, 10);
    return { ...base, kmOneWay: km, price: Math.round(km * (0.7 + r() * 2.0)), weeks: 1 };
  }
  // Fase 1: la tarifa de almacenaje incluye la manipulación (entradas, salidas, preparación), que se separará en la
  // fase 2. Con solo 1,50 €/palé/semana, sin cobrar la manipulación, la empresa perdería dinero aun llena (ver params.ts).
  return { ...base, pallets: intIn(r, 50, 250, 10), palletRate: round2(2.4 + r() * 1.0), weeks: intIn(r, 4, 10), payWeeks: r() < 0.5 ? 4 : 8 };
}

/**
 * Ofertas de una semana: entre 3 y 5. La semana 1 trae siempre una de cada tipo, para que se pueda empezar a trabajar.
 * Mismas semilla y semana → mismas ofertas, decida lo que decida el jugador antes.
 */
export function offersFor(seed: number, week: number, serviceLevel = 100): Offer[] {
  const r = stream(seed, week, "ofertas");
  const n = intIn(r, 3, 5);
  const kinds: OfferKind[] = week === 1 ? ["distribucion", "almacenaje", "puntual"] : [];
  while (kinds.length < n) kinds.push(pick(r, ["distribucion", "distribucion", "puntual", "puntual", "almacenaje"] as const));
  const all = kinds.map((k, i) => makeOffer(r, week, i + 1, k));
  return withReputation(all, serviceLevel);
}

/**
 * Reputación (docs/simulador.md §11): con un nivel de servicio bajo llegan menos ofertas y peor pagadas. Se aplica DESPUÉS
 * del sorteo, para que la semilla genere siempre la misma lista base. Umbrales: decisión de diseño, no estimada.
 */
export function withReputation(offers: Offer[], serviceLevel: number): Offer[] {
  const drop = serviceLevel < 75 ? 2 : serviceLevel < 90 ? 1 : 0;
  const k = serviceLevel < 75 ? 0.9 : serviceLevel < 90 ? 0.95 : 1;
  const kept = offers.slice(0, Math.max(1, offers.length - drop));
  if (k === 1) return kept;
  return kept.map((o) => ({ ...o, ratePerKm: o.ratePerKm && round2(o.ratePerKm * k), price: o.price && Math.round(o.price * k), palletRate: o.palletRate && round2(o.palletRate * k) }));
}

/** Km que ocupa una oferta en cada semana de su duración (el servicio puntual cuenta la ida y el retorno en vacío). */
export const kmOf = (o: Offer) => (o.kind === "distribucion" ? o.kmWeek! : o.kind === "puntual" ? 2 * o.kmOneWay! : 0);

/** Importe que se factura por semana si se presta entero el servicio. */
export const weeklyRevenue = (o: Offer) => (o.kind === "distribucion" ? round2(o.kmWeek! * o.ratePerKm!) : o.kind === "puntual" ? o.price! : round2(o.pallets! * o.palletRate!));
