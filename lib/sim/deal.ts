import { round2 } from "../learning/money";
import type { Grade, Offer, OfferKind } from "./model";
import { intIn, stream } from "./rng";

/**
 * Negociación y documentación de cada operación (petición del dueño, 09/11/2026: «negociar cada contrato, proponer yo
 * condiciones; cada operación con su documentación»). Reglas puras y deterministas.
 *
 * NEGOCIACIÓN. Cada cliente tiene un límite oculto, fijado por la semilla y propio de cada oferta: hasta cuánto pagaría
 * por encima de su tarifa (0-18 %) y cuántas semanas como máximo contrataría. Tu propuesta:
 * - dentro del límite → acepta;
 * - algo por encima (hasta un 4 % más) → contraoferta con lo máximo que paga (2 rondas como mucho);
 * - muy por encima → se va con otro transportista y pierdes la oferta.
 * En almacenaje puedes pedir cobrar a 30 días en lugar de 60: el cliente lo compensa pagando algo menos (−4 %). En el
 * transporte el plazo no se negocia: quien paga entra en mora a los 30 días (Ley 15/2009, art. 41). Los porcentajes
 * son decisiones de diseño, no mediciones del mercado.
 */
export interface Terms { rate: number; weeks: number; payWeeks: number }
export type DealReply = { kind: "acepta" | "contraoferta" | "rechaza"; terms: Terms; message: string };

export const MAX_ROUNDS = 2;
export const NEGOTIATION = { maxPremium: 0.18, walkAway: 1.04, shortPayDiscount: 0.96, maxExtraWeeks: 4, maxShorterWeeks: 2 };

/** Viaje con precio cerrado (puntual o internacional): se negocia el precio, no la duración. */
const trip = (kind: OfferKind) => kind === "puntual" || kind === "internacional";
export const rateOf = (o: Pick<Offer, "kind" | "ratePerKm" | "price" | "palletRate">) => (o.kind === "distribucion" ? o.ratePerKm! : trip(o.kind) ? o.price! : o.palletRate!);
export const termsOf = (o: Offer): Terms => ({ rate: rateOf(o), weeks: o.weeks, payWeeks: o.payWeeks });
export const originalTerms = (o: Offer): Terms => o.original ?? termsOf(o);
export const roundRate = (kind: OfferKind, v: number) => (trip(kind) ? Math.round(v) : round2(v));

export function withTerms(o: Offer, t: Terms): Offer {
  const rate = roundRate(o.kind, t.rate);
  return { ...o, ratePerKm: o.kind === "distribucion" ? rate : o.ratePerKm, price: trip(o.kind) ? rate : o.price, palletRate: o.kind === "almacenaje" ? rate : o.palletRate, weeks: trip(o.kind) ? 1 : t.weeks, payWeeks: t.payWeeks };
}

/** Límite oculto del cliente para esta oferta: misma semilla y oferta → mismo límite. */
export function clientLimits(seed: number, o: Offer) {
  const r = stream(seed, o.week, `negociacion-${o.id}`);
  const base = originalTerms(o);
  return { maxFactor: 1 + round2(r() * NEGOTIATION.maxPremium), maxWeeks: base.weeks + intIn(r, 0, NEGOTIATION.maxExtraWeeks) };
}

/** Valida una propuesta: lo que no tiene sentido o no es legal no se puede proponer. */
export function validateProposal(o: Offer, p: Terms): string | null {
  const base = originalTerms(o);
  if (!(p.rate > 0)) return "Indica una tarifa mayor que cero.";
  if (o.kind !== "almacenaje" && p.payWeeks !== base.payWeeks) return "En el transporte el plazo de pago no se negocia: quien paga entra en mora a los 30 días (Ley 15/2009, art. 41).";
  if (o.kind === "almacenaje" && ![4, 8].includes(p.payWeeks)) return "El plazo de pago puede ser de 30 o 60 días; nunca más de 60 (Ley 3/2004, art. 4).";
  if (!trip(o.kind) && (p.weeks < Math.max(1, base.weeks - NEGOTIATION.maxShorterWeeks) || p.weeks > 26)) return `La duración debe estar entre ${Math.max(1, base.weeks - NEGOTIATION.maxShorterWeeks)} y 26 semanas.`;
  return null;
}

export function respond(seed: number, o: Offer, p: Terms): DealReply {
  const base = originalTerms(o);
  const lim = clientLimits(seed, o);
  const ceiling = lim.maxFactor * (o.kind === "almacenaje" && p.payWeeks < base.payWeeks ? NEGOTIATION.shortPayDiscount : 1);
  const f = p.rate / base.rate;
  const weeksOk = trip(o.kind) || p.weeks <= lim.maxWeeks;
  if (f > ceiling * NEGOTIATION.walkAway) return { kind: "rechaza", terms: p, message: "Tu precio está muy por encima de lo que puede pagar: se va con otro transportista." };
  if (f <= ceiling && weeksOk) return { kind: "acepta", terms: p, message: "Acepta tus condiciones." };
  if ((o.round ?? 0) >= MAX_ROUNDS) return { kind: "rechaza", terms: p, message: "Después de dos rondas no llegáis a un acuerdo: lo contrata con otro." };
  const counter: Terms = { rate: roundRate(o.kind, base.rate * Math.min(f, ceiling)), weeks: trip(o.kind) ? 1 : Math.min(p.weeks, lim.maxWeeks), payWeeks: p.payWeeks };
  const why = [f > ceiling ? "no puede pagar tanto" : null, !weeksOk ? `no quiere comprometerse más de ${lim.maxWeeks} semanas` : null].filter(Boolean).join(" y ");
  return { kind: "contraoferta", terms: counter, message: `Te hace una contraoferta: ${why}.` };
}

// ── Documentación ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface DocChoice { id: string; label: string; explain: string }

/**
 * Documentos que puedes preparar al aceptar una operación. Normativa comprobada en el BOE el 09/11/2026:
 * - Documento de control: obligatorio por cada envío en el transporte público de mercancías por carretera, a bordo del
 *   vehículo, dos ejemplares y conservación un año (Orden FOM/2861/2012, arts. 1, 3, 8 y 9).
 * - Carta de porte: cualquiera de las partes puede exigirla (Ley 15/2009, art. 10); si incluye los datos del documento de
 *   control, sirve como tal (Orden FOM/2861/2012, art. 2.2). El transportista puede pedir un recibo de la entrega (art. 12).
 * - En almacenaje no se ha verificado una obligación documental concreta: los documentos se tratan como buena práctica.
 */
export const TRANSPORT_DOCS: DocChoice[] = [
  { id: "control", label: "Documento de control del envío", explain: "Obligatorio por cada envío en el transporte público de mercancías por carretera, a bordo del vehículo (Orden FOM/2861/2012)." },
  { id: "porte", label: "Carta de porte con los datos del documento de control", explain: "Prueba el contrato y las condiciones (Ley 15/2009, art. 10); con esos datos sirve también como documento de control (Orden FOM/2861/2012, art. 2.2)." },
  { id: "recibo", label: "Recibo de entrega firmado por el destinatario", explain: "Prueba que entregaste y en qué estado (Ley 15/2009, art. 12): sin él, una reclamación es tu palabra contra la suya." },
  { id: "cmr", label: "Carta de porte internacional CMR", explain: "Es para el transporte internacional por carretera; esta operación es nacional." },
  { id: "dua", label: "DUA (declaración aduanera)", explain: "No hay aduana: el transporte es dentro de España." },
];
export const WAREHOUSE_DOCS: DocChoice[] = [
  { id: "albaran", label: "Albarán de entrada con recuento y estado de la mercancía", explain: "Prueba qué recibiste y cómo: sin él no puedes rebatir una reclamación del cliente sobre los palés entregados." },
  { id: "condiciones", label: "Condiciones del servicio por escrito (tarifas, responsabilidades, seguro)", explain: "Evita discusiones sobre qué está incluido y quién responde de los daños." },
  { id: "registro", label: "Registro de existencias por ubicación", explain: "Permite localizar cada palé y controlar el stock (logística de almacenamiento)." },
  { id: "control", label: "Documento de control del envío", explain: "Es un documento del transporte por carretera, no del almacenaje." },
];
/**
 * Viaje internacional (v5). Comprobado el 10/11/2026: Convenio CMR (BOE-A-1974-753), arts. 1, 4, 5 y 6; Orden
 * FOM/2861/2012, art. 2.2 (la carta de porte internacional sirve como documento de control si lleva sus datos);
 * Reglamento (CE) 1072/2009, art. 4 (copia certificada de la licencia comunitaria en cada vehículo; leído en el texto que
 * conserva legislation.gov.uk, porque EUR-Lex no se dejó descargar).
 */
export const INTERNATIONAL_DOCS: DocChoice[] = [
  { id: "cmr", label: "Carta de porte CMR con los datos del documento de control", explain: "Prueba el contrato de transporte internacional (Convenio CMR, art. 4) y, con esos datos, sirve como documento de control (Orden FOM/2861/2012, art. 2.2). Se hace en tres originales: remitente, mercancía y transportista (art. 5)." },
  { id: "licencia", label: "Copia certificada de la licencia comunitaria", explain: "Tiene que ir en cada vehículo que hace transporte internacional dentro de la UE y enseñarse en una inspección (Reglamento (CE) 1072/2009, art. 4)." },
  { id: "control", label: "Documento de control del envío (modelo nacional)", explain: "Si el CMR lleva sus datos, ya hace de documento de control: este sobra." },
  { id: "dua", label: "DUA (declaración aduanera)", explain: "Francia y Portugal están en la UE: no hay aduana ni despacho." },
  { id: "recibo", label: "Recibo de entrega firmado por el destinatario", explain: "El ejemplar del CMR firmado por el destinatario ya prueba la entrega." },
];
export const docsFor = (kind: OfferKind) => (kind === "almacenaje" ? WAREHOUSE_DOCS : kind === "internacional" ? INTERNATIONAL_DOCS : TRANSPORT_DOCS);

export type DocIssue = "sin_control" | "sin_albaran" | "sin_licencia";

export function gradeDocs(kind: OfferKind, selected: string[]): { grade: Grade; feedback: string[]; issues: DocIssue[] } {
  const has = (id: string) => selected.includes(id);
  const fb: string[] = [];
  const issues: DocIssue[] = [];
  let grade: Grade = "correcta";
  const worse = (g: Grade) => { if (g === "grave" || (g === "razonable" && grade === "correcta")) grade = g; };
  if (kind === "almacenaje") {
    if (!has("albaran")) { worse("razonable"); issues.push("sin_albaran"); fb.push("Sin albarán de entrada no podrás probar qué palés recibiste ni en qué estado."); }
    if (!has("condiciones")) { worse("razonable"); fb.push("Sin condiciones por escrito, cualquier discrepancia sobre tarifas o daños queda abierta."); }
    if (!has("registro")) { worse("razonable"); fb.push("Sin registro de existencias por ubicación el control del stock depende de la memoria."); }
    if (has("control")) { worse("razonable"); fb.push("El documento de control es del transporte por carretera, no del almacenaje."); }
  } else if (kind === "internacional") {
    if (!has("cmr")) {
      worse(has("control") ? "razonable" : "grave");
      if (!has("control")) issues.push("sin_control");
      fb.push(has("control") ? "Llevas el documento de control, pero sin CMR no tienes la carta de porte del contrato internacional, que es la que prueba sus condiciones y la entrega (Convenio CMR, art. 4)." : "Falta la carta de porte CMR: sin ella no llevas a bordo ni la prueba del contrato (Convenio CMR, art. 4) ni el documento de control (Orden FOM/2861/2012).");
    }
    if (!has("licencia")) { worse("grave"); issues.push("sin_licencia"); fb.push("Falta la copia certificada de la licencia comunitaria: tiene que ir en el vehículo en todo transporte internacional dentro de la UE (Reglamento (CE) 1072/2009, art. 4)."); }
    if (has("cmr") && has("control")) { worse("razonable"); fb.push("El CMR con los datos del documento de control ya sirve como tal (Orden FOM/2861/2012, art. 2.2): el otro sobra."); }
    if (has("dua")) { worse("razonable"); fb.push("Dentro de la UE no hay aduana: el DUA sobra."); }
    if (has("recibo")) { worse("razonable"); fb.push("El CMR firmado por el destinatario ya prueba la entrega: el recibo aparte sobra."); }
  } else {
    if (!has("control") && !has("porte")) { worse("grave"); issues.push("sin_control"); fb.push("Falta el documento de control del envío (o una carta de porte que lo incluya): es obligatorio llevarlo a bordo (Orden FOM/2861/2012)."); }
    if (!has("recibo")) { worse("razonable"); fb.push("Sin recibo de entrega firmado no podrás probar la entrega ni su estado (Ley 15/2009, art. 12)."); }
    if (has("cmr")) { worse("razonable"); fb.push("El CMR es para el transporte internacional; aquí sobra."); }
    if (has("dua")) { worse("razonable"); fb.push("No hay aduana en un transporte dentro de España: el DUA sobra."); }
  }
  if (!fb.length) fb.push("Documentación completa y adecuada para esta operación.");
  return { grade, feedback: fb, issues };
}

/** Documentación más adecuada (para las estrategias automáticas y la corrección). */
export const bestDocs = (kind: OfferKind) => (kind === "almacenaje" ? ["albaran", "condiciones", "registro"] : kind === "internacional" ? ["cmr", "licencia"] : ["porte", "recibo"]);

/** Consecuencias de la documentación que falta (importes SIMULADOS). Probabilidad semanal mientras dura el contrato. */
export const DOC_RISK = {
  sin_control: { chance: 0.12, cost: 400, text: "Inspección de transporte en carretera: el vehículo no llevaba el documento de control del envío (Orden FOM/2861/2012). Sanción de 400 € (importe simulado: la sanción real depende del régimen sancionador del transporte, no verificado)." },
  sin_licencia: { chance: 0.3, cost: 1_500, text: "Control en carretera en el extranjero: el camión no llevaba la copia certificada de la licencia comunitaria (Reglamento (CE) 1072/2009, art. 4). Inmovilización y multa: 1.500 € (importe simulado, no verificado)." },
  sin_albaran: { chance: 0.12, cost: 300, text: "El cliente reclama palés que dice que entregó. Sin albarán de entrada con recuento no puedes probar lo que recibiste: asumes 300 € (importe simulado)." },
} as const;
