import { round2 } from "../../learning/money";
import { intIn, stream } from "../rng";
import { capacityKm, charge, learn, palletCapacity, registerClients, transportKm, unlock, variablePerKm } from "./helpers";
import type { CampaignState, Decision, Grade, Option } from "./model";
import { LEAD } from "./leads";
import { SPOT, SUB_RATE } from "./params";
import { QUIZ } from "./quiz";
import { has } from "./upgrades";

/**
 * Ofertas de trabajo con las reglas 2 (24/11/2026; docs/simulador-campana.md §4 quater). Problema medido con las
 * reglas 1: la mitad de las semanas solo traían «aceptar o rechazar» y el 84 % de esas decisiones eran ofertas que no
 * cabían, así que la única respuesta era rechazar.
 *
 * - Una oferta que no cabe y no tiene salida rentable NO interrumpe: va al informe de la semana («pasó de largo») con
 *   lo que no facturaste.
 * - Las que aparecen traen opciones: si caben, aceptar, pedir más o rechazar; si no caben pero subcontratar deja
 *   margen, subcontratar (respondes tú: Ley 15/2009, art. 6.1), proponer la semana siguiente o rechazar.
 * - La mitad llegan con un caso de documentación o trámites, con la norma leída en el BOE.
 * - Encargos sueltos de almacenaje (si tienes nave con sitio) y preguntas de los módulos en las semanas tranquilas.
 *
 * Probabilidades, suplementos e importes de sanciones y reclamaciones: SIMULADOS. Las normas citadas, comprobadas en
 * el BOE (fechas en el Manual y en docs/simulador.md §17 quater y septies).
 */
export const OFFERS = {
  /** Subcontratar un urgente solo se ofrece si deja al menos esto por km. */
  subMargin: 0.05,
  askMore: 0.1, counter: 0.05, laterChance: 0.5, caseChance: 0.5,
  inspection: { chance: 0.3, fine: 400 }, damage: { chance: 0.2, cost: 350 }, stowage: { chance: 0.25, cost: 500, fee: 40 },
  valueFee: 0.08, missingPallets: { chance: 0.3, cost: 300 },
  store: { chance: 0.35, pallets: 40, weeks: 3, rate: 2.6 },
  quizChance: 0.6,
};
const eur = (v: number) => `${Math.round(v).toLocaleString("es-ES")} €`;
const r2 = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const freeKm = (s: CampaignState) => capacityKm(s.company) - transportKm(s.company, s.abs) - Number(s.data.spotKm ?? 0);
const pass = (s: CampaignState, revenue: number, lead = false) => { s.data.passedN = Number(s.data.passedN ?? 0) + 1; s.data.passedRev = round2(Number(s.data.passedRev ?? 0) + revenue); if (lead) s.data.passedLeads = Number(s.data.passedLeads ?? 0) + 1; };

type SpotCase = "documentos" | "valor" | "estiba";
const SPOT_CASES: { id: SpotCase; from: number }[] = [{ id: "documentos", from: 0 }, { id: "estiba", from: 0 }, { id: "valor", from: 1 }];
type LeadCase = "pago90" | "combustible";

function spotCard(s: CampaignState, i: number, km: number, rate: number): Decision | null {
  const free = freeKm(s), fits = km <= free;
  const c = stream(s.seed, s.abs, `campana-oferta-${i}`);
  const limit = round2(c() * 0.2), later = c() < OFFERS.laterChance ? 1 : 0, hit = round2(c());
  const money = km * rate, margin = round2(km * (rate - variablePerKm(s.company)));
  const base = { id: `urgente-${s.abs}-${i + 1}`, key: false, data: { km, rate, limit, later, hit } as Record<string, string | number> };
  if (!fits) {
    if (rate < SUB_RATE + OFFERS.subMargin) { pass(s, money); return null; }
    return { ...base, title: "Encargo urgente que no te cabe", data: { ...base.data, mode: "lleno" },
      prompt: `Un cliente necesita ${km} km esta semana a ${r2(rate)} €/km (${eur(money)}). Solo te quedan ${Math.max(0, free).toLocaleString("es-ES")} km libres.`,
      hint: `Un subcontratista te cobra ${r2(SUB_RATE)} €/km. ¿Te deja margen? Si algo sale mal en el viaje de tu subcontratista, ¿a quién reclama el cliente?`,
      options: [{ id: "sub", label: `Subcontratarlo: te quedan ${eur(km * (rate - SUB_RATE))}` }, { id: "semana", label: "Proponerle hacerlo la semana que viene" }, { id: "rechazar", label: "Rechazarlo" }] };
  }
  const cr = c();
  const avail = SPOT_CASES.filter((x) => x.from <= s.level);
  const kase = cr < OFFERS.caseChance ? avail[Math.floor(c() * avail.length)].id : null;
  const head = `Un cliente nuevo necesita ${km} km esta semana a ${r2(rate)} €/km (${eur(money)}). Te quedan unos ${free.toLocaleString("es-ES")} km libres.`;
  if (kase === "documentos") return { ...base, title: "Encargo urgente: «sal ya, los papeles luego»", data: { ...base.data, mode: kase },
    prompt: `${head} El cargador tiene prisa y no ha preparado ningún documento del envío.`,
    hint: "¿Qué documento tiene que ir a bordo en un transporte público de mercancías por carretera? ¿Lo puede sustituir la carta de porte?",
    options: [{ id: "doc", label: "Aceptarlo y rellenar con él el documento de control antes de salir" }, { id: "sin", label: "Aceptarlo y salir sin documentos" }, { id: "rechazar", label: "Rechazarlo" }] };
  if (kase === "estiba") return { ...base, title: "Encargo urgente: «cárgalo tú»", data: { ...base.data, mode: kase },
    prompt: `${head} No tienen a nadie en el muelle y te piden que cargues y estibes tú la mercancía.`,
    hint: "¿De quién son la carga y la estiba si no se pacta otra cosa? ¿Y si el cargador estiba siguiendo tus instrucciones?",
    options: [{ id: "pacto", label: `Pactar por escrito que lo haces tú, con un suplemento de ${OFFERS.stowage.fee} €` }, { id: "indicar", label: "Decirles cómo colocarla y salir sin dejar nada escrito" }, { id: "ellos", label: "Esperar a que carguen ellos y revisarlo antes de salir" }, { id: "rechazar", label: "Rechazarlo" }] };
  if (kase === "valor") return { ...base, title: "Encargo urgente: mercancía de mucho valor", data: { ...base.data, mode: kase },
    prompt: `${head} Son ordenadores: unos 40.000 € de mercancía en tu furgoneta.`,
    hint: "Si se dañan, ¿respondes de todo su valor o hasta un límite? ¿Cómo se sube ese límite?",
    options: [{ id: "declarar", label: `Aceptarlo con declaración de valor en la carta de porte (+${OFFERS.valueFee * 100} % de precio)` }, { id: "normal", label: "Aceptarlo sin más" }, { id: "rechazar", label: "Rechazarlo" }] };
  return { ...base, title: "Encargo urgente", data: { ...base.data, mode: "normal" }, prompt: head,
    hint: `Cada km aporta ${r2(rate - variablePerKm(s.company))} € después del gasóleo (${eur(margin)} en total). Lo urgente se paga: ¿hay margen para pedir más?`,
    options: [{ id: "aceptar", label: "Aceptarlo a su precio" }, { id: "mas", label: `Pedir un ${OFFERS.askMore * 100} % más (${eur(money * (1 + OFFERS.askMore))})` }, { id: "rechazar", label: "Rechazarlo" }] };
}

/** Encargos urgentes con las reglas 2 (mismo sorteo de cantidad, km y precio que las reglas 1). */
export function spotDecisionsV2(s: CampaignState): Decision[] {
  const r = stream(s.seed, s.abs, "campana-urgentes");
  const x = r();
  let n = x < SPOT.count[0] ? 0 : x < SPOT.count[0] + SPOT.count[1] ? 1 : 2;
  if (has(s.company, "web")) n += r() < 0.6 ? 1 : 0;
  const out: Decision[] = [];
  for (let i = 0; i < n; i++) {
    const km = intIn(r, SPOT.km.min, SPOT.km.max, 10), rate = round2(SPOT.rate.min + r() * (SPOT.rate.max - SPOT.rate.min));
    const d = spotCard(s, i, km, rate);
    if (d) out.push(d);
  }
  const st = storeCard(s);
  if (st) out.push(st);
  return out;
}

const takeSpot = (s: CampaignState, km: number, revenue: number) => { s.data.spotKm = Number(s.data.spotKm ?? 0) + km; s.data.spotRev = round2(Number(s.data.spotRev ?? 0) + revenue); };
const answer = (d: Decision, op: string) => d.options.find((o) => o.id === op)!.label;

export function decideSpotV2(s: CampaignState, d: Decision, op: string) {
  const km = Number(d.data!.km), rate = Number(d.data!.rate), hit = Number(d.data!.hit), mode = String(d.data!.mode);
  const fits = km <= freeKm(s);
  const say = (grade: Grade, feedback: string, competences = ["0622-RA2"]) => learn(s, { id: d.id, what: d.title, answer: answer(d, op), grade, feedback, competences, key: false });
  const margin = (r: number) => eur(km * (r - variablePerKm(s.company)));
  unlock(s, "capacidad");
  if (op === "rechazar") { say(mode === "lleno" ? "razonable" : fits ? "razonable" : "correcta", mode === "lleno" ? `Podías haberlo subcontratado ganando ${eur(km * (rate - SUB_RATE))}, respondiendo tú del servicio.` : fits ? `Te cabía: dejas pasar ${margin(rate)} de margen (coste de oportunidad).` : "Ya no te cabía: bien visto."); return; }
  if (mode === "lleno") {
    if (op === "sub") { s.data.subSpotRev = round2(Number(s.data.subSpotRev ?? 0) + km * rate); charge(s, "Subcontratista para un urgente", km * SUB_RATE); unlock(s, "subcontratar");
      say("correcta", `Ganas ${eur(km * (rate - SUB_RATE))} sin ocupar tu furgoneta. Pero el cliente contrató contigo: respondes ante él de todo el transporte aunque lo haga otro (Ley 15/2009, art. 6.1).`, ["0622-RA2", "0622-RA3"]); return; }
    // semana
    if (Number(d.data!.later)) { s.data.nextSpotKm = Number(s.data.nextSpotKm ?? 0) + km; s.data.nextSpotRev = round2(Number(s.data.nextSpotRev ?? 0) + km * rate);
      say("correcta", "Acepta: lo haces la semana que viene con tus medios. Negociar la fecha es otra forma de usar la capacidad, cuando al cliente le vale."); }
    else say("razonable", "No puede esperar: era urgente de verdad y se va con otro. Proponerlo no costaba nada, pero había una opción con margen seguro (subcontratar).");
    return;
  }
  if (!fits && op !== "rechazar") { takeSpot(s, km, km * rate); say("grave", "Ya no te cabía (has aceptado otras cosas esta semana): alguien se quedará sin servicio. Fallar baja tu reputación y cuesta una penalización."); return; }
  if (mode === "normal") {
    if (op === "aceptar") { takeSpot(s, km, km * rate); say("correcta", `Te cabía y aporta ${margin(rate)} de margen. La capacidad libre solo vale si la usas.`); return; }
    const ok = Number(d.data!.limit) >= OFFERS.askMore;
    if (ok) takeSpot(s, km, km * rate * (1 + OFFERS.askMore));
    say(rate < 1.15 ? "correcta" : "razonable", `${ok ? `Acepta: ${margin(rate * (1 + OFFERS.askMore))} de margen en vez de ${margin(rate)}.` : "No acepta y se va con otro."} ${rate < 1.15 ? "Lo urgente vale más: a este precio había margen para pedir." : `Ya pagaba ${r2(rate)} €/km: pedir más tenía más riesgo de perderlo.`}`, ["0622-RA2", "0824-RA3"]);
    return;
  }
  if (mode === "documentos") {
    if (op === "doc") { takeSpot(s, km, km * rate); unlock(s, "documento-control");
      say("correcta", "Correcto: en el transporte público de mercancías el documento de control del envío va a bordo, y una carta de porte con sus datos sirve como tal (Orden FOM/2861/2012, arts. 1, 2.2 y 3; Ley 15/2009, art. 10). Cinco minutos que evitan una sanción.", ["0622-RA5"]); return; }
    takeSpot(s, km, km * rate); unlock(s, "documento-control");
    const caught = hit < OFFERS.inspection.chance;
    if (caught) charge(s, "Sanción por circular sin documento de control (importe simulado)", OFFERS.inspection.fine);
    say("grave", `${caught ? `Te paran en una inspección: ${eur(OFFERS.inspection.fine)} de sanción (importe simulado). ` : "Esta vez no te paran, pero "}el documento de control es obligatorio a bordo (Orden FOM/2861/2012); sin él tampoco puedes probar qué te entregaron.`, ["0622-RA5"]); return;
  }
  if (mode === "estiba") {
    unlock(s, "estiba");
    if (op === "pacto") { takeSpot(s, km, km * rate + OFFERS.stowage.fee); say("correcta", "Correcto: la carga y la estiba son del cargador salvo que se pacte por escrito que las haga el transportista, con un suplemento (Ley 15/2009, art. 20.1). Así queda claro quién responde.", ["0622-RA4"]); return; }
    if (op === "ellos") { takeSpot(s, km, km * rate); say("correcta", "Correcto: es lo que dice la ley si no se pacta otra cosa (art. 20.1). Revisarla antes de salir evita daños en ruta.", ["0622-RA4"]); return; }
    takeSpot(s, km, km * rate);
    const bad = hit < OFFERS.stowage.chance;
    if (bad) charge(s, "Daños por mala estiba siguiendo tus instrucciones (importe simulado)", OFFERS.stowage.cost);
    say("grave", `Si el cargador estiba siguiendo tus instrucciones, los daños por mala estiba son tuyos (Ley 15/2009, art. 20.2)${bad ? `: se mueve un palé y pagas ${eur(OFFERS.stowage.cost)} (simulado)` : ""}. Y sin nada escrito, no cobras ese trabajo.`, ["0622-RA4"]); return;
  }
  // valor
  unlock(s, "declaracion-valor");
  if (op === "declarar") { takeSpot(s, km, km * rate * (1 + OFFERS.valueFee)); say("correcta", "Correcto: el transportista responde hasta un límite legal por kilo; por encima, solo si se declaró el valor en la carta de porte (Ley 15/2009, art. 61). El cliente queda cubierto y tú cobras más por asumir más riesgo.", ["0622-RA4", "0622-RA7"]); return; }
  takeSpot(s, km, km * rate);
  const dmg = hit < OFFERS.damage.chance;
  if (dmg) charge(s, "Reclamación por daños de un urgente (hasta el límite legal; importe simulado)", OFFERS.damage.cost);
  say("razonable", `Sin declaración de valor respondes solo hasta el límite legal (art. 61): ${dmg ? `se daña un equipo y pagas ${eur(OFFERS.damage.cost)} (simulado), pero el cliente pierde mucho más y no volverá` : "esta vez llega bien, pero si se daña, el cliente se queda sin cubrir casi todo su valor y no vuelve"}.`, ["0622-RA4", "0622-RA7"]);
}

/** Clientes fijos con las reglas 2: mismos sorteos que las reglas 1; si no caben, pasan de largo. */
export function leadDecisionsV2(s: CampaignState, NAMES: string[]): Decision[] {
  const r = stream(s.seed, s.abs, "campana-clientes");
  if (r() >= LEAD.chance * (s.company.reputation.fiabilidad >= 70 ? 1 : 0.5)) return [];
  const i = Math.floor(r() * NAMES.length), id = `nuevo-${s.abs}`;
  registerClients({ [id]: NAMES[i] });
  const km = intIn(r, LEAD.km.min, LEAD.km.max, 10), rate = round2(LEAD.rate.min + r() * (LEAD.rate.max - LEAD.rate.min));
  const free = freeKm(s);
  if (free < km) { pass(s, km * rate, true); return []; }
  const c = stream(s.seed, s.abs, "campana-cliente-caso");
  const limit = round2(c() * 0.12), kc = c();
  const kase: LeadCase | null = s.level >= 1 && kc < OFFERS.caseChance ? (c() < 0.5 ? "pago90" : "combustible") : null;
  const head = `${NAMES[i]} te propone un reparto fijo de ${km} km a la semana a ${r2(rate)} €/km (${eur(km * rate)} a la semana). Te quedan unos ${free.toLocaleString("es-ES")} km libres.`;
  const base = { id: `cliente-${s.abs}`, key: false, data: { km, rate, client: id, limit, mode: kase ?? "normal" } };
  if (kase === "pago90") return [{ ...base, title: "Un cliente fijo que quiere pagar a 90 días", prompt: `${head} Pero quiere pagar a 90 días.`, hint: "¿Cuánto puede tardar en pagar un cargador en el transporte por carretera? ¿Y por pacto entre empresas?",
    options: [{ id: "30", label: "Aceptar el cliente y decirle que el plazo es de 30 días" }, { id: "90", label: "Aceptar los 90 días" }, { id: "rechazar", label: "Rechazarlo" }] }];
  if (kase === "combustible") return [{ ...base, title: "Un cliente fijo que quiere el precio cerrado", prompt: `${head} Su contrato dice: «precio cerrado durante un año, sin revisión por el precio del gasóleo».`, hint: "¿Se puede renunciar por contrato a la revisión del precio por el combustible?",
    options: [{ id: "aviso", label: "Aceptar y avisarle de que la revisión por gasóleo de la ley se aplica igualmente" }, { id: "renuncia", label: "Aceptar y renunciar a revisar el precio" }, { id: "rechazar", label: "Rechazarlo por esa cláusula" }] }];
  return [{ ...base, title: "Un cliente nuevo quiere trabajar contigo", prompt: `${head} Cobro a 30 días.`, hint: "Un cliente fijo bien pagado es lo que paga la plantilla. ¿Te cabe sin fallar a los que ya tienes? ¿Hay margen para negociar?",
    options: [{ id: "aceptar", label: "Aceptarlo" }, { id: "contra", label: `Hacer una contrapropuesta: +${OFFERS.counter * 100} % (${r2(rate * (1 + OFFERS.counter))} €/km)` }, { id: "rechazar", label: "Rechazarlo" }] }];
}

export function decideLeadV2(s: CampaignState, d: Decision, op: string) {
  const km = Number(d.data!.km), rate = Number(d.data!.rate), client = String(d.data!.client), mode = String(d.data!.mode);
  const fits = freeKm(s) >= km;
  const add = (r: number, payWeeks = 4) => s.company.deals.push({ id: `l-${client}`, client, kind: "transporte", km, rate: round2(r), payWeeks, fromAbs: s.abs, missed: 0 });
  const say = (grade: Grade, feedback: string, competences = ["0622-RA2"]) => learn(s, { id: d.id, what: d.title, answer: answer(d, op), grade, feedback, competences, key: false });
  const weekly = (r: number) => eur(km * (r - variablePerKm(s.company)));
  if (op === "rechazar") { say(mode === "combustible" ? "razonable" : fits ? "razonable" : "correcta", mode === "combustible" ? "No hacía falta perderlo: esa cláusula es nula y la revisión se aplica igualmente (Ley 15/2009, art. 38.3)." : fits ? `Te cabía y aportaba ${weekly(rate)} a la semana: capacidad que pagas y no usas.` : "Ya no te cabía: bien.", mode === "combustible" ? ["0622-RA3"] : undefined); return; }
  if (!fits) { add(rate); say("grave", "Ya no te cabía: fallarás a alguien cada semana hasta que se vaya."); return; }
  if (mode === "pago90") {
    unlock(s, "plazos-legales");
    if (op === "30") { add(rate); say("correcta", "Correcto: en el transporte por carretera el cargador entra en mora a los 30 días (Ley 15/2009, art. 41) y entre empresas el plazo pactado nunca puede pasar de 60 (Ley 3/2004, art. 4.3). 90 días es un plazo que la ley no permite.", ["0622-RA3", "0623-RA5"]); return; }
    add(rate, 13); say("grave", "Aceptas un plazo ilegal (Ley 3/2004, art. 4.3: como mucho 60 días por pacto; Ley 15/2009, art. 41: mora a los 30 en el transporte) y financias tú a tu cliente tres meses: tu caja lo notará.", ["0622-RA3", "0623-RA5"]); return;
  }
  if (mode === "combustible") {
    add(rate);
    say(op === "aviso" ? "correcta" : "grave", op === "aviso" ? "Correcto: el precio se revisa automáticamente si el gasóleo varía un 5 % o más, y el pacto en contra es nulo (Ley 15/2009, art. 38). Avisarlo desde el principio evita discusiones." : "Esa renuncia no vale: la revisión por combustible es obligatoria y el pacto en contra es nulo (Ley 15/2009, art. 38.3). Firmar algo que crees que te obliga te deja sin argumentos cuando suba el gasóleo.", ["0622-RA3"]); return;
  }
  if (op === "aceptar") { add(rate); say("correcta", `Aporta ${weekly(rate)} a la semana después del gasóleo: es lo que hace rentable tener más capacidad.`); return; }
  const ok = Number(d.data!.limit) >= OFFERS.counter;
  if (ok) add(rate * (1 + OFFERS.counter));
  say(ok ? "correcta" : "razonable", ok ? `Acepta: ${weekly(rate * (1 + OFFERS.counter))} a la semana en vez de ${weekly(rate)}. En un contrato fijo, cada céntimo se repite cada semana.` : "No acepta y se queda con su transportista actual. Negociar tiene riesgo: compénsalo con lo que ganarías si sale bien.", ["0622-RA2", "0824-RA3"]);
}

/** Palés libres en todas las semanas de un encargo suelto, contando lo firmado que aún no ha empezado. */
export function storeRoom(s: CampaignState): number {
  const c = s.company;
  return Math.min(...Array.from({ length: OFFERS.store.weeks }, (_, k) => s.abs + k).map((w) => palletCapacity(c, w) - c.deals.filter((d) => d.kind === "almacen" && !d.external && !d.ended && d.fromAbs <= w && (d.toAbs === undefined || w <= d.toAbs)).reduce((a, d) => a + d.pallets!, 0)));
}

/** Encargo suelto de almacenaje (reglas 2): palés unas semanas, si tu nave tiene sitio. */
function storeCard(s: CampaignState): Decision | null {
  const c = s.company;
  if (!c.facility || s.abs < c.facility.readyAbs) return null;
  const p = OFFERS.store;
  // Sitio libre en TODAS las semanas del encargo, contando lo ya firmado que aún no ha empezado (si no, el encargo
  // suelto echaba al cliente fijo: lo destapó el calibrado del 24/11/2026).
  const room = storeRoom(s);
  const r = stream(s.seed, s.abs, "campana-almacen-suelto");
  if (r() >= OFFERS.store.chance) return null;
  const hit = round2(r());
  if (room < p.pallets) { pass(s, p.pallets * p.rate * p.weeks); return null; }
  return { id: `almacen-${s.abs}`, key: false, title: "Guardar palés unas semanas", data: { hit },
    prompt: `Una importadora necesita guardar ${p.pallets} palés ${p.weeks} semanas a ${r2(p.rate)} € por palé y semana (${eur(p.pallets * p.rate * p.weeks)} en total). Te caben: tienes ${room} palés libres.`,
    hint: "Cuando entra mercancía en tu almacén, ¿qué documento prueba cuánta entró y en qué estado?",
    options: [{ id: "albaran", label: "Aceptarlo con albarán de entrada: recuento y estado firmados al recibir" }, { id: "sin", label: "Aceptarlo y descargar sin más papeles" }, { id: "rechazar", label: "Rechazarlo" }] };
}

export function decideStore(s: CampaignState, d: Decision, op: string) {
  const p = OFFERS.store;
  const say = (grade: Grade, feedback: string) => learn(s, { id: d.id, what: d.title, answer: answer(d, op), grade, feedback, competences: ["0625-RA2", "0625-RA4"], key: false });
  unlock(s, "albaran");
  // El sitio se comprueba al decidir: otra decisión de esta semana puede haberlo ocupado.
  const fits = storeRoom(s) >= p.pallets;
  if (op === "rechazar") { say(fits ? "razonable" : "correcta", fits ? `Tenías sitio: dejas pasar ${eur(p.pallets * p.rate * p.weeks)} por espacio que ya pagas.` : "Ya no te cabía (has comprometido ese espacio esta semana): bien visto."); return; }
  if (!fits) { s.company.deals.push({ id: `l-almacen-${s.abs}`, client: "urgentes", kind: "almacen", pallets: p.pallets, palletRate: p.rate, payWeeks: 4, fromAbs: s.abs, toAbs: s.abs + p.weeks - 1, missed: 0 });
    say("grave", "Ya no te cabía: has comprometido ese espacio esta semana. Los palés de tus clientes no tendrán sitio, y el que no quepa dos semanas seguidas se lleva su mercancía."); return; }
  s.company.deals.push({ id: `l-almacen-${s.abs}`, client: "urgentes", kind: "almacen", pallets: p.pallets, palletRate: p.rate, payWeeks: 4, fromAbs: s.abs, toAbs: s.abs + p.weeks - 1, missed: 0 });
  if (op === "albaran") { say("correcta", "Correcto: el albarán de entrada con recuento y estado, firmado al recibir, es lo que prueba qué entró en tu almacén. Es buena práctica de almacén (no se ha comprobado una obligación legal concreta)."); return; }
  const lost = Number(d.data!.hit) < OFFERS.missingPallets.chance;
  if (lost) charge(s, "Reclamación de palés sin albarán de entrada (importe simulado)", OFFERS.missingPallets.cost);
  say("grave", `${lost ? `Al retirar, el cliente dice que faltan 2 palés y no puedes probar cuántos entraron: pagas ${eur(OFFERS.missingPallets.cost)} (simulado).` : "Esta vez cuadra, pero"} sin albarán de entrada no puedes probar qué te entregaron.`);
}

/** Pregunta de los módulos en una semana tranquila (reglas 2): una por semana como mucho, sin repetir. */
export function quizDecision(s: CampaignState, pending: Decision[]): Decision | null {
  if (pending.some((d) => d.key) || pending.length > 1) return null;
  const r = stream(s.seed, s.abs, "campana-pregunta");
  if (r() >= OFFERS.quizChance) return null;
  const asked = new Set(s.learning.filter((l) => l.id.startsWith("pregunta-")).map((l) => l.what));
  const pool = QUIZ.filter((q) => q.from <= s.level && !asked.has(q.topic));
  if (!pool.length) return null;
  const q = pool[Math.floor(r() * pool.length)];
  return { id: `pregunta-${s.abs}`, key: false, title: `Pregunta del oficio: ${q.topic}`, prompt: q.prompt, hint: q.hint, data: { q: q.id }, options: q.options.map((o): Option => ({ id: o.id, label: o.label })) };
}

export function decideQuiz(s: CampaignState, d: Decision, op: string) {
  const q = QUIZ.find((x) => x.id === d.data!.q)!;
  const o = q.options.find((x) => x.id === op)!;
  learn(s, { id: d.id, what: q.topic, answer: o.label, grade: o.grade, feedback: o.feedback, competences: q.competences, key: false });
  if (q.concept) unlock(s, q.concept);
}
