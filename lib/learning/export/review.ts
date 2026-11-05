import { stagesFor, visibleDecisions, type ExportSession } from "./engine";
import type { ExportScenario, StageId } from "./types";

/**
 * Repaso al cerrar cada etapa (propuesta 9, 04/11/2026). Dos preguntas cortas de conceptos por etapa, válidas en todos
 * los casos. Aparecen cuando todas las decisiones de la etapa están confirmadas, se corrigen al momento con su
 * explicación y se puntúan APARTE de la nota de conocimientos (para no cambiar la nota de los casos ya jugados).
 * Las respuestas se guardan en la sesión con la clave `repaso.<id>`: no son decisiones y no cambian la operación.
 */
export interface ReviewQuestion { id: string; stage: StageId; prompt: string; options: { id: string; label: string }[]; correct: string; explain: string }

const q = (id: string, stage: StageId, prompt: string, correct: [string, string], wrong: [string, string][], explain: string): ReviewQuestion =>
  ({ id, stage, prompt, options: [{ id: correct[0], label: correct[1] }, ...wrong.map(([i, l]) => ({ id: i, label: l }))], correct: correct[0], explain });

export const STAGE_REVIEW: ReviewQuestion[] = [
  q("ficha-1", "ficha", "¿Para qué sirve Access2Markets?",
    ["aranceles", "Consultar aranceles, reglas de origen y requisitos de un producto para un país"],
    [["vies", "Comprobar el NIF-IVA de una empresa de la UE"], ["transporte", "Contratar el transporte internacional"]],
    "Es el portal de la Comisión Europea para exportar e importar. El NIF-IVA europeo se comprueba en VIES."),
  q("ficha-2", "ficha", "Un dato marcado «Verificar en una operación real» significa que…",
    ["comprobar", "es el planteamiento habitual, pero hay que comprobarlo en la fuente oficial antes de usarlo"],
    [["exacto", "es un dato oficial y exacto"], ["inventado", "es inventado y no se parece a la realidad"]],
    "Normativa y trámites cambian: el simulador enseña el razonamiento, no sustituye a la fuente oficial."),
  q("prep-1", "preparacion", "Un requisito de importación lo presenta el importador en destino. ¿Qué papel tiene el exportador?",
    ["datos", "Darle a tiempo los datos y documentos que necesita"],
    [["nada", "Ninguno: es un trámite del importador"], ["presentar", "Presentarlo él mismo en el país de destino"]],
    "Aunque el trámite sea del importador, sin los datos del fabricante no puede hacerlo y la mercancía se retiene."),
  q("prep-2", "preparacion", "¿Por qué conviene conocer la solvencia del comprador antes de ofertar?",
    ["cobro", "Para proponer una forma de cobro proporcionada al riesgo"],
    [["precio", "Para cobrarle más si tiene mucho dinero"], ["incoterm", "Porque decide qué Incoterm es obligatorio"]],
    "Con un cliente nuevo o de riesgo, el instrumento de cobro (anticipo, cobro documentario, carta de crédito…) protege la venta."),
  q("contrato-1", "contrato", "¿Qué regula un Incoterm?",
    ["entrega", "Dónde se entrega, cuándo pasa el riesgo y quién paga cada coste y trámite"],
    [["propiedad", "Cuándo pasa la propiedad y cuándo se paga"], ["precio", "El precio de la mercancía y la moneda"]],
    "La propiedad, el pago y el precio se pactan en el contrato de compraventa."),
  q("contrato-2", "contrato", "¿Qué reglas Incoterms son solo para transporte marítimo y vías navegables?",
    ["maritimas", "FAS, FOB, CFR y CIF"],
    [["c", "EXW, FCA, CPT y CIP"], ["d", "DAP, DPU y DDP"]],
    "Las demás sirven para cualquier modo. Con contenedores se recomiendan FCA, CPT o CIP."),
  q("log-1", "logistica", "Un envío aéreo pesa 300 kg y ocupa 3 m³. Con la relación 1:6000 (1 m³ = 166,7 kg), ¿cuál es el peso tasable?",
    ["500", "500 kg"], [["300", "300 kg"], ["3000", "3.000 kg"]],
    "Peso volumétrico = 3 × 166,7 ≈ 500 kg; se cobra el mayor entre el real (300 kg) y el volumétrico."),
  q("log-2", "logistica", "En grupaje marítimo se cobra por tonelada-volumen (W/M). Un envío de 4 t que ocupa 6 m³ se cobra como…",
    ["6", "6 toneladas-volumen"], [["4", "4 toneladas-volumen"], ["10", "10 toneladas-volumen"]],
    "W/M: el mayor entre las toneladas y los metros cúbicos."),
  q("doc-1", "documentacion", "¿Qué documento de transporte es además título de la mercancía (quien lo tiene puede retirarla)?",
    ["bl", "El conocimiento de embarque (B/L)"], [["awb", "El conocimiento aéreo (AWB)"], ["cmr", "El CMR"]],
    "Por eso el B/L es la pieza clave del cobro documentario y de la carta de crédito; el AWB y el CMR no dan control de la mercancía."),
  q("doc-2", "documentacion", "¿Para qué sirve una prueba de origen preferencial (EUR.1, declaración de origen…)?",
    ["preferencia", "Para que el importador pague el arancel reducido de un acuerdo comercial"],
    [["iva", "Para demostrar la salida de la UE y la exención de IVA"], ["peligrosa", "Para identificar una mercancía peligrosa"]],
    "La salida de la UE se prueba con el DUA de exportación; la mercancía peligrosa, con su declaración de transporte."),
  q("adu-1", "aduanas", "En la UE y en muchos países, el arancel se calcula sobre…",
    ["cif", "el valor de la mercancía más el transporte y el seguro hasta la frontera"],
    [["beneficio", "el beneficio del exportador"], ["pvp", "el precio de venta al público en destino"]],
    "Es el valor en aduana. Algunos países, como EE. UU., no incluyen el flete internacional: compruébalo en cada destino."),
  q("adu-2", "aduanas", "¿Qué parte del código HS es común en todo el mundo?",
    ["seis", "Los seis primeros dígitos"], [["ocho", "Los ocho dígitos"], ["dos", "Solo los dos primeros"]],
    "A partir del séptimo dígito cada país o zona (en la UE, la Nomenclatura Combinada) añade sus subdivisiones."),
  q("ent-1", "entrega", "La mercancía llega con bultos dañados. ¿Qué es lo primero?",
    ["reservas", "Dejar reservas concretas por escrito al recibir"],
    [["firmar", "Firmar la recepción y reclamar después"], ["devolver", "Devolver todo el envío sin firmar nada"]],
    "Sin reservas se presume que llegó en buen estado y se pierde la reclamación al transportista y al seguro."),
  q("ent-2", "entrega", "Con reglas E, F y C, ¿quién soporta el riesgo durante el transporte principal?",
    ["comprador", "El comprador: el riesgo pasa al entregar en origen"],
    [["vendedor", "El vendedor, porque en las reglas C paga el flete"], ["ambos", "Los dos a partes iguales"]],
    "En las reglas C el vendedor paga el flete, pero el riesgo ya es del comprador. Solo en las reglas D lo asume el vendedor hasta destino."),
];

export const reviewKey = (id: string) => `repaso.${id}`;
export const reviewsFor = (stage: StageId) => STAGE_REVIEW.filter((r) => r.stage === stage);

const stageDone = (sc: ExportScenario, s: ExportSession, stage: StageId) =>
  visibleDecisions(sc, s.answers).filter((d) => d.stage === stage).every((d) => s.confirmed.includes(d.id));
const answered = (s: ExportSession, r: ReviewQuestion) => typeof s.answers[reviewKey(r.id)] === "string";

/** Primera etapa terminada con preguntas de repaso sin responder (o null). */
export function pendingReview(sc: ExportScenario, s: ExportSession): StageId | null {
  for (const st of stagesFor(sc, s.answers)) {
    if (!stageDone(sc, s, st.id)) return null; // las etapas van en orden: si esta no está terminada, las siguientes tampoco
    if (reviewsFor(st.id).some((r) => !answered(s, r))) return st.id;
  }
  return null;
}

/** Guarda las respuestas del repaso de una etapa terminada. Se responden todas las preguntas de la etapa a la vez. */
export function answerReview(sc: ExportScenario, s: ExportSession, stage: StageId, picks: Record<string, string>): ExportSession {
  if (!stageDone(sc, s, stage)) throw new Error("La etapa aún no ha terminado.");
  const qs = reviewsFor(stage);
  if (qs.some((r) => !r.options.some((o) => o.id === picks[r.id]))) throw new Error("Responde todas las preguntas del repaso.");
  const answers = { ...s.answers };
  for (const r of qs) if (!answered(s, r)) answers[reviewKey(r.id)] = picks[r.id];
  return { ...s, answers };
}

/** Aciertos del repaso en las etapas del caso (no cuenta en la nota de conocimientos). */
export function reviewScore(sc: ExportScenario, s: ExportSession): { correct: number; answered: number; total: number } {
  const qs = stagesFor(sc, s.answers).flatMap((st) => reviewsFor(st.id));
  const done = qs.filter((r) => answered(s, r));
  return { correct: done.filter((r) => s.answers[reviewKey(r.id)] === r.correct).length, answered: done.length, total: qs.length };
}
