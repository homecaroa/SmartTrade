"use client";

import { useEffect, useRef, useState } from "react";
import { computeImport } from "@/lib/learning/import/costs";
import { confirmImport, evaluateImport, gradeImport, importExtras, importProgress, isImportSession, newImportSession, pendingImport, visibleImportDecisions, type ImportSession } from "@/lib/learning/import/engine";
import { importScenario } from "@/lib/learning/import/scenarios";
import { IMPORT_STAGES } from "@/lib/learning/import/types";
import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import { clearState, loadState, saveState, storageKey } from "@/lib/learning/storage";
import { GradeBadge } from "./grade-badge";
import { ImportDecision } from "./import-decision";
import { ImportSummary } from "./import-summary";
import { FactList, ProvenanceLegend } from "./provenance-badge";
import { SimulatedNotice } from "./simulated-notice";
import { StageProgress } from "./stage-progress";

export function ImportSimulator({ caseId }: { caseId: string }) {
  const sc = importScenario(caseId);
  const key = storageKey("importacion", caseId);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { setSession(loadState(key, (x): x is ImportSession => isImportSession(x, caseId)) ?? newImportSession(caseId)); }, [key, caseId]);
  useEffect(() => { if (session) saveState(key, session); }, [key, session]);
  useEffect(() => { if (shown) feedbackRef.current?.focus(); }, [shown]);

  if (!sc) return <p>Caso no encontrado.</p>;
  if (!session) return <p className="text-sm text-slate-600">Cargando la simulación…</p>;

  const visible = visibleImportDecisions(sc, session.answers);
  const pending = pendingImport(sc, session);
  const prog = importProgress(sc, session);
  const currentStage = shown ? visible.find((d) => d.id === shown)?.stage : pending?.stage;
  const stageItems = IMPORT_STAGES.filter((st) => visible.some((d) => d.stage === st.id)).map((st) => {
    const done = visible.filter((d) => d.stage === st.id).every((d) => session.confirmed.includes(d.id));
    return { id: st.id, title: st.title, state: (st.id === currentStage && !(done && !shown) ? "actual" : done ? "hecha" : "pendiente") as "actual" | "hecha" | "pendiente" };
  });
  const restart = () => {
    if (session.confirmed.length && !window.confirm("¿Reiniciar el caso? Se borrarán tus decisiones de esta sesión.")) return;
    clearState(key);
    setShown(null);
    setSession(newImportSession(caseId));
  };
  const shownDecision = shown ? visible.find((d) => d.id === shown) ?? null : null;
  const graded = shownDecision ? gradeImport(sc, shownDecision, session.answers) : null;
  const provisional = session.answers.proveedor ? computeImport(sc, session.answers, importExtras(sc, session.answers)) : null;

  return (
    <div className="space-y-4">
      <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Operación de importación · dificultad {sc.difficulty}</p>
        <h1 className="text-xl font-bold">{sc.title}</h1>
        <p className="text-sm"><b>Objetivo de aprendizaje:</b> {sc.learningGoal}</p>
        <details open={session.confirmed.length === 0} className="text-sm">
          <summary className="cursor-pointer font-medium">Instrucciones</summary>
          <ul className="mt-1 list-disc pl-5">{sc.instructions.map((i) => <li key={i}>{i}</li>)}</ul>
        </details>
        <SimulatedNotice compact />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StageProgress items={stageItems} label="Etapas de la importación" />
          <p className="text-xs text-slate-600">{prog.done} de {prog.total} decisiones</p>
        </div>
      </header>

      <details open={session.confirmed.length === 0} className="rounded-lg bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold">Ficha de la operación</summary>
        <div className="mt-2 space-y-2 text-sm">
          <p><b>Importador (tú):</b> {sc.importer.name}, {sc.importer.city}. {sc.importer.description}</p>
          <p><b>Mercancía:</b> {sc.quantity.detail}.</p>
          <ProvenanceLegend />
          <FactList facts={sc.facts} />
        </div>
      </details>

      <div aria-live="polite">
        {shown && shownDecision && graded ? (
          <section className="space-y-2 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
            <h2 ref={feedbackRef} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-base font-semibold">Consecuencia: {shownDecision.title} <GradeBadge grade={graded.grade} /></h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">{graded.feedback.map((f) => <li key={f}>{f}</li>)}</ul>
            {graded.grade !== "correcta" && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900"><b>Lo más adecuado:</b> {graded.best}. {graded.why}</p>}
            <button type="button" onClick={() => setShown(null)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">{pending ? "Continuar" : "Ver el resumen final"}</button>
          </section>
        ) : pending ? (
          <ImportDecision key={pending.id} sc={sc} d={pending} answers={session.answers} onConfirm={(v) => { setSession(confirmImport(sc, session, pending.id, v)); setShown(pending.id); }} />
        ) : (
          <ImportSummary sc={sc} ev={evaluateImport(sc, session)} onRestart={restart} />
        )}
      </div>

      {provisional && pending && (
        <aside className="rounded-lg bg-white p-4 text-sm shadow-sm" aria-label="Situación económica provisional">
          <h2 className="text-base font-semibold">Situación económica provisional</h2>
          <p>Con lo decidido hasta ahora: coste puesto en almacén <b>{fmtEur(provisional.landedUnit)}</b> por {sc.quantity.unit}, margen previsto <b>{fmtEur(provisional.margin)} ({fmtPctLearning(provisional.marginPct)})</b> vendiendo a {fmtEur(sc.resaleUnitPrice)} (objetivo {sc.targetMarginPct} %). Importes simulados.</p>
        </aside>
      )}

      {session.confirmed.length > 0 && pending && (
        <details className="rounded-lg bg-white p-4 text-sm shadow-sm">
          <summary className="cursor-pointer font-semibold">Decisiones tomadas ({session.confirmed.length})</summary>
          <ol className="mt-2 space-y-1">
            {visible.filter((d) => session.confirmed.includes(d.id)).map((d) => {
              const g = gradeImport(sc, d, session.answers);
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
