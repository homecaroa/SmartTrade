import { STAGES, type ExportScenario } from "@/lib/learning/export/types";
import type { ExportEvaluation } from "@/lib/learning/export/evaluation";
import { fmtPctLearning } from "@/lib/learning/money";
import { CostTable } from "./cost-table";
import { GradeBadge } from "./grade-badge";
import { SimulatedNotice } from "./simulated-notice";

/** Resumen final: nota de conocimientos y resultado económico, por separado, y revisión de todas las decisiones. */
export function ExportSummary({ sc, ev, onRestart }: { sc: ExportScenario; ev: ExportEvaluation; onRestart: () => void }) {
  const h = "text-base font-semibold";
  return (
    <section className="space-y-4" aria-labelledby="resumen-final">
      <h2 id="resumen-final" tabIndex={-1} className="text-lg font-bold">Resumen de la operación</h2>
      <SimulatedNotice compact />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className={h}>Nota de conocimientos</h3>
          <p className="text-3xl font-bold text-indigo-700">{fmtPctLearning(ev.knowledge.pct, 0)}</p>
          <p className="text-xs text-slate-600">{ev.knowledge.points} de {ev.knowledge.max} puntos. Criterio: decisión adecuada 10, razonable con inconvenientes 6, error importante 0.</p>
          <ul className="mt-2 space-y-1 text-sm">{ev.knowledge.byStage.map((s) => <li key={s.stage} className="flex justify-between gap-2"><span>{s.title}</span><span className="tabular-nums">{s.points}/{s.max}</span></li>)}</ul>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className={h}>Resultado económico</h3>
          <p className={`text-3xl font-bold ${ev.economics.margin < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtPctLearning(ev.economics.marginPct)}</p>
          <p className="text-xs text-slate-600">Margen sobre ventas; objetivo del caso: {sc.targetMarginPct} % ({ev.marginVsTarget >= 0 ? "+" : ""}{ev.marginVsTarget.toLocaleString("es-ES")} puntos).</p>
          <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">La nota y el margen se valoran por separado: una operación rentable puede tener decisiones arriesgadas o incorrectas, y una decisión prudente no siempre maximiza el beneficio.</p>
        </div>
      </div>

      {ev.graveErrors.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <h3 className={h}>Errores importantes y recomendaciones</h3>
          <ul className="mt-2 space-y-2 text-sm">{ev.graveErrors.map((r) => <li key={r.decisionId}><b>{r.title}:</b> elegiste «{r.answer}». {r.feedback.join(" ")} <span className="block text-emerald-900">Recomendación: {r.best}. {r.why}</span></li>)}</ul>
        </div>
      )}
      {ev.issues.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className={h}>Contradicciones y riesgos detectados</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{ev.issues.map((i) => <li key={i.message}><b>{i.severity === "contradiccion" ? "Contradicción" : "Aviso"}:</b> {i.message}</li>)}</ul>
        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className={h}>Liquidación económica</h3>
        <CostTable r={ev.economics} unit={sc.quantity.unit} units={sc.quantity.units} targetMarginPct={sc.targetMarginPct} />
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className={h}>Revisión de tus decisiones</h3>
        <ol className="mt-2 space-y-3 text-sm">
          {ev.review.map((r) => (
            <li key={r.decisionId} className="rounded border border-slate-200 p-2">
              <p className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">{STAGES.find((s) => s.id === r.stage)?.title}</span><b>{r.title}</b><GradeBadge grade={r.grade} /></p>
              <p>Tu elección: {r.answer}</p>
              <p className="text-slate-700">{r.feedback.join(" ")}</p>
              {r.grade !== "correcta" && <p className="text-emerald-900">Más adecuado: {r.best}. {r.why}</p>}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={onRestart} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Repetir el caso</button>
        <a href="/aprendizaje" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Volver al Modo Aprendizaje</a>
      </div>
    </section>
  );
}
