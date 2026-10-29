import type { PaymentId } from "../payments";
import { STAGES, type Answers, type Decision, type DecisionCtx, type DocOption, type Dyn, type ExportScenario, type ExtraCost, type Grade, type Settings, type StageId } from "./types";

/** Motor de decisiones del simulador de exportación. Puro y determinista: mismo escenario y respuestas → mismo resultado. */

export const resolve = <T>(v: Dyn<T>, ctx: DecisionCtx): T => (typeof v === "function" ? (v as (c: DecisionCtx) => T)(ctx) : v);

/** Ajustes de la operación que se deducen de las respuestas (los ids de esas decisiones coinciden con los ajustes). */
export function settingsFrom(answers: Answers): Settings {
  const one = (k: string) => (typeof answers[k] === "string" ? (answers[k] as string) : undefined);
  const docs = answers.documents;
  return {
    incoterm: one("incoterm"), payment: one("payment") as PaymentId | undefined, transport: one("transport"), packing: one("packing"),
    insurance: one("insurance") as Settings["insurance"], documents: Array.isArray(docs) ? docs : undefined,
  };
}

export const ctxOf = (scenario: ExportScenario, answers: Answers): DecisionCtx => ({ scenario, answers, settings: settingsFrom(answers) });

/** Decisiones que aplican a este caso con las respuestas dadas, en orden de etapa. */
export function visibleDecisions(sc: ExportScenario, answers: Answers): Decision[] {
  const ctx = ctxOf(sc, answers);
  const order = (s: StageId) => STAGES.findIndex((x) => x.id === s);
  return sc.decisions.filter((d) => !d.appliesIf || d.appliesIf(ctx)).sort((a, b) => order(a.stage) - order(b.stage));
}

export function stagesFor(sc: ExportScenario, answers: Answers) {
  const ids = new Set(visibleDecisions(sc, answers).map((d) => d.stage));
  return STAGES.filter((s) => ids.has(s.id));
}

export interface GradedAnswer { grade: Grade; feedback: string[]; best: string; why: string }

export function gradeDoc(docs: DocOption[], selected: string[]): GradedAnswer {
  const sel = new Set(selected);
  const feedback: string[] = [];
  let grade: Grade = "correcta";
  const worse = (g: Grade) => { if (g === "grave" || (g === "razonable" && grade === "correcta")) grade = g; };
  for (const d of docs) {
    const on = sel.has(d.id);
    if (d.need === "obligatorio" && !on) { worse("grave"); feedback.push(`Falta «${d.label}»: ${d.explain}`); }
    if (d.need === "incorrecto" && on) { worse("grave"); feedback.push(`«${d.label}» no corresponde a esta operación: ${d.explain}`); }
    if (d.need === "recomendado" && !on) { worse("razonable"); feedback.push(`Convendría incluir «${d.label}»: ${d.explain}`); }
    if (d.need === "innecesario" && on) { worse("razonable"); feedback.push(`«${d.label}» sobra: ${d.explain}`); }
  }
  if (!feedback.length) feedback.push("Has seleccionado exactamente la documentación que necesita esta operación.");
  const best = docs.filter((d) => d.need === "obligatorio" || d.need === "recomendado").map((d) => d.label).join(", ");
  return { grade, feedback, best, why: docs.filter((d) => d.need === "obligatorio").map((d) => `${d.label}: ${d.explain}`).join(" ") };
}

export function gradeAnswer(sc: ExportScenario, d: Decision, answers: Answers): GradedAnswer | null {
  const ctx = ctxOf(sc, answers);
  const a = answers[d.id];
  if (a === undefined) return null;
  if (d.kind === "multi") return gradeDoc(resolve(d.docs, ctx), Array.isArray(a) ? a : []);
  const opt = d.options.find((o) => o.id === a);
  if (!opt) return null;
  const bestId = resolve(d.best, ctx);
  const best = d.options.find((o) => o.id === bestId);
  return { grade: resolve(opt.grade, ctx), feedback: [resolve(opt.feedback, ctx)], best: best?.label ?? bestId, why: resolve(d.whyBest, ctx) };
}

/** Costes extra provocados por las decisiones tomadas (incidencias, descuentos, penalizaciones). */
export function extrasFrom(sc: ExportScenario, answers: Answers): ExtraCost[] {
  const ctx = ctxOf(sc, answers);
  const out: ExtraCost[] = [];
  for (const d of visibleDecisions(sc, answers)) {
    if (d.kind !== "single") continue;
    const opt = d.options.find((o) => o.id === answers[d.id]);
    const c = opt?.cost?.(ctx);
    if (c) out.push(c);
  }
  return out;
}

/** Estado de una sesión. `confirmed` = decisiones cuya explicación ya vio el alumno (no se pueden cambiar después). */
export interface ExportSession { v: 1; module: "exportacion"; caseId: string; answers: Answers; confirmed: string[]; startedAt: string }

export const newSession = (caseId: string, now = new Date()): ExportSession => ({ v: 1, module: "exportacion", caseId, answers: {}, confirmed: [], startedAt: now.toISOString() });

export function isExportSession(x: unknown, caseId: string): x is ExportSession {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<ExportSession>;
  return s.v === 1 && s.module === "exportacion" && s.caseId === caseId && !!s.answers && typeof s.answers === "object" && Array.isArray(s.confirmed) && typeof s.startedAt === "string";
}

/** Decisión pendiente: la primera visible sin confirmar. Las decisiones que dejan de aplicar se ignoran. */
export function pendingDecision(sc: ExportScenario, s: ExportSession): Decision | null {
  return visibleDecisions(sc, s.answers).find((d) => !s.confirmed.includes(d.id)) ?? null;
}

export function progress(sc: ExportScenario, s: ExportSession) {
  const vis = visibleDecisions(sc, s.answers);
  const done = vis.filter((d) => s.confirmed.includes(d.id)).length;
  return { done, total: vis.length, complete: done === vis.length };
}

/** Registra la respuesta y la confirma. Una decisión confirmada no se puede cambiar: se conserva con su consecuencia. */
export function answerAndConfirm(sc: ExportScenario, s: ExportSession, decisionId: string, value: string | string[]): ExportSession {
  if (s.confirmed.includes(decisionId)) return s;
  const d = visibleDecisions(sc, s.answers).find((x) => x.id === decisionId);
  if (!d) throw new Error(`La decisión ${decisionId} no aplica en este momento.`);
  if (d.kind === "single" && (typeof value !== "string" || !d.options.some((o) => o.id === value))) throw new Error("Opción no válida.");
  if (d.kind === "multi" && !Array.isArray(value)) throw new Error("Selección no válida.");
  return { ...s, answers: { ...s.answers, [decisionId]: value }, confirmed: [...s.confirmed, decisionId] };
}
