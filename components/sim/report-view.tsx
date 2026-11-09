"use client";

import { useState } from "react";
import { knowledge, MONTH_QUESTION, serviceLevelToDate } from "@/lib/sim/engine";
import type { Action, SimState } from "@/lib/sim/model";
import { WEEKS_PER_MONTH } from "@/lib/sim/params";
import { fmtEur } from "@/lib/learning/money";
import { displayOrder } from "@/lib/learning/order";
import { GradeBadge } from "../learning/grade-badge";

const COMPETENCE: Record<string, string> = {
  "0622-RA2": "Transporte: elegir medios y capacidad",
  "0622-RA3": "Transporte: costes y tarifas",
  "0622-RA6": "Transporte: incidencias",
  "0623-RA5": "Gestión económica: cobros y pagos",
  "0623-RA6": "Gestión económica: contabilidad",
  "0623-RA7": "Gestión económica: rentabilidad",
  "0625-RA3": "Almacén: presupuesto y costes",
};

/** Informe del mes (con su pregunta) y resumen final: nota de decisiones, resultado empresarial y competencias, por separado. */
export function ReportView({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  const done = s.status === "fin" || s.status === "quiebra";
  const month = s.weeks.slice(0, WEEKS_PER_MONTH);
  const k = knowledge(s);
  const byCompetence = new Map<string, { n: number; pts: number }>();
  for (const e of s.learning) for (const c of e.competences) { const x = byCompetence.get(c) ?? { n: 0, pts: 0 }; x.n++; x.pts += e.grade === "correcta" ? 10 : e.grade === "razonable" ? 6 : 0; byCompetence.set(c, x); }
  const own = s.weeks.reduce((a, w) => a + w.kmOwn, 0);
  const capacity = s.weeks.reduce((a, w) => a + w.kmCapacity, 0);
  return (
    <div className="space-y-4">
      {s.weeks.length >= WEEKS_PER_MONTH ? (
        <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="mes1">
          <h2 id="mes1" className="text-base font-semibold">Informe del primer mes (semanas 1–4)</h2>
          <p className="text-sm">Resultado del mes: <b>{fmtEur(month.reduce((a, w) => a + w.result, 0))}</b> · caja al cerrar la semana 4: <b>{fmtEur(month[month.length - 1].cashEnd)}</b> · cobrado en el mes: {fmtEur(month.reduce((a, w) => a + w.collections, 0))}.</p>
          {!s.answers[MONTH_QUESTION.id] ? <MonthQuestion s={s} onAction={onAction} /> : s.answers[MONTH_QUESTION.id] && (() => {
            const e = s.learning.find((l) => l.what.startsWith("Informe del mes"));
            return e ? <p className="rounded bg-slate-50 p-2 text-sm"><span className="flex flex-wrap items-center gap-2"><b>Tu respuesta:</b> {e.answer} <GradeBadge grade={e.grade} /></span>{e.feedback}</p> : null;
          })()}
        </section>
      ) : <p className="rounded-lg bg-white p-4 text-sm text-slate-600 shadow-sm">El informe del mes aparece al cerrar la semana 4.</p>}

      {done && (
        <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="resumen">
          <h2 id="resumen" className="text-lg font-bold">Resumen final de la fase 1</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-slate-200 p-3"><h3 className="text-sm font-semibold">Nota de decisiones</h3><p className="text-2xl font-bold text-indigo-700">{k.pct.toLocaleString("es-ES")} %</p><p className="text-xs text-slate-600">{k.points} de {k.max} puntos (adecuada 10, razonable 6, error importante 0).</p></div>
            <div className="rounded border border-slate-200 p-3"><h3 className="text-sm font-semibold">Resultado empresarial</h3><p className={`text-2xl font-bold ${s.result < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtEur(s.result)}</p><p className="text-xs text-slate-600">Caja final {fmtEur(s.cash)} · servicio {serviceLevelToDate(s).toLocaleString("es-ES")} % · uso del camión {capacity ? Math.round(own / capacity * 100) : 0} %.</p></div>
            <div className="rounded border border-slate-200 p-3"><h3 className="text-sm font-semibold">Competencias practicadas</h3><ul className="text-xs">{[...byCompetence.entries()].map(([c, x]) => <li key={c}>{COMPETENCE[c] ?? c} ({c}): {Math.round(x.pts / (x.n * 10) * 100)} % en {x.n} {x.n === 1 ? "decisión" : "decisiones"}</li>)}</ul></div>
          </div>
          <p className="rounded bg-slate-50 p-2 text-xs text-slate-700">Nota y resultado se valoran por separado: una empresa que empieza suele perder dinero las primeras semanas; lo importante es la tendencia y por qué. Es la fase 1: falta personal, subcontratación libre, financiación y el resto de la temporada.</p>
        </section>
      )}

      <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="decisiones">
        <h2 id="decisiones" className="text-base font-semibold">Tus decisiones</h2>
        {s.learning.length === 0 ? <p className="text-sm text-slate-600">Aún no has tomado decisiones calificables.</p> : (
          <ol className="mt-2 space-y-2 text-sm">{s.learning.map((e, i) => <li key={i} className="rounded border border-slate-200 p-2"><p className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Semana {e.week}</span><b>{e.what}</b><GradeBadge grade={e.grade} /></p><p className="text-slate-700">{e.feedback}</p></li>)}</ol>
        )}
      </section>
    </div>
  );
}

function MonthQuestion({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  const [pick, setPick] = useState("");
  return (
    <form className="space-y-2 rounded border border-indigo-200 p-3" onSubmit={(e) => { e.preventDefault(); if (pick) onAction({ t: "pregunta", pregunta: MONTH_QUESTION.id, opcion: pick }); }}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{MONTH_QUESTION.prompt}</legend>
        {displayOrder(MONTH_QUESTION.options, `${s.seed}:mes1`).map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 text-sm"><input type="radio" name="mes1" value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1" /><span>{o.label}</span></label>
        ))}
      </fieldset>
      <button type="submit" disabled={!pick} className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">Responder</button>
      <p className="text-xs text-slate-600">No bloquea el juego: puedes seguir y responder cuando quieras antes de terminar.</p>
    </form>
  );
}
