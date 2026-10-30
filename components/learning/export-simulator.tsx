"use client";

import { useEffect, useRef, useState } from "react";
import { computeOperation, routeOf, shipmentOf } from "@/lib/learning/export/costs";
import { answerAndConfirm, ctxOf, extrasFrom, gradeAnswer, isExportSession, newSession, pendingDecision, progress, stagesFor, visibleDecisions, type ExportSession } from "@/lib/learning/export/engine";
import { evaluateExport } from "@/lib/learning/export/evaluation";
import { exportScenario } from "@/lib/learning/export/scenarios";
import { validateOperation } from "@/lib/learning/export/validation";
import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import { clearState, loadState, saveState, storageKey } from "@/lib/learning/storage";
import { ExportDecision } from "./export-decision";
import { ExportSummary } from "./export-summary";
import { GradeBadge } from "./grade-badge";
import { IncotermObligations, LogisticsNotice, QuoteView } from "./logistics-tables";
import { FactList, ProvenanceLegend } from "./provenance-badge";
import { SimulatedNotice } from "./simulated-notice";
import { StageProgress } from "./stage-progress";

export function ExportSimulator({ caseId }: { caseId: string }) {
  const sc = exportScenario(caseId);
  const key = storageKey("exportacion", caseId);
  const [session, setSession] = useState<ExportSession | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSession(loadState(key, (x): x is ExportSession => isExportSession(x, caseId)) ?? newSession(caseId)); }, [key, caseId]);
  useEffect(() => { if (session) saveState(key, session); }, [key, session]);
  useEffect(() => { if (shown) feedbackRef.current?.focus(); }, [shown]);

  if (!sc) return <p>Caso no encontrado.</p>;
  if (!session) return <p className="text-sm text-slate-600">Cargando la simulación…</p>;

  const pending = pendingDecision(sc, session);
  const prog = progress(sc, session);
  const stages = stagesFor(sc, session.answers);
  const currentStage = shown ? visibleDecisions(sc, session.answers).find((d) => d.id === shown)?.stage : pending?.stage;
  const stageItems = stages.map((st) => {
    const ds = visibleDecisions(sc, session.answers).filter((d) => d.stage === st.id);
    const done = ds.every((d) => session.confirmed.includes(d.id));
    return { id: st.id, title: st.title, state: (st.id === currentStage && !(done && !shown) ? "actual" : done ? "hecha" : "pendiente") as "actual" | "hecha" | "pendiente" };
  });
  const ctx = ctxOf(sc, session.answers);
  const restart = () => {
    if (session.confirmed.length && !window.confirm("¿Reiniciar el caso? Se borrarán tus decisiones de esta sesión.")) return;
    clearState(key);
    setShown(null);
    setSession(newSession(caseId));
  };
  const shownDecision = shown ? visibleDecisions(sc, session.answers).find((d) => d.id === shown) ?? sc.decisions.find((d) => d.id === shown) : null;
  const graded = shownDecision ? gradeAnswer(sc, shownDecision, session.answers) : null;
  const provisional = ctx.settings.incoterm ? computeOperation(sc, ctx.settings, extrasFrom(sc, session.answers)) : null;
  const issues = validateOperation(sc, ctx.settings);

  return (
    <div className="space-y-4">
      <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Operación de exportación · dificultad {sc.difficulty}</p>
        <h1 className="text-xl font-bold">{sc.title}</h1>
        <p className="text-sm"><b>Objetivo de aprendizaje:</b> {sc.learningGoal}</p>
        <details open={session.confirmed.length === 0} className="text-sm">
          <summary className="cursor-pointer font-medium">Instrucciones</summary>
          <ul className="mt-1 list-disc pl-5">{sc.instructions.map((i) => <li key={i}>{i}</li>)}</ul>
        </details>
        <SimulatedNotice compact />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StageProgress items={stageItems} label="Etapas de la operación" />
          <p className="text-xs text-slate-600">{prog.done} de {prog.total} decisiones</p>
        </div>
      </header>

      <details open={session.confirmed.length === 0} className="rounded-lg bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold">Ficha de la operación</summary>
        <div className="mt-2 space-y-2 text-sm">
          <p><b>Exportador:</b> {sc.company.name}, {sc.company.city}. {sc.company.description}</p>
          <p><b>Comprador:</b> {sc.buyer.name}, {sc.buyer.city}. {sc.buyer.description}</p>
          <p><b>Mercancía:</b> {sc.quantity.detail}.</p>
          <ProvenanceLegend />
          <FactList facts={sc.facts} />
        </div>
      </details>

      <div ref={stepRef} aria-live="polite">
        {shown && shownDecision && graded ? (
          <section className="space-y-2 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
            <h2 ref={feedbackRef} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-base font-semibold">Consecuencia: {shownDecision.title} <GradeBadge grade={graded.grade} /></h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">{graded.feedback.map((f) => <li key={f}>{f}</li>)}</ul>
            {graded.grade !== "correcta" && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900"><b>Lo más adecuado:</b> {graded.best}. {graded.why}</p>}
            {shownDecision.id === "incoterm" && ctx.settings.incoterm && <IncotermObligations code={ctx.settings.incoterm} route={routeOf(sc, ctx.settings.transport)} />}
            {shownDecision.kind === "justify" && provisional && <><QuoteView c={shipmentOf(sc)} q={provisional.quote} title="Tu presupuesto logístico" /><LogisticsNotice /></>}
            {issues.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-900">{issues.map((i) => <li key={i.message}>{i.severity === "contradiccion" ? "Contradicción" : "Aviso"}: {i.message}</li>)}</ul>}
            <button type="button" onClick={() => setShown(null)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">{pending ? "Continuar" : "Ver el resumen final"}</button>
          </section>
        ) : pending ? (
          <ExportDecision key={pending.id} sc={sc} d={pending} answers={session.answers} onConfirm={(v) => { setSession(answerAndConfirm(sc, session, pending.id, v)); setShown(pending.id); }} />
        ) : (
          <ExportSummary sc={sc} ev={evaluateExport(sc, session)} onRestart={restart} />
        )}
      </div>

      {provisional && pending && (
        <aside className="rounded-lg bg-white p-4 text-sm shadow-sm" aria-label="Situación económica provisional">
          <h2 className="text-base font-semibold">Situación económica provisional</h2>
          <p>Con {provisional.incoterm.code}: precio {fmtEur(provisional.unitPrice)} por {sc.quantity.unit}, ingresos {fmtEur(provisional.revenue)}, margen previsto <b>{fmtEur(provisional.margin)} ({fmtPctLearning(provisional.marginPct)})</b> con lo decidido hasta ahora (objetivo {sc.targetMarginPct} %). Importes simulados.</p>
        </aside>
      )}

      {session.confirmed.length > 0 && pending && (
        <details className="rounded-lg bg-white p-4 text-sm shadow-sm">
          <summary className="cursor-pointer font-semibold">Decisiones tomadas ({session.confirmed.length})</summary>
          <ol className="mt-2 space-y-1">
            {visibleDecisions(sc, session.answers).filter((d) => session.confirmed.includes(d.id)).map((d) => {
              const g = gradeAnswer(sc, d, session.answers);
              return <li key={d.id} className="flex flex-wrap items-center gap-2">{d.title}{g && <GradeBadge grade={g.grade} />}</li>;
            })}
          </ol>
        </details>
      )}
      <div className="print:hidden">
        <button type="button" onClick={restart} className="text-xs text-slate-600 underline">Reiniciar este caso</button>
      </div>
    </div>
  );
}
