import { round2 } from "../../../learning/money";
import { stream } from "../../rng";
import { activeDeals, charge, clientName, learn, relate, remember } from "../helpers";
import { leadDecisions } from "../leads";
import type { CampaignState, Decision, Grade } from "../model";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 6 · «Calidad o nada» (operaciones). Tu cliente principal audita tu servicio en las semanas 4 y 8. Mecánica
 * nueva: invertir en prevención (formación, procedimientos, mantenimiento, seguro) y resolver incidencias reales de
 * reparto. La prevención baja la probabilidad de que pasen; cómo respondes decide lo que cuestan.
 *
 * Normativa: Ley 15/2009 (texto vigente contrastado en el BOE el 21/11/2026): art. 12 (recibo de entrega), 20 (carga y
 * estiba: del cargador salvo pacto por escrito con suplemento; si estiba siguiendo tus instrucciones, respondes tú), 21.1
 * (bultos identificados y que coincidan con la carta de porte), 22 (paralización: más de una hora, sin contar la
 * primera), 36 (destinatario ausente: avisar al cargador y esperar instrucciones), 60.1 (reservas por daños no
 * aparentes en 7 días). Importes, probabilidades y la auditoría: SIMULADOS.
 *
 * Estrategias válidas: prevención completa; prevención selectiva (formación y procedimientos); asegurar y responder bien
 * a cada incidencia. La mala: no prevenir nada y responder mal.
 */
export const PREVENTION = {
  formacion: { label: "Formación en carga, estiba y documentación para el equipo", cost: 600, factor: 0.6, kind: "gasto" as const },
  procedimiento: { label: "Procedimiento de entrega: recibo firmado y carta de porte revisada en cada envío", cost: 0, factor: 0.7, kmLoss: 60, kind: "gasto" as const },
  revision: { label: "Revisión preventiva de la furgoneta", cost: 450, factor: 1, kind: "gasto" as const },
  seguro: { label: "Seguro de mercancías (franquicia de 150 €)", cost: 30, factor: 1, kind: "semanal" as const },
};
const BASE_CHANCE = 0.65;
/** Probabilidad semanal de incidencia: la formación y el procedimiento de entrega la reducen. */
export const incidentChance = (s: CampaignState) => BASE_CHANCE * (s.answers["prev-formacion"] === "si" ? PREVENTION.formacion.factor : 1) * (s.answers["prev-procedimiento"] === "si" ? PREVENTION.procedimiento.factor : 1);
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
const INCIDENTS = ["espera", "ausente", "estiba", "bultos", "dano"] as const;
type Inc = (typeof INCIDENTS)[number];

/** Cliente auditor: el que más te factura (Bazar o Hiper normalmente). */
const auditor = (s: CampaignState) => {
  const byClient = new Map<string, number>();
  for (const d of activeDeals(s.company, s.abs)) byClient.set(d.client, (byClient.get(d.client) ?? 0) + (d.kind === "transporte" ? d.km! * d.rate! : d.pallets! * d.palletRate!));
  return [...byClient.entries()].filter(([k]) => !k.startsWith("nuevo-") && k !== "urgentes").sort((a, b) => b[1] - a[1])[0]?.[0] ?? "bazar";
};

function incidentDecision(s: CampaignState, kind: Inc): Decision {
  const who = clientName(String(s.data.auditor));
  const base = { id: `incidencia-${s.abs}`, key: true, data: { kind } };
  if (kind === "espera") return { ...base, title: "Tres horas esperando para descargar", prompt: `En el almacén del destinatario de ${who} tienen a tu furgoneta 3 horas esperando, aunque llegaste a la hora pactada.`, hint: "La ley reconoce una indemnización por paralización. ¿Desde cuándo cuenta y qué necesitas para probarla?",
    options: [{ id: "reclamar", label: "Anotar las horas de llegada y salida en el documento de entrega y reclamar la paralización" }, { id: "esperar", label: "Esperar sin decir nada" }, { id: "irse", label: "Irte sin descargar" }] };
  if (kind === "ausente") return { ...base, title: "El destinatario no está", prompt: `Llegas con la carga de ${who} y la nave del destinatario está cerrada. Nadie contesta.`, hint: "¿De quién es la mercancía hasta que la entregas? ¿Quién paga los gastos de una nueva entrega?",
    options: [{ id: "avisar", label: "Avisar al cargador y esperar sus instrucciones" }, { id: "puerta", label: "Dejar los palés en la puerta y hacer una foto" }, { id: "volver", label: "Volver y repetir mañana sin avisar" }] };
  if (kind === "estiba") return { ...base, title: "La carga está mal estibada", prompt: `El personal de ${who} ha cargado los palés sin calzar y te meten prisa para salir.`, hint: "¿De quién es la estiba si no se ha pactado otra cosa? ¿Y si la hacen siguiendo tus instrucciones?",
    options: [{ id: "escrito", label: "Pedir que la corrijan y, si no, dejar constancia escrita en la carta de porte" }, { id: "indicar", label: "Decirles cómo colocarla y salir sin dejar nada escrito" }, { id: "salir", label: "Salir tal cual" }] };
  if (kind === "bultos") return { ...base, title: "Los bultos no coinciden con la carta de porte", prompt: `La carta de porte de ${who} dice 14 palés y en la furgoneta hay 12.`, hint: "Lo que firmas al cargar es lo que luego tendrás que entregar.",
    options: [{ id: "anotar", label: "Anotar la diferencia en la carta de porte y avisar al cargador" }, { id: "firmar", label: "Firmar tal cual y salir" }, { id: "destino", label: "Que lo aclaren en destino" }] };
  return { ...base, title: "Te reclaman mercancía dañada", prompt: `El destinatario de ${who} reclama daños de una entrega de hace 10 días, que no se veían al entregar. No anotó reservas.`, hint: "Las reservas por daños que no se ven tienen un plazo. ¿Qué te protege si no se hicieron a tiempo?",
    options: [{ id: "recibo", label: "Presentar el recibo de entrega firmado sin reservas y rechazar la reclamación" }, { id: "pagar", label: "Pagar lo que pide para no discutir" }, { id: "ignorar", label: "No contestar" }] };
}

/** Coste, gravedad y explicación de cada respuesta (importes simulados). */
export function resolveIncident(s: CampaignState, kind: Inc, op: string): { grade: Grade; cost: number; serious: boolean; feedback: string } {
  const has = (k: string) => s.answers[`prev-${k}`] === "si";
  const insured = has("seguro");
  const covered = (v: number) => (insured ? 150 : v);
  switch (kind) {
    case "espera": return op === "reclamar" ? { grade: "correcta", cost: -80, serious: false, feedback: "Correcto: con más de una hora de espera hay indemnización por paralización, sin contar la primera (Ley 15/2009, art. 22). 2 horas cobrables × 40 € (importe simulado). Sin las horas anotadas no podrías probarlo." } : op === "esperar" ? { grade: "razonable", cost: 0, serious: false, feedback: "Entregas, pero pierdes lo que la ley te reconoce por la espera (art. 22)." } : { grade: "grave", cost: 200, serious: true, feedback: "Dejas la entrega sin hacer: falla el servicio y lo verá la auditoría. La espera se reclama, no se resuelve marchándose." };
    case "ausente": return op === "avisar" ? { grade: "correcta", cost: 0, serious: false, feedback: "Correcto: se avisa al cargador y se esperan instrucciones; los gastos de esperar y de ejecutarlas los paga él (art. 36)." } : op === "puerta" ? { grade: "grave", cost: covered(900), serious: true, feedback: `Hasta la entrega la mercancía es responsabilidad tuya (art. 47.1). Desaparecen dos palés: ${insured ? "el seguro cubre todo menos la franquicia de 150 €" : "pagas 900 € (simulado)"}.` } : { grade: "razonable", cost: 180, serious: false, feedback: "La mercancía queda a salvo, pero sin avisar no puedes cobrar la nueva entrega: 180 € a tu cargo." };
    case "estiba": return op === "escrito" ? { grade: "correcta", cost: 0, serious: false, feedback: "Correcto: la estiba es del cargador salvo pacto por escrito con suplemento (art. 20.1), y dejarlo escrito te protege." } : op === "indicar" ? { grade: "grave", cost: covered(800), serious: true, feedback: `Si estiban siguiendo tus instrucciones, los daños por mala estiba son tuyos (art. 20.2). Se vuelca un palé: ${insured ? "el seguro cubre menos la franquicia" : "800 € (simulado)"}.` } : { grade: "razonable", cost: 300, serious: false, feedback: "La ley te da la razón (art. 20.1), pero sin nada escrito, la discusión por los daños te cuesta 300 € (simulado)." };
    case "bultos": return op === "anotar" ? { grade: "correcta", cost: 0, serious: false, feedback: "Correcto: los bultos deben coincidir con la carta de porte (art. 21.1); con la diferencia anotada nadie dirá que se perdieron contigo." } : op === "firmar" ? { grade: "grave", cost: covered(700), serious: true, feedback: `Al entregar faltan 2 palés y tu firma dice 14: parece que se perdieron en tu furgoneta. ${insured ? "El seguro cubre menos la franquicia." : "Pagas 700 € (simulado)."}` } : { grade: "razonable", cost: 200, serious: false, feedback: "Al final se aclara, pero la discusión te salpica: 200 € (simulado)." };
    default: return op === "recibo" ? (has("procedimiento") ? { grade: "correcta", cost: 0, serious: false, feedback: "Correcto: sin reservas en 7 días por daños que no se veían, se presume que entregaste bien (art. 60.1), y tu recibo firmado (art. 12) lo prueba." } : { grade: "razonable", cost: covered(600), serious: false, feedback: `La ley te ampara (art. 60.1), pero no tienes recibo firmado: sin el procedimiento de entrega no puedes probarlo. ${insured ? "El seguro cubre menos la franquicia." : "Pagas 600 € (simulado)."}` }) : op === "pagar" ? { grade: "razonable", cost: 600, serious: false, feedback: "Pagas algo que probablemente no te correspondía: pasados 7 días sin reservas se presume la entrega correcta (art. 60.1)." } : { grade: "grave", cost: 900, serious: true, feedback: "Sin contestar, el cliente lleva la reclamación adelante y además lo anota en la auditoría: 900 € entre indemnización y costas (simulado)." };
  }
}

export const LEVEL6: LevelDef = {
  n: 6, act: 2, actTitle: "Consolidación", type: "Operaciones", title: "Calidad o nada", weeks: 8,
  briefing: "Tu cliente principal exige un servicio impecable: te audita en las semanas 4 y 8. Si suspendes la final, se va. En el día a día del reparto van a pasar cosas; prevenir cuesta dinero, pero no prevenir puede costar más.",
  mechanic: "Calidad: inviertes en prevención (formación, procedimientos, mantenimiento, seguro) y resuelves incidencias reales de reparto con lo que dice la ley. La auditoría puntúa tu servicio.",
  objectives: ["Aprobar la auditoría final de tu cliente principal.", "Que lo que te cuesten las incidencias y la prevención no pase de 1.200 €.", "Aprobar las dos auditorías sin ninguna incidencia grave."],
  strategies: ["Prevención completa: formación, procedimientos, revisión y seguro.", "Prevención selectiva: formación y procedimiento de entrega, sin seguro.", "Asegurar la mercancía y responder bien a cada incidencia."],
  concepts: ["calidad-coste", "recibo-entrega", "estiba", "paralizacion"],
  keyDecisions: ["prev-formacion", "prev-procedimiento", "prev-revision", "prev-seguro"],
  start(s) { s.data.auditor = auditor(s); s.data.score = 100; s.data.qualityCost = 0; s.data.serious = 0; },
  decisionsAt(s) {
    const out: Decision[] = [];
    if (s.week === 1) for (const [k, p] of Object.entries(PREVENTION)) out.push({ id: `prev-${k}`, key: true, title: p.label,
      prompt: k === "procedimiento" ? "No cuesta dinero, pero cada entrega tarda más: pierdes unos 60 km de capacidad a la semana." : k === "seguro" ? `${p.cost} € a la semana mientras dure el nivel.` : `${p.cost} € ahora.`,
      hint: k === "formacion" ? "Un equipo formado tiene menos incidencias. ¿Cuánto te cuesta una incidencia grave frente a la formación?" : k === "procedimiento" ? "¿Qué te protege cuando te reclaman días después de entregar?" : k === "revision" ? "Una avería en plena semana es servicio fallado y una reparación más cara." : "Un seguro no evita las incidencias: cambia un coste grande e incierto por uno pequeño y fijo.",
      options: [{ id: "si", label: "Sí" }, { id: "no", label: "No" }] });
    // Incidencia de la semana (desde la 2): menos probable con prevención.
    if (s.week >= 2) {
      const r = stream(s.seed, s.abs, "campana-l6-incidencia");
      if (r() < incidentChance(s)) out.push(incidentDecision(s, INCIDENTS[Math.floor(r() * INCIDENTS.length)]));
      if (s.week === 3 && s.answers["prev-revision"] !== "si" && r() < 0.7) out.push({ id: "averia-l6", key: false, title: "Avería de la furgoneta", prompt: "Se rompe el embrague a mitad de ruta: reparación de 900 € y medio día sin servicio.", hint: "Sin revisión preventiva, las averías llegan cuando menos conviene.", options: [{ id: "reparar", label: "Repararla" }] });
    }
    out.push(...leadDecisions(s), ...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    if (d.id.startsWith("prev-")) {
      const k = d.id.slice(5) as keyof typeof PREVENTION, p = PREVENTION[k];
      if (op === "si") {
        if (k === "formacion") { charge(s, "Formación del equipo", p.cost); s.data.qualityCost = Number(s.data.qualityCost) + p.cost; }
        if (k === "revision") { charge(s, "Revisión preventiva", p.cost); s.data.qualityCost = Number(s.data.qualityCost) + p.cost; }
        if (k === "procedimiento") { for (const v of c.vehicles) v.kmWeek -= PREVENTION.procedimiento.kmLoss; }
        if (k === "seguro") s.data.insured = true;
      }
      learn(s, { id: d.id, what: p.label, answer: op === "si" ? "Sí" : "No", grade: op === "si" ? "correcta" : "razonable", competences: ["0622-RA4", "0623-RA7"], key: true,
        feedback: op === "si" ? (k === "formacion" ? "Las incidencias bajan un 40 %: la prevención se paga sola si evita una sola incidencia grave." : k === "procedimiento" ? "Menos capacidad, pero cada entrega queda probada con el recibo firmado (Ley 15/2009, art. 12) y la carta de porte revisada (art. 21.1)." : k === "revision" ? "El mantenimiento preventivo evita averías en el peor momento." : "Cambias un riesgo grande por un coste fijo pequeño: las incidencias graves te costarán solo la franquicia.") : "Te ahorras el coste ahora y asumes el riesgo: si pasa algo, lo pagas entero." });
      return;
    }
    if (d.id === "averia-l6") { charge(s, "Reparación de la furgoneta", 900); s.data.qualityCost = Number(s.data.qualityCost) + 900; s.data.score = Number(s.data.score) - 10; return; }
    if (d.id.startsWith("incidencia-")) {
      const kind = String(d.data!.kind) as Inc;
      const r = resolveIncident(s, kind, op);
      if (r.cost) charge(s, `${d.title}: ${r.cost < 0 ? "indemnización cobrada" : "coste"}`, r.cost);
      s.data.qualityCost = round2(Number(s.data.qualityCost) + Math.max(0, r.cost));
      s.data.score = Number(s.data.score) - (r.serious ? 25 : r.grade === "razonable" ? 8 : 0);
      if (r.serious) { s.data.serious = Number(s.data.serious) + 1; relate(s, String(s.data.auditor), -10); }
      learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade: r.grade, feedback: r.feedback, competences: ["0622-RA6", "0622-RA3"], key: true });
    }
  },
  beforeClose(s) {
    if (s.data.insured) { charge(s, "Seguro de mercancías", PREVENTION.seguro.cost); s.data.qualityCost = Number(s.data.qualityCost) + PREVENTION.seguro.cost; }
  },
  afterWeek(s, notes) {
    // Auditorías en las semanas 4 y 8: aprueba con 75 puntos o más (simulado).
    if (s.week === 4 || s.week === 8) {
      const score = Number(s.data.score);
      const pass = score >= 75;
      s.data[`audit${s.week}`] = pass ? "aprobada" : "suspendida";
      notes.push(`Auditoría de ${clientName(String(s.data.auditor))}: ${score} puntos, ${pass ? "aprobada" : "suspendida"}.`);
      if (!pass && s.week === 8) { for (const d of s.company.deals) if (d.client === s.data.auditor && !d.ended) { d.ended = true; d.toAbs = s.abs; } remember(s, "suspendio-auditoria"); notes.push(`${clientName(String(s.data.auditor))} deja de trabajar contigo.`); }
      if (s.week === 4) s.data.score = Math.min(100, score + 10); // tras la primera auditoría tienes margen para corregir
    }
  },
  stars(s) {
    return [s.data.audit8 === "aprobada" && s.status !== "quiebra", Number(s.data.qualityCost) <= 1_200, s.data.audit4 === "aprobada" && s.data.audit8 === "aprobada" && Number(s.data.serious) === 0];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l6-reservas", topic: "reservas y recibo de entrega", competences: ["0622-RA6"], prompt: "Diez días después de entregar, el destinatario reclama daños que no se veían. No hizo reservas. ¿Qué dice la ley?",
        options: [
          { id: "ok", label: "Las reservas por daños no aparentes se hacen en 7 días; sin ellas se presume que la mercancía llegó bien, y el recibo firmado lo prueba", grade: "correcta", feedback: "Correcto: Ley 15/2009, arts. 60.1 y 12." },
          { id: "siempre", label: "El transportista responde siempre de los daños", grade: "grave", feedback: "Responde desde que recibe la mercancía hasta que la entrega (art. 47.1), pero las reservas tienen plazo (art. 60.1)." },
          { id: "30", label: "Tiene 30 días para reclamar", grade: "grave", feedback: "Para daños no aparentes, 7 días naturales (art. 60.1)." },
        ] },
      { id: "l6-calidad", topic: "coste de la calidad", competences: ["0623-RA7"], prompt: "¿Por qué una empresa paga por formación y procedimientos aunque no le hayan pasado incidencias?",
        options: [
          { id: "ok", label: "Porque prevenir cuesta menos que lo que cuestan las incidencias que evita y los clientes que se pierden por ellas", grade: "correcta", feedback: "Correcto: el coste de la calidad incluye prevenir y el de la no calidad, fallar. Una sola incidencia grave puede costar más que toda la prevención." },
          { id: "norma", label: "Porque lo exige siempre la ley", grade: "razonable", feedback: "Algunas cosas sí (como la documentación), pero la mayor parte de la prevención es una decisión de gestión." },
          { id: "imagen", label: "Solo por imagen", grade: "grave", feedback: "La imagen cuenta, pero el motivo principal es económico: evitar costes y no perder clientes." },
        ] },
    ];
  },
};
export const L6_INCIDENTS = INCIDENTS;
export const qualityCost = (s: CampaignState) => Number(s.data.qualityCost ?? 0);
