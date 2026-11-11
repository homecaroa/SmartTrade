import { fnv1a } from "../learning/order";
import { clientOf, kmOf, weeklyRevenue } from "./market";
import type { Incident, Offer, SimState } from "./model";
import { payTermLabel } from "./params";

/**
 * Bandeja de correos (11/11/2026, petición del dueño: «más real, clientes que escriben»). SIN IA por ahora; la IA llegará
 * después y este módulo está pensado para ella:
 * - Cada correo lleva su FICHA (`facts`): los datos del juego que puede mencionar (precios, €/km, km, plazos, palés).
 *   Hoy el texto lo redactan plantillas a partir de la ficha; mañana se le pasará la misma ficha a la IA con la instrucción
 *   de no usar ningún otro dato. Una prueba comprueba que las cifras del texto salen de la ficha.
 * - Responder no es escribir: es una acción del juego (aceptar, negociar, decidir). Así la partida sigue siendo
 *   reproducible (misma semilla y mismas decisiones → mismo resultado) aunque un día redacte la IA.
 * - Es otra forma de ver lo que ya hay (ofertas, incidencias, cancelaciones): no cambia las reglas ni el guardado.
 * Personas, cargos y firmas son FICTICIOS, como las empresas.
 */
export type Lang = "es" | "en";
export type Tone = "cercano" | "formal" | "directo";
export interface Persona { name: string; role: string; roleEn: string; tone: Tone }

export const PERSONAS: Record<string, Persona> = {
  albufera: { name: "Marta Ferrer", role: "Jefa de logística", roleEn: "Logistics Manager", tone: "cercano" },
  mijares: { name: "Joan Puig", role: "Director de operaciones", roleEn: "Operations Director", tone: "directo" },
  ribera: { name: "Pilar Navarro", role: "Responsable de compras", roleEn: "Purchasing Manager", tone: "cercano" },
  hortanord: { name: "Vicent Soler", role: "Gerente", roleEn: "Managing Director", tone: "formal" },
  sagunto: { name: "Laura Gil", role: "Logística", roleEn: "Logistics", tone: "directo" },
  requena: { name: "Andrés Molina", role: "Departamento de exportación", roleEn: "Export Department", tone: "formal" },
  ontinyent: { name: "Carmen Ribes", role: "Administración", roleEn: "Administration", tone: "formal" },
  silla: { name: "Sergio Peña", role: "Operaciones", roleEn: "Operations", tone: "cercano" },
};

export type MailRef = { kind: "oferta"; offerId: string } | { kind: "incidencia"; incidentId: string } | { kind: "aviso" };
export interface Mail {
  id: string;
  week: number;
  lang: Lang;
  from: { name: string; role: string; company: string };
  subject: string;
  body: string[];
  /** Datos del juego que el correo puede usar: lo único que recibirá la IA cuando llegue. */
  facts: Record<string, string | number>;
  ref: MailRef;
}

/** Nombres en inglés de los destinos internacionales (los de params.ts están en español). */
const EN_PLACE: Record<string, string> = { Toulouse: "Toulouse", Marsella: "Marseille", Lyon: "Lyon", Oporto: "Porto", Francia: "France", Portugal: "Portugal" };
const en = (x: string) => EN_PLACE[x] ?? x;

const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const eurEn = (v: number) => `€${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: number) => v.toLocaleString("es-ES");
/** Variante de plantilla estable para un correo (no usa el azar del juego ni cambia nada de la partida). */
const variant = (key: string, n: number) => fnv1a(key) % n;

const greet = (tone: Tone, k: string) => (tone === "cercano" ? ["¡Hola!", "Buenos días,", "Hola, ¿qué tal?"] : tone === "formal" ? ["Estimados señores:", "Buenos días:"] : ["Buenas,", "Hola,"])[variant(k, tone === "cercano" ? 3 : 2)];
const bye = (tone: Tone) => (tone === "cercano" ? "Un abrazo," : tone === "formal" ? "Atentamente," : "Gracias,");

function offerFacts(o: Offer): Record<string, string | number> {
  const f: Record<string, string | number> = { tipo: o.kind, semanas: o.weeks, plazo_pago: payTermLabel(o.payWeeks) };
  if (o.kind === "distribucion") Object.assign(f, { km_semana: o.kmWeek!, eur_km: o.ratePerKm!, eur_semana: weeklyRevenue(o) });
  if (o.kind === "puntual" || o.kind === "internacional") Object.assign(f, { km_ida: o.kmOneWay!, precio: o.price!, km_recorridos: o.kind === "puntual" ? kmOf(o) : 2 * o.kmOneWay! });
  if (o.kind === "internacional") Object.assign(f, { destino: o.destination!.city, pais: o.destination!.country, destination: en(o.destination!.city), country: en(o.destination!.country), dias_camion: o.days! });
  if (o.backhaul) Object.assign(f, { retorno_pales: o.backhaul.pallets, retorno_precio: o.backhaul.price });
  if (o.kind === "almacenaje") Object.assign(f, { pales: o.pallets!, eur_pale_semana: o.palletRate!, ...(o.movesWeek !== undefined ? { movimientos: o.movesWeek, eur_movimiento: o.moveRate!, lineas: o.linesWeek!, eur_linea: o.lineRate! } : {}) });
  return f;
}

function offerMail(o: Offer): Mail {
  const c = clientOf(o.clientId), p = PERSONAS[o.clientId];
  const facts = offerFacts(o);
  const company = c.name;
  if (o.kind === "internacional") {
    const body = [
      "Dear Sir or Madam,",
      `We have a full truckload to be delivered to our customer in ${en(o.destination!.city)} (${en(o.destination!.country)}), ${num(o.kmOneWay!)} km from Valencia. Our budget for this shipment is ${eurEn(o.price!)}, all in.`,
      ...(o.backhaul ? [`Our customer could also load ${o.backhaul.pallets} pallets for the return trip, for ${eurEn(o.backhaul.price)} on top.`] : ["There is no return load from that area at the moment."]),
      `Payment at ${o.payWeeks / 4 * 30} days. Please confirm whether you can take it and send us the CMR details before loading.`,
      "Kind regards,",
    ];
    return { id: `m-${o.id}`, week: o.week, lang: "en", from: { name: p.name, role: p.roleEn, company }, subject: `Full truckload Valencia – ${en(o.destination!.city)}: quotation request`, body, facts, ref: { kind: "oferta", offerId: o.id } };
  }
  const g = greet(p.tone, o.id);
  let ask: string[];
  if (o.kind === "distribucion") ask = [`Buscamos transportista para nuestro reparto regional: unos ${num(o.kmWeek!)} km por semana, retornos incluidos, durante ${o.weeks} semanas.`, `Pagamos ${eur(o.ratePerKm!)}/km (${eur(weeklyRevenue(o))} a la semana), a ${payTermLabel(o.payWeeks)}.`];
  else if (o.kind === "puntual") ask = [`Necesitamos un viaje de ${num(o.kmOneWay!)} km de ida esta semana.`, o.backhaul ? `Pagamos ${eur(o.price!)} por el viaje y, si os interesa, a la vuelta podéis traer ${o.backhaul.pallets} palés nuestros por ${eur(o.backhaul.price)} más.` : `Pagamos ${eur(o.price!)} por el viaje; la vuelta sería en vacío.`, `Pago a ${payTermLabel(o.payWeeks)}.`];
  else ask = [`Necesitamos sitio para ${num(o.pallets!)} palés durante ${o.weeks} semanas.`, o.movesWeek !== undefined ? `Ofrecemos ${eur(o.palletRate!)} por palé y semana, más ${eur(o.moveRate!)} por movimiento (unos ${num(o.movesWeek)} a la semana) y ${eur(o.lineRate!)} por línea de pedido (unas ${num(o.linesWeek!)}).` : `Ofrecemos ${eur(o.palletRate!)} por palé y semana, manipulación incluida.`, `Pago a ${payTermLabel(o.payWeeks)}.`];
  const close = p.tone === "directo" ? "Necesito respuesta esta semana." : p.tone === "formal" ? "Quedamos a la espera de su respuesta." : "¿Os encaja? Dime algo esta semana, porfa.";
  const subject = o.kind === "distribucion" ? `Reparto regional: ${num(o.kmWeek!)} km/semana` : o.kind === "puntual" ? `Viaje de ${num(o.kmOneWay!)} km esta semana` : `Almacenaje de ${num(o.pallets!)} palés`;
  return { id: `m-${o.id}`, week: o.week, lang: "es", from: { name: p.name, role: p.role, company }, subject, body: [g, ...ask, close, bye(p.tone)], facts, ref: { kind: "oferta", offerId: o.id } };
}

/** Correo de una incidencia pendiente: quién la cuenta y con qué datos (los mismos que ya muestra la incidencia). */
function incidentMail(s: SimState, inc: Incident): Mail {
  const facts: Record<string, string | number> = { ...inc.data };
  const client = typeof inc.data.client === "string" ? inc.data.client : null;
  const from = inc.kind === "averia" ? { name: "Paco Martínez", role: "Conductor", company: "Transportes y Almacenes del Turia (ficticia)" }
    : inc.kind === "mora" ? { name: "Contabilidad", role: "Administración interna", company: "Transportes y Almacenes del Turia (ficticia)" }
    : client ? { name: PERSONAS[client].name, role: PERSONAS[client].role, company: clientOf(client).name } : { name: "Aviso", role: "", company: "" };
  const body = inc.kind === "averia" ? ["Jefe:", inc.prompt, "Dime qué hago con los clientes de esta semana."]
    : inc.kind === "mora" ? ["Aviso de impago:", inc.prompt, "¿Cómo quieres que lo gestionemos?"]
    : [greet(client ? PERSONAS[client].tone : "formal", inc.id), inc.prompt, "Espero su respuesta."];
  return { id: `m-${inc.id}`, week: s.week, lang: "es", from, subject: inc.title, body, facts, ref: { kind: "incidencia", incidentId: inc.id } };
}

/** Avisos de clientes que dejan de trabajar contigo desde esta semana (cancelaciones decididas al cerrar la anterior). */
function cancellationMails(s: SimState): Mail[] {
  return s.contracts.filter((c) => c.cancelledWeek === s.week).map((c) => {
    const p = PERSONAS[c.clientId];
    return { id: `m-cancel-${c.id}`, week: s.week, lang: "es" as const, from: { name: p.name, role: p.role, company: clientOf(c.clientId).name }, subject: "Cancelación del servicio",
      body: [greet(p.tone, c.id), "Lamentamos comunicaros que, tras lo ocurrido la semana pasada, damos por terminado nuestro acuerdo desde esta semana.", bye(p.tone)],
      facts: { contrato: c.id, semana: s.week }, ref: { kind: "aviso" as const } };
  });
}

/** Correos de la semana en curso: incidencia pendiente primero, después cancelaciones y ofertas. */
export function inboxFor(s: SimState): Mail[] {
  if (s.status === "fin" || s.status === "quiebra") return [];
  return [...(s.pending ? [incidentMail(s, s.pending)] : []), ...cancellationMails(s), ...s.offers.map(offerMail)];
}
