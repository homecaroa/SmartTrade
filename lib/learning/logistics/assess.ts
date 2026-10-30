import { mid, type JustificationId, type LogisticsCase, type Range, type RouteOption } from "./types";
import { computeQuote, transitDays } from "./calculator";
import { fillRate } from "./capacity";

/**
 * Valoración de alternativas. Reglas (deterministas y visibles para el alumno):
 * - Plazo: «seguro» si incluso el tránsito más largo llega a tiempo; «en riesgo» si solo llega en el mejor caso;
 *   «no llega» si ni en el mejor caso.
 * - La mejor opción es la MÁS BARATA DE LAS QUE LLEGAN SEGURO (no la más barata a secas).
 * - Nota de la ruta: la mejor → adecuada; segura y hasta 2× su coste, o en riesgo pero más barata → razonable;
 *   no llega, o más de 3× el coste de la mejor sin necesidad → error importante.
 * El coste que se compara es el logístico total (lo paguen el vendedor o el comprador), con el valor central del rango.
 */
export type DeadlineStatus = "seguro" | "riesgo" | "no_llega";
export const DEADLINE_LABEL: Record<DeadlineStatus, string> = { seguro: "Llega a tiempo", riesgo: "Solo en el mejor caso", no_llega: "No llega a tiempo" };

export function deadlineStatus(c: LogisticsCase, route: RouteOption, extraDays = 0): DeadlineStatus {
  const t = transitDays(route);
  const d: Range = { min: t.min + c.prepDays + extraDays, max: t.max + c.prepDays + extraDays };
  return d.max <= c.deadlineDays ? "seguro" : d.min <= c.deadlineDays ? "riesgo" : "no_llega";
}

export interface RouteAssessment { route: RouteOption; status: DeadlineStatus; cost: number; grade: "correcta" | "razonable" | "grave"; reasons: string[] }

export function assessRoutes(c: LogisticsCase): { all: RouteAssessment[]; best: RouteOption } {
  const base = c.routes.map((route) => ({ route, status: deadlineStatus(c, route), cost: mid(computeQuote(c, route, c.agreed.incoterm).logistics.total) }));
  const safe = base.filter((b) => b.status === "seguro");
  const pool = safe.length ? safe : base.filter((b) => b.status === "riesgo");
  const best = [...(pool.length ? pool : base)].sort((a, b) => a.cost - b.cost)[0];
  const all = base.map((b): RouteAssessment => {
    const ratio = b.cost / best.cost;
    const reasons: string[] = [];
    let grade: RouteAssessment["grade"];
    if (b.route.id === best.route.id) { grade = "correcta"; reasons.push("Es la opción más barata de las que llegan a tiempo con seguridad."); }
    else if (b.status === "no_llega") { grade = "grave"; reasons.push("No llega a la fecha de entrega pactada ni en el mejor caso."); }
    else if (ratio > 3) { grade = "grave"; reasons.push(`Cuesta ${ratio.toFixed(1).replace(".", ",")} veces más que la mejor opción sin que el caso lo necesite.`); }
    else { grade = "razonable"; reasons.push(b.status === "riesgo" ? "Solo llega a tiempo si todo va bien: asumes riesgo de retraso." : `Llega a tiempo, pero cuesta ${ratio.toFixed(1).replace(".", ",")} veces lo que la mejor opción.`); }
    for (const s of b.route.suitability) reasons.push(s.note);
    if (grade === "correcta" && b.route.suitability.some((s) => s.penalty >= 30)) grade = "razonable";
    return { ...b, grade, reasons };
  });
  return { all, best: best.route };
}

export const JUSTIFICATIONS: { id: JustificationId; label: string }[] = [
  { id: "plazo", label: "Llega a tiempo a la fecha pactada" },
  { id: "barata_que_cumple", label: "Es la más barata de las que llegan a tiempo" },
  { id: "mas_barata", label: "Es la más barata de todas" },
  { id: "mas_rapida", label: "Es la más rápida" },
  { id: "aprovecha_capacidad", label: "Aprovecha bien un camión o un contenedor completo" },
  { id: "menos_manipulaciones", label: "Tiene menos transbordos y manipulaciones" },
  { id: "adecuada_mercancia", label: "Es adecuada para este tipo de mercancía" },
];

/** ¿Es verdad cada motivo para la ruta elegida? Se calcula con los mismos datos que ve el alumno. */
export function justificationTruth(c: LogisticsCase, routeId: string): Record<JustificationId, boolean> {
  const { all } = assessRoutes(c);
  const me = all.find((a) => a.route.id === routeId)!;
  const safe = all.filter((a) => a.status === "seguro");
  const minBy = (xs: RouteAssessment[], f: (a: RouteAssessment) => number) => Math.min(...xs.map(f));
  const fill = fillRate(c.cargo, me.route.modality);
  return {
    plazo: me.status === "seguro",
    barata_que_cumple: me.status === "seguro" && me.cost <= minBy(safe, (a) => a.cost),
    mas_barata: me.cost <= minBy(all, (a) => a.cost),
    mas_rapida: transitDays(me.route).max <= minBy(all, (a) => transitDays(a.route).max),
    aprovecha_capacidad: fill !== null && fill >= 0.6,
    menos_manipulaciones: me.route.transshipments.length <= minBy(safe.length ? safe : all, (a) => a.route.transshipments.length),
    adecuada_mercancia: me.route.suitability.every((s) => s.penalty < 20),
  };
}

export function gradeJustification(c: LogisticsCase, routeId: string, selected: JustificationId[]): { grade: "correcta" | "razonable" | "grave"; feedback: string[] } {
  if (!selected.length) return { grade: "grave", feedback: ["No has justificado la elección: en una empresa, toda decisión logística debe poder explicarse."] };
  const truth = justificationTruth(c, routeId);
  const label = (id: JustificationId) => JUSTIFICATIONS.find((j) => j.id === id)!.label;
  const wrong = selected.filter((s) => !truth[s]);
  if (wrong.length) return { grade: "grave", feedback: wrong.map((w) => `«${label(w)}» no es cierto para la ruta elegida: compruébalo en la tabla de alternativas.`) };
  if (!selected.includes(c.decisiveReason)) return { grade: "razonable", feedback: [`Tus motivos son ciertos, pero falta el decisivo en este caso: «${label(c.decisiveReason)}».`] };
  return { grade: "correcta", feedback: ["Justificación correcta: los motivos son ciertos e incluyen el decisivo del caso."] };
}
