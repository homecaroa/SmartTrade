import { gradeDoc, type GradedAnswer } from "../export/engine";
import { POINTS } from "../export/evaluation";
import { round2 } from "../money";
import { computeImport, type ImportResult } from "./costs";
import { IMPORT_STAGES, type IDyn, type ImportAnswers, type ImportCtx, type ImportDecision, type ImportOption, type ImportScenario, type ImportStageId } from "./types";

/** Motor del simulador de importación. Puro y determinista: mismo caso y respuestas → mismo resultado. */
export const iresolve = <T>(v: IDyn<T>, ctx: ImportCtx): T => (typeof v === "function" ? (v as (c: ImportCtx) => T)(ctx) : v);

export function visibleImportDecisions(sc: ImportScenario, answers: ImportAnswers): ImportDecision[] {
  const ctx = { scenario: sc, answers };
  const order = (s: ImportStageId) => IMPORT_STAGES.findIndex((x) => x.id === s);
  return sc.decisions.filter((d) => !d.appliesIf || d.appliesIf(ctx)).sort((a, b) => order(a.stage) - order(b.stage));
}

export const optionsOf = (d: ImportDecision & { kind: "single" }, ctx: ImportCtx): ImportOption[] => iresolve(d.options, ctx);

export function gradeImport(sc: ImportScenario, d: ImportDecision, answers: ImportAnswers): GradedAnswer | null {
  const ctx = { scenario: sc, answers };
  const a = answers[d.id];
  if (a === undefined) return null;
  if (d.kind === "multi") return gradeDoc(iresolve(d.docs, ctx), Array.isArray(a) ? a : [], d.allRight);
  const opts = optionsOf(d, ctx);
  const opt = opts.find((o) => o.id === a);
  if (!opt) return null;
  const bestId = iresolve(d.best, ctx);
  return { grade: iresolve(opt.grade, ctx), feedback: [iresolve(opt.feedback, ctx)], best: opts.find((o) => o.id === bestId)?.label ?? bestId, why: iresolve(d.whyBest, ctx) };
}

export function importExtras(sc: ImportScenario, answers: ImportAnswers) {
  const ctx = { scenario: sc, answers };
  const out: { label: string; amount: number; note: string }[] = [];
  for (const d of visibleImportDecisions(sc, answers)) {
    if (d.kind !== "single") continue;
    const c = optionsOf(d, ctx).find((o) => o.id === answers[d.id])?.extraCost?.(ctx);
    if (c) out.push(c);
  }
  return out;
}

/** Sesión guardada en el navegador. `confirmed` = decisiones cuya consecuencia ya vio el alumno (no se cambian). */
export interface ImportSession { v: 1; module: "importacion"; caseId: string; answers: ImportAnswers; confirmed: string[]; startedAt: string }

export const newImportSession = (caseId: string, now = new Date()): ImportSession => ({ v: 1, module: "importacion", caseId, answers: {}, confirmed: [], startedAt: now.toISOString() });

export function isImportSession(x: unknown, caseId: string): x is ImportSession {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<ImportSession>;
  return s.v === 1 && s.module === "importacion" && s.caseId === caseId && !!s.answers && typeof s.answers === "object" && Array.isArray(s.confirmed) && typeof s.startedAt === "string";
}

export const pendingImport = (sc: ImportScenario, s: ImportSession) => visibleImportDecisions(sc, s.answers).find((d) => !s.confirmed.includes(d.id)) ?? null;

export function importProgress(sc: ImportScenario, s: ImportSession) {
  const vis = visibleImportDecisions(sc, s.answers);
  const done = vis.filter((d) => s.confirmed.includes(d.id)).length;
  return { done, total: vis.length, complete: done === vis.length };
}

export function confirmImport(sc: ImportScenario, s: ImportSession, decisionId: string, value: string | string[]): ImportSession {
  if (s.confirmed.includes(decisionId)) return s;
  const d = visibleImportDecisions(sc, s.answers).find((x) => x.id === decisionId);
  if (!d) throw new Error(`La decisión ${decisionId} no aplica en este momento.`);
  if (d.kind === "single" && (typeof value !== "string" || !optionsOf(d, { scenario: sc, answers: s.answers }).some((o) => o.id === value))) throw new Error("Opción no válida.");
  if (d.kind === "multi" && !Array.isArray(value)) throw new Error("Selección no válida.");
  return { ...s, answers: { ...s.answers, [decisionId]: value }, confirmed: [...s.confirmed, decisionId] };
}

export interface ImportReviewItem { decisionId: string; stage: ImportStageId; title: string; answer: string; grade: GradedAnswer["grade"]; feedback: string[]; best: string; why: string; incident: boolean }
export interface ImportEvaluation {
  knowledge: { points: number; max: number; pct: number; byStage: { stage: ImportStageId; title: string; points: number; max: number }[] };
  review: ImportReviewItem[];
  graveErrors: ImportReviewItem[];
  economics: ImportResult;
  marginVsTarget: number;
}

/** Nota de conocimientos (10/6/0, como en exportación) y, aparte, resultado económico. */
export function evaluateImport(sc: ImportScenario, s: ImportSession): ImportEvaluation {
  const ctx = { scenario: sc, answers: s.answers };
  const review: ImportReviewItem[] = [];
  for (const d of visibleImportDecisions(sc, s.answers)) {
    if (!s.confirmed.includes(d.id)) continue;
    const g = gradeImport(sc, d, s.answers);
    if (!g) continue;
    const a = s.answers[d.id];
    const answer = d.kind === "single" ? optionsOf(d, ctx).find((o) => o.id === a)?.label ?? String(a)
      : (iresolve(d.docs, ctx).filter((x) => (a as string[]).includes(x.id)).map((x) => x.label).join(", ") || "Nada seleccionado");
    review.push({ decisionId: d.id, stage: d.stage, title: d.title, answer, grade: g.grade, feedback: g.feedback, best: g.best, why: g.why, incident: !!d.incident });
  }
  const points = review.reduce((acc, r) => acc + POINTS[r.grade], 0);
  const max = review.length * POINTS.correcta;
  const byStage = IMPORT_STAGES.filter((st) => review.some((r) => r.stage === st.id)).map((st) => {
    const rs = review.filter((r) => r.stage === st.id);
    return { stage: st.id, title: st.title, points: rs.reduce((acc, r) => acc + POINTS[r.grade], 0), max: rs.length * POINTS.correcta };
  });
  const economics = computeImport(sc, s.answers, importExtras(sc, s.answers));
  return { knowledge: { points, max, pct: max ? round2(points / max * 100) : 0, byStage }, review, graveErrors: review.filter((r) => r.grade === "grave"), economics, marginVsTarget: round2(economics.marginPct - sc.targetMarginPct) };
}
