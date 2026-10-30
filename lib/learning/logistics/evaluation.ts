import { round2 } from "../money";
import { applicability, payerOf } from "./allocation";
import { assessRoutes, deadlineStatus, gradeJustification, type DeadlineStatus } from "./assess";
import { computeQuote, type Quote } from "./calculator";
import { OWNERSHIP_OPTIONS, type LogisticsSession } from "./session";
import { mid, type LogisticsCase } from "./types";

type Grade = "correcta" | "razonable" | "grave";
const POINTS: Record<Grade, number> = { correcta: 10, razonable: 6, grave: 0 };

export function gradeIncoterm(c: LogisticsCase, routeId: string, code: string): { grade: Grade; feedback: string[] } {
  const route = c.routes.find((r) => r.id === routeId)!;
  const ap = applicability(code, route);
  const fb: string[] = [];
  if (ap.level === "contradiccion") return { grade: "grave", feedback: [ap.message] };
  const who = (k: Parameters<typeof payerOf>[0]) => payerOf(k, code);
  fb.push(`Con ${code}: transporte principal a cargo del ${who("transporte_principal")}; despacho de exportación, del ${who("despacho_exportacion")}; despacho de importación, aranceles e impuestos, del ${who("despacho_importacion")}.`);
  if (ap.level === "aviso") fb.push(ap.message);
  let grade: Grade = c.incoterms.correct.includes(code) ? "correcta" : c.incoterms.reasonable.includes(code) ? "razonable" : "grave";
  if (grade === "correcta" && ap.level === "aviso") grade = "razonable";
  if (code === "DDP" && grade === "grave") fb.push("En DDP el vendedor importa en destino y paga aranceles e impuestos allí: exige estar registrado en ese país.");
  if (code === "EXW" && grade === "grave") fb.push("En EXW el comprador tendría que recoger en tu almacén y despachar la exportación desde España: no es lo que pidió.");
  if (code !== c.agreed.incoterm) fb.push(`Ojo: el precio se pactó en ${c.agreed.incoterm} (${c.agreed.place}). Cambiar de regla cambia quién paga cada tramo sin cambiar el precio.`);
  fb.push(c.incoterms.why);
  return { grade, feedback: fb };
}

export interface Dimension { key: string; label: string; score: number; explain: string }
export interface ReviewItem { title: string; answer: string; grade: Grade; feedback: string[] }
export interface LogisticsEvaluation {
  dimensions: Dimension[];
  knowledge: { points: number; max: number; pct: number };
  review: ReviewItem[];
  quote: Quote;
  bestQuote: Quote;
  finalStatus: DeadlineStatus;
  extraDays: number;
  errors: string[];
}

export function evaluateLogistics(c: LogisticsCase, s: LogisticsSession): LogisticsEvaluation {
  if (!s.routeId || !s.incoterm || !s.ownership || !s.incidentChoice) throw new Error("La sesión no está terminada.");
  const route = c.routes.find((r) => r.id === s.routeId)!;
  const { all, best } = assessRoutes(c);
  const me = all.find((a) => a.route.id === route.id)!;
  const just = gradeJustification(c, route.id, s.reasons);
  const inc = gradeIncoterm(c, route.id, s.incoterm);
  const own = OWNERSHIP_OPTIONS.find((o) => o.id === s.ownership)!;
  const incident = c.incident(c, route, s.incoterm);
  const choice = incident.options.find((o) => o.id === s.incidentChoice)!;
  const quote = computeQuote(c, route, s.incoterm, choice.cost ? [choice.cost] : []);
  const bestQuote = computeQuote(c, best, c.agreed.incoterm);
  const finalStatus = deadlineStatus(c, route, choice.extraDays);
  const review: ReviewItem[] = [
    { title: "Modalidad y ruta", answer: route.label, grade: me.grade, feedback: me.reasons },
    { title: "Justificación", answer: s.reasons.length ? `${s.reasons.length} motivo(s)` : "Sin justificar", grade: just.grade, feedback: just.feedback },
    { title: "Incoterm", answer: s.incoterm, grade: inc.grade, feedback: inc.feedback },
    { title: "Riesgo frente a propiedad", answer: own.label, grade: own.grade, feedback: [own.feedback] },
    { title: incident.title, answer: choice.label, grade: choice.grade, feedback: [choice.feedback] },
  ];
  const points = review.reduce((a, r) => a + POINTS[r.grade], 0);
  const max = review.length * 10;
  const chosenCost = mid(computeQuote(c, route, s.incoterm).logistics.total);
  const bestCost = mid(bestQuote.logistics.total);
  const penalties = route.suitability.reduce((a, x) => a + x.penalty, 0);
  const dims: Dimension[] = [
    { key: "coste", label: "Coste", score: Math.round(Math.min(1, bestCost / chosenCost) * 100), explain: `Coste logístico central de tu ruta frente al de la mejor opción que llega a tiempo. Más barato no siempre es mejor: la mejor es la más barata DE LAS QUE CUMPLEN el plazo.` },
    { key: "plazo", label: "Plazo", score: finalStatus === "seguro" ? 100 : finalStatus === "riesgo" ? 50 : 0, explain: `Con la incidencia incluida: ${finalStatus === "seguro" ? "llega a tiempo" : finalStatus === "riesgo" ? "solo llega en el mejor caso" : "no llega a la fecha pactada"}.` },
    { key: "adecuacion", label: "Adecuación a la mercancía y al volumen", score: Math.max(0, 100 - penalties), explain: route.suitability.length ? route.suitability.map((x) => x.note).join(" ") : "La modalidad encaja con la mercancía y el volumen." },
    { key: "riesgo", label: "Riesgo operativo", score: Math.max(0, 100 - 15 * route.transshipments.length - (choice.grade === "grave" ? 40 : choice.grade === "razonable" ? 15 : 0)), explain: `${route.transshipments.length} transbordo(s) o cambios de medio y la gestión de la incidencia.` },
    { key: "coherencia", label: "Coherencia comercial", score: POINTS[inc.grade] * 10, explain: `Incoterm frente a lo pactado con el comprador (${c.agreed.incoterm} ${c.agreed.place}) y frente a la modalidad elegida.` },
  ];
  return {
    dimensions: dims, review, quote, bestQuote, finalStatus, extraDays: choice.extraDays,
    knowledge: { points, max, pct: round2((points / max) * 100) },
    errors: review.filter((r) => r.grade === "grave").map((r) => `${r.title}: ${r.feedback[0]}`),
  };
}
