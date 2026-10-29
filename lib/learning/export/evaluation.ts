import { round2 } from "../money";
import { computeOperation, type OperationResult } from "./costs";
import { ctxOf, extrasFrom, gradeAnswer, resolve, visibleDecisions, type ExportSession } from "./engine";
import { validateOperation, type Issue } from "./validation";
import { STAGES, type ExportScenario, type Grade, type StageId } from "./types";

/**
 * Evaluación del simulador de exportación. Separa a propósito:
 * - NOTA DE CONOCIMIENTOS: calidad de las decisiones (criterios visibles: correcta 10, razonable 6, error grave 0).
 * - RESULTADO ECONÓMICO: margen de la operación. Una operación rentable puede estar mal ejecutada, y al revés.
 */
export const POINTS: Record<Grade, number> = { correcta: 10, razonable: 6, grave: 0 };

export interface ReviewItem { decisionId: string; stage: StageId; title: string; answer: string; grade: Grade; feedback: string[]; best: string; why: string; incident: boolean }

export interface ExportEvaluation {
  knowledge: { points: number; max: number; pct: number; byStage: { stage: StageId; title: string; points: number; max: number }[] };
  review: ReviewItem[];
  graveErrors: ReviewItem[];
  economics: OperationResult;
  marginVsTarget: number;
  issues: Issue[];
}

export function evaluateExport(sc: ExportScenario, s: ExportSession): ExportEvaluation {
  const ctx = ctxOf(sc, s.answers);
  const review: ReviewItem[] = [];
  for (const d of visibleDecisions(sc, s.answers)) {
    if (!s.confirmed.includes(d.id)) continue;
    const g = gradeAnswer(sc, d, s.answers);
    if (!g) continue;
    const a = s.answers[d.id];
    const answer = d.kind === "single" ? d.options.find((o) => o.id === a)?.label ?? String(a) : (() => {
      const docs = resolve(d.docs, ctx);
      const chosen = docs.filter((x) => (a as string[]).includes(x.id)).map((x) => x.label);
      return chosen.length ? chosen.join(", ") : "Ningún documento";
    })();
    review.push({ decisionId: d.id, stage: d.stage, title: d.title, answer, grade: g.grade, feedback: g.feedback, best: g.best, why: g.why, incident: !!d.incident });
  }
  const points = review.reduce((a, r) => a + POINTS[r.grade], 0);
  const max = review.length * POINTS.correcta;
  const byStage = STAGES.filter((st) => review.some((r) => r.stage === st.id)).map((st) => {
    const rs = review.filter((r) => r.stage === st.id);
    return { stage: st.id, title: st.title, points: rs.reduce((a, r) => a + POINTS[r.grade], 0), max: rs.length * POINTS.correcta };
  });
  const economics = computeOperation(sc, ctx.settings, extrasFrom(sc, s.answers));
  return {
    knowledge: { points, max, pct: max ? round2((points / max) * 100) : 0, byStage },
    review,
    graveErrors: review.filter((r) => r.grade === "grave"),
    economics,
    marginVsTarget: round2(economics.marginPct - sc.targetMarginPct),
    issues: validateOperation(sc, ctx.settings),
  };
}
