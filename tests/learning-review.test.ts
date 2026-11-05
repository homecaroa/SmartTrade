import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shipmentOf } from "@/lib/learning/export/costs";
import { answerAndConfirm, ctxOf, newSession, pendingDecision, resolve, stagesFor, type ExportSession } from "@/lib/learning/export/engine";
import { evaluateExport } from "@/lib/learning/export/evaluation";
import { answerReview, pendingReview, reviewKey, reviewScore, reviewsFor, STAGE_REVIEW } from "@/lib/learning/export/review";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { STAGES, type ExportScenario } from "@/lib/learning/export/types";
import { assessRoutes } from "@/lib/learning/logistics/assess";

/** Propuesta 9 (04/11/2026): repaso de conceptos al cerrar cada etapa, puntuado aparte de la nota. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sc = (id: string) => EXPORT_SCENARIOS.find((s) => s.id === id)!;
const next = (s: ExportScenario, x: ExportSession) => {
  const d = pendingDecision(s, x)!;
  const ctx = ctxOf(s, x.answers);
  const v = d.kind === "multi" ? resolve(d.docs, ctx).filter((o) => o.need === "obligatorio" || o.need === "recomendado").map((o) => o.id)
    : d.kind === "route" ? assessRoutes(shipmentOf(s)).best.id : d.kind === "justify" ? [s.logistics.decisiveReason, "plazo"] : resolve(d.best, ctx);
  return answerAndConfirm(s, x, d.id, v);
};
const allCorrect = (stage: (typeof STAGES)[number]["id"]) => Object.fromEntries(reviewsFor(stage).map((q) => [q.id, q.correct]));

describe("banco de preguntas", () => {
  it("dos preguntas por etapa, con ids únicos, tres opciones y la correcta entre ellas", () => {
    for (const st of STAGES) expect(reviewsFor(st.id), st.id).toHaveLength(2);
    expect(new Set(STAGE_REVIEW.map((q) => q.id)).size).toBe(STAGE_REVIEW.length);
    for (const q of STAGE_REVIEW) { expect(q.options).toHaveLength(3); expect(q.options.some((o) => o.id === q.correct)).toBe(true); expect(q.explain.length).toBeGreaterThan(20); }
  });
});

describe("cuándo aparece y cómo se guarda", () => {
  it("solo al terminar una etapa; hasta responderlo no se pasa de largo, y después espera a la siguiente etapa", () => {
    const s = sc("vino-japon");
    let x = newSession(s.id, new Date(0));
    expect(pendingReview(s, x)).toBeNull();
    x = next(s, x); // la ficha tiene una decisión
    expect(pendingReview(s, x)).toBe("ficha");
    expect(() => answerReview(s, x, "ficha", { "ficha-1": "aranceles" })).toThrow(); // hay que responder las dos
    expect(() => answerReview(s, x, "contrato", allCorrect("contrato"))).toThrow(); // etapa sin terminar
    x = answerReview(s, x, "ficha", { "ficha-1": "aranceles", "ficha-2": "exacto" });
    expect(x.answers[reviewKey("ficha-2")]).toBe("exacto");
    expect(pendingReview(s, x)).toBeNull();
    expect(reviewScore(s, x)).toMatchObject({ correct: 1, answered: 2 });
  });
  it("el total son dos preguntas por cada etapa del caso", () => {
    for (const s of EXPORT_SCENARIOS) expect(reviewScore(s, newSession(s.id)).total, s.id).toBe(stagesFor(s, {}).length * 2);
  });
  it("no cambia la nota de conocimientos ni la operación; el resumen da los aciertos aparte", () => {
    const s = sc("aceitunas-nueva-york");
    let x = newSession(s.id, new Date(0));
    let y = x;
    while (pendingDecision(s, x)) {
      x = next(s, x); y = next(s, y);
      const st = pendingReview(s, y);
      if (st) y = answerReview(s, y, st, allCorrect(st));
    }
    const a = evaluateExport(s, x), b = evaluateExport(s, y);
    expect(b.knowledge).toEqual(a.knowledge);
    expect(b.economics.margin).toBe(a.economics.margin);
    expect(b.quiz).toEqual({ correct: b.quiz.total, answered: b.quiz.total, total: stagesFor(s, y.answers).length * 2 });
    expect(a.quiz.answered).toBe(0);
  });
});

describe("punto de llamada: la pantalla", () => {
  it("el simulador muestra el repaso pendiente antes de la siguiente decisión y guarda con answerReview", () => {
    const src = sinComentarios(readFileSync("components/learning/export-simulator.tsx", "utf8"));
    expect(src).toMatch(/const reviewStage = pendingReview\(sc, session\)/);
    expect(src).toMatch(/\) : reviewStage \? \(\s*<StageReview[\s\S]*?onSubmit=\{\(picks\) => \{ setSession\(answerReview\(sc, session, reviewStage, picks\)\)/);
    expect(src.indexOf(") : reviewStage ? (")).toBeLessThan(src.indexOf(") : pending ? ("));
    const card = sinComentarios(readFileSync("components/learning/stage-review.tsx", "utf8"));
    expect(card).toMatch(/displayOrder\(q\.options/); // opciones mezcladas: la correcta va primera en los datos
    expect(sinComentarios(readFileSync("components/learning/export-summary.tsx", "utf8"))).toMatch(/ev\.quiz\.correct/);
  });
});
