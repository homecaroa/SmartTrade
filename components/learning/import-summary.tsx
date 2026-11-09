import type { ImportEvaluation } from "@/lib/learning/import/engine";
import { IMPORT_STAGES, type ImportScenario } from "@/lib/learning/import/types";
import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import { GradeBadge } from "./grade-badge";
import { SimulatedNotice } from "./simulated-notice";

/** Resumen final de la importación: nota de conocimientos y coste puesto en almacén, por separado. */
export function ImportSummary({ sc, ev, onRestart }: { sc: ImportScenario; ev: ImportEvaluation; onRestart: () => void }) {
  const h = "text-base font-semibold";
  const e = ev.economics;
  return (
    <section className="space-y-4" aria-labelledby="resumen-final">
      <h2 id="resumen-final" tabIndex={-1} className="text-lg font-bold">Resumen de la importación</h2>
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
          <p className={`text-3xl font-bold ${e.margin < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtPctLearning(e.marginPct)}</p>
          <p className="text-xs text-slate-600">Margen sobre ventas a {fmtEur(sc.resaleUnitPrice)} por {sc.quantity.unit}; objetivo: {sc.targetMarginPct} % ({ev.marginVsTarget >= 0 ? "+" : ""}{ev.marginVsTarget.toLocaleString("es-ES")} puntos). Coste puesto en almacén: <b>{fmtEur(e.landedUnit)}</b> por {sc.quantity.unit}.</p>
        </div>
      </div>

      {ev.graveErrors.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <h3 className={h}>Errores importantes y recomendaciones</h3>
          <ul className="mt-2 space-y-2 text-sm">{ev.graveErrors.map((r) => <li key={r.decisionId}><b>{r.title}:</b> elegiste «{r.answer}». {r.feedback.join(" ")} <span className="block text-emerald-900">Recomendación: {r.best}. {r.why}</span></li>)}</ul>
        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className={h}>Coste puesto en almacén</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[28rem] text-sm">
            <caption className="text-left text-xs text-slate-600">Proveedor: {e.supplier.label} ({e.supplier.origin}) · {e.incoterm} · importes simulados en euros</caption>
            <thead><tr className="border-b text-left"><th scope="col" className="py-1 pr-2">Concepto</th><th scope="col" className="py-1 pr-2 text-right">Importe</th></tr></thead>
            <tbody>
              {e.lines.map((l, i) => <tr key={`${l.key}-${i}`} className="border-b border-slate-100 align-top"><td className="py-1 pr-2">{l.label}<span className="block text-xs text-slate-500">{l.note}</span></td><td className="py-1 pr-2 text-right tabular-nums">{fmtEur(l.amount)}</td></tr>)}
              <tr className="font-semibold"><td className="py-1 pr-2">Total puesto en almacén</td><td className="py-1 pr-2 text-right tabular-nums">{fmtEur(e.landed)}</td></tr>
              <tr><td className="py-1 pr-2">Ventas a tiendas</td><td className="py-1 pr-2 text-right tabular-nums">{fmtEur(e.revenue)}</td></tr>
              <tr className="font-semibold"><td className="py-1 pr-2">Margen</td><td className="py-1 pr-2 text-right tabular-nums">{fmtEur(e.margin)}</td></tr>
            </tbody>
          </table>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-600">Valor en aduana</dt><dd className="font-semibold">{fmtEur(e.customsValue)}</dd></div>
          <div><dt className="text-slate-600">Base del IVA a la importación</dt><dd className="font-semibold">{fmtEur(e.vatBase)}</dd></div>
          <div><dt className="text-slate-600">IVA a la importación</dt><dd className="font-semibold">{fmtEur(e.vat)}</dd><dd className="text-xs text-slate-600">{e.vatDeferred ? "Diferido a tu declaración mensual: no adelantas tesorería." : "Pagado al despachar y recuperado después."} Es recuperable: no es coste.</dd></div>
        </dl>
      </div>

      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className={h}>Revisión de tus decisiones</h3>
        <ol className="mt-2 space-y-3 text-sm">
          {ev.review.map((r) => (
            <li key={r.decisionId} className="rounded border border-slate-200 p-2">
              <p className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">{IMPORT_STAGES.find((s) => s.id === r.stage)?.title}</span><b>{r.title}</b><GradeBadge grade={r.grade} /></p>
              <p>Tu elección: {r.answer}</p>
              <p className="text-slate-700">{r.feedback.join(" ")}</p>
              {r.grade !== "correcta" && <p className="text-emerald-900">Más adecuado: {r.best}. {r.why}</p>}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={onRestart} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Repetir el caso</button>
        <a href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Volver a los casos</a>
      </div>
    </section>
  );
}
