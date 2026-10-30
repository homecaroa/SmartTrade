"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { assessRoutes, gradeJustification, JUSTIFICATIONS } from "@/lib/learning/logistics/assess";
import { computeQuote } from "@/lib/learning/logistics/calculator";
import { LOGISTICS_CASES, logisticsCase } from "@/lib/learning/logistics/cases";
import { evaluateLogistics, gradeIncoterm } from "@/lib/learning/logistics/evaluation";
import { fmtDays, fmtRangeEur } from "@/lib/learning/logistics/format";
import { chooseIncident, chooseIncoterm, chooseRoute, decided, isLogisticsSession, LOGISTICS_STEPS, newLogisticsSession, next, OWNERSHIP_OPTIONS, type LogisticsSession } from "@/lib/learning/logistics/session";
import { MODALITY_LABEL, type JustificationId, type LogisticsCase } from "@/lib/learning/logistics/types";
import { INCOTERMS } from "@/lib/logistics/incoterms";
import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import { displayOrder } from "@/lib/learning/order";
import { clearState, loadState, saveState, storageKey } from "@/lib/learning/storage";
import { GradeBadge } from "./grade-badge";
import { IncotermObligations, LogisticsNotice, QuoteView, RoutesTable } from "./logistics-tables";
import { FactList, ProvenanceLegend } from "./provenance-badge";
import { StageProgress } from "./stage-progress";

const card = "space-y-3 rounded-lg bg-white p-4 shadow-sm";
const btn = "rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400";

/** Laboratorio de logística: un caso, siete pasos. Solo recibe el id: el caso contiene funciones (incidencias). */
export function LogisticsLab({ caseId }: { caseId: string }) {
  const c = logisticsCase(caseId);
  const key = storageKey("logistica", caseId);
  const [s, setS] = useState<LogisticsSession | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { setS(loadState(key, (x): x is LogisticsSession => isLogisticsSession(x, caseId)) ?? newLogisticsSession(caseId)); }, [key, caseId]);
  useEffect(() => { if (s) saveState(key, s); }, [key, s]);
  useEffect(() => { headRef.current?.focus(); }, [s?.step]);

  if (!c) return <p>Caso no encontrado.</p>;
  if (!s) return <p className="text-sm text-slate-600">Cargando el laboratorio…</p>;

  const idx = LOGISTICS_STEPS.findIndex((x) => x.id === s.step);
  const items = LOGISTICS_STEPS.map((st, i) => ({ id: st.id, title: st.title, state: (i < idx ? "hecha" : i === idx ? "actual" : "pendiente") as "hecha" | "actual" | "pendiente" }));
  const restart = () => {
    if (idx > 0 && !window.confirm("¿Reiniciar el caso? Se borrarán tus decisiones de esta sesión.")) return;
    clearState(key);
    setS(newLogisticsSession(caseId));
  };
  const cont = <button type="button" className={btn} onClick={() => setS(next(s))}>Continuar</button>;

  return (
    <div className="space-y-4">
      <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Laboratorio de logística · dificultad {c.difficulty}</p>
        <h1 className="text-xl font-bold">{c.title}</h1>
        <p className="text-sm"><b>Objetivo de aprendizaje:</b> {c.learningGoal}</p>
        <LogisticsNotice />
        <StageProgress items={items} label="Pasos del laboratorio" />
      </header>

      <section className={card} aria-live="polite">
        <h2 ref={headRef} tabIndex={-1} className="text-base font-semibold">{idx + 1}. {LOGISTICS_STEPS[idx].title}</h2>
        {s.step === "pedido" && <OrderStep c={c} />}
        {s.step === "alternativas" && <AlternativesStep c={c} />}
        {s.step === "seleccion" && <SelectionStep c={c} s={s} onConfirm={(r, why) => setS(chooseRoute(c, s, r, why))} />}
        {s.step === "incoterm" && <IncotermStep c={c} s={s} onConfirm={(code, own) => setS(chooseIncoterm(s, code, own))} />}
        {s.step === "presupuesto" && <BudgetStep c={c} s={s} />}
        {s.step === "incidencia" && <IncidentStep c={c} s={s} onConfirm={(o) => setS(chooseIncident(c, s, o))} />}
        {s.step === "resultado" && <ResultStep c={c} s={s} onRestart={restart} />}
        {s.step !== "resultado" && (!["seleccion", "incoterm", "incidencia"].includes(s.step) || decided(s)) && cont}
      </section>

      <div className="print:hidden">
        <button type="button" onClick={restart} className="text-xs text-slate-600 underline">Reiniciar este caso</button>
      </div>
    </div>
  );
}

function OrderStep({ c }: { c: LogisticsCase }) {
  return (
    <div className="space-y-2 text-sm">
      <p>{c.summary}</p>
      <p><b>Petición del comprador:</b> {c.agreed.buyerRequest}</p>
      <p><b>Ruta:</b> {c.origin} → {c.destination}. {c.geographyNote}</p>
      <ProvenanceLegend />
      <FactList facts={c.facts} />
      <p className="text-xs text-slate-600">En el siguiente paso verás las alternativas de transporte con sus tramos, plazos y costes. Fíjate en el plazo: la opción más barata no siempre llega a tiempo.</p>
    </div>
  );
}

function AlternativesStep({ c }: { c: LogisticsCase }) {
  const { all } = assessRoutes(c);
  return (
    <div className="space-y-3 text-sm">
      <p>Costes calculados con la regla pactada ({c.agreed.incoterm}) y mostrados como rangos. El coste logístico total incluye todos los conceptos, los pague quien los pague.</p>
      <RoutesTable c={c} rows={displayOrder(all.map((a) => ({ ...a, id: a.route.id })), `${c.id}:alternativas`)} />
      {c.infeasible.length > 0 && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3">
          <h3 className="font-semibold">Alternativas que no son viables</h3>
          <ul className="list-disc pl-5 text-xs">{c.infeasible.map((x) => <li key={x.modality}><b>{MODALITY_LABEL[x.modality]}:</b> {x.reason}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SelectionStep({ c, s, onConfirm }: { c: LogisticsCase; s: LogisticsSession; onConfirm: (routeId: string, why: JustificationId[]) => void }) {
  const [route, setRoute] = useState("");
  const [why, setWhy] = useState<JustificationId[]>([]);
  if (s.routeId) {
    const me = assessRoutes(c).all.find((a) => a.route.id === s.routeId)!;
    const j = gradeJustification(c, s.routeId, s.reasons);
    return (
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-2"><b>Ruta:</b> {me.route.label} <GradeBadge grade={me.grade} /></p>
        <ul className="list-disc pl-5">{me.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="flex flex-wrap items-center gap-2"><b>Justificación:</b> <GradeBadge grade={j.grade} /></p>
        <ul className="list-disc pl-5">{j.feedback.map((f) => <li key={f}>{f}</li>)}</ul>
      </div>
    );
  }
  const { all } = assessRoutes(c);
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (route) onConfirm(route, why); }}>
      <details className="rounded border border-slate-200 p-2"><summary className="cursor-pointer font-medium">Repasar las alternativas</summary><div className="mt-2"><RoutesTable c={c} rows={all} /></div></details>
      <fieldset className="space-y-2">
        <legend className="font-semibold">¿Qué ruta eliges?</legend>
        {displayOrder(c.routes, `${c.id}:seleccion`).map((r) => (
          <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-2 hover:border-indigo-300">
            <input type="radio" name="ruta" value={r.id} checked={route === r.id} onChange={() => setRoute(r.id)} className="mt-1" />
            <span>{r.label} <span className="text-xs text-slate-600">({MODALITY_LABEL[r.modality]})</span></span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-semibold">¿Por qué? Marca todos los motivos que sean ciertos para tu ruta</legend>
        {displayOrder(JUSTIFICATIONS, `${c.id}:motivos`).map((j) => (
          <label key={j.id} className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={why.includes(j.id)} onChange={(e) => setWhy((w) => (e.target.checked ? [...w, j.id] : w.filter((x) => x !== j.id)))} className="mt-1" />
            <span>{j.label}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!route} className={btn}>Confirmar ruta</button>
      <p className="text-xs text-slate-500">Una vez confirmada no se puede cambiar.</p>
    </form>
  );
}

function IncotermStep({ c, s, onConfirm }: { c: LogisticsCase; s: LogisticsSession; onConfirm: (code: string, ownership: string) => void }) {
  const [code, setCode] = useState("");
  const [own, setOwn] = useState("");
  const route = c.routes.find((r) => r.id === s.routeId)!;
  if (s.incoterm && s.ownership) {
    const g = gradeIncoterm(c, route.id, s.incoterm);
    const o = OWNERSHIP_OPTIONS.find((x) => x.id === s.ownership)!;
    return (
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-2"><b>Incoterm:</b> {s.incoterm} <GradeBadge grade={g.grade} /></p>
        <ul className="list-disc pl-5">{g.feedback.map((f) => <li key={f}>{f}</li>)}</ul>
        <p className="flex flex-wrap items-center gap-2"><b>Riesgo y propiedad:</b> <GradeBadge grade={o.grade} /></p>
        <p>{o.feedback}</p>
      </div>
    );
  }
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (code && own) onConfirm(code, own); }}>
      <p>Lo pactado con el comprador: <b>{fmtEur(c.agreed.unitPrice)} por {c.cargo.unit}, {c.agreed.incoterm} {c.agreed.place}</b>. Ruta elegida: {route.label}. Elige la regla con la que vas a organizar el envío.</p>
      <p className="text-xs text-slate-600">Reglas multimodales (cualquier transporte): EXW, FCA, CPT, CIP, DAP, DPU, DDP. Solo marítimas: FAS, FOB, CFR, CIF.</p>
      <fieldset>
        <legend className="font-semibold">Incoterm® 2020</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {INCOTERMS.map((i) => (
            <label key={i.code} className={`cursor-pointer rounded border px-2 py-1 focus-within:ring-2 focus-within:ring-indigo-400 ${code === i.code ? "border-indigo-500 bg-indigo-50" : "border-slate-300"}`}>
              <input type="radio" name="incoterm" value={i.code} checked={code === i.code} onChange={() => setCode(i.code)} className="sr-only" />{i.code}
            </label>
          ))}
        </div>
      </fieldset>
      {code && <IncotermObligations code={code} route={route} />}
      <fieldset className="space-y-2">
        <legend className="font-semibold">Con la regla elegida, ¿cuándo pasa la PROPIEDAD de la mercancía al comprador?</legend>
        {displayOrder(OWNERSHIP_OPTIONS, `${c.id}:propiedad`).map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2">
            <input type="radio" name="propiedad" value={o.id} checked={own === o.id} onChange={() => setOwn(o.id)} className="mt-1" />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!code || !own} className={btn}>Confirmar Incoterm</button>
    </form>
  );
}

function BudgetStep({ c, s }: { c: LogisticsCase; s: LogisticsSession }) {
  const route = c.routes.find((r) => r.id === s.routeId)!;
  const q = computeQuote(c, route, s.incoterm!);
  const { all } = assessRoutes(c);
  return (
    <div className="space-y-3 text-sm">
      <QuoteView c={c} q={q} />
      <details className="rounded border border-slate-200 p-2">
        <summary className="cursor-pointer font-medium">Comparar con las demás rutas (con {s.incoterm})</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[28rem] text-left text-xs">
            <thead><tr className="border-b border-slate-300"><th className="py-1 pr-2">Ruta</th><th className="py-1 pr-2">Coste logístico</th><th className="py-1 pr-2">Entrega</th><th className="py-1">Margen del vendedor</th></tr></thead>
            <tbody>
              {all.map((a) => {
                const qq = computeQuote(c, a.route, s.incoterm!);
                return <tr key={a.route.id} className={`border-b border-slate-100 ${a.route.id === route.id ? "font-semibold" : ""}`}><td className="py-1 pr-2">{a.route.label}</td><td className="py-1 pr-2">{fmtRangeEur(qq.logistics.total)}</td><td className="py-1 pr-2">{fmtDays(qq.deliveryDays)}</td><td className="py-1">{fmtRangeEur(qq.margin)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function IncidentStep({ c, s, onConfirm }: { c: LogisticsCase; s: LogisticsSession; onConfirm: (id: string) => void }) {
  const [opt, setOpt] = useState("");
  const route = c.routes.find((r) => r.id === s.routeId)!;
  const inc = c.incident(c, route, s.incoterm!);
  if (s.incidentChoice) {
    const o = inc.options.find((x) => x.id === s.incidentChoice)!;
    return (
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-2"><b>{inc.title}</b> <GradeBadge grade={o.grade} /></p>
        <p>{o.feedback}</p>
        {o.cost && <p>Coste: <b>{fmtEur(o.cost.amount)}</b>, a cargo del {o.cost.payer}. {o.extraDays ? `Retraso: ${o.extraDays} día(s).` : ""}</p>}
        {o.grade !== "correcta" && <p className="rounded bg-emerald-50 p-2 text-emerald-900"><b>Lo más adecuado:</b> {inc.options.find((x) => x.id === inc.best)!.label}. {inc.why}</p>}
      </div>
    );
  }
  return (
    <form className="space-y-3 rounded border-2 border-rose-300 bg-rose-50 p-3 text-sm" onSubmit={(e) => { e.preventDefault(); if (opt) onConfirm(opt); }}>
      <fieldset className="space-y-2">
        <legend className="font-semibold">⚠️ {inc.title}</legend>
        <p>{inc.prompt}</p>
        {displayOrder(inc.options, `${c.id}:${inc.kind}`).map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 hover:border-indigo-300">
            <input type="radio" name="incidencia" value={o.id} checked={opt === o.id} onChange={() => setOpt(o.id)} className="mt-1" />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!opt} className={btn}>Confirmar decisión</button>
    </form>
  );
}

function ResultStep({ c, s, onRestart }: { c: LogisticsCase; s: LogisticsSession; onRestart: () => void }) {
  const ev = evaluateLogistics(c, s);
  const best = c.routes.find((r) => r.id === ev.bestQuote.routeId)!;
  const nextCase = LOGISTICS_CASES[(LOGISTICS_CASES.findIndex((x) => x.id === c.id) + 1) % LOGISTICS_CASES.length];
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-slate-200 p-3">
          <p className="text-xs text-slate-600">Conocimientos (5 decisiones)</p>
          <p className="text-2xl font-bold">{fmtPctLearning(ev.knowledge.pct, 0)}</p>
          <p className="text-xs">{ev.knowledge.points} de {ev.knowledge.max} puntos</p>
        </div>
        <div className="rounded border border-slate-200 p-3">
          <p className="text-xs text-slate-600">Resultado económico y operativo (con la incidencia)</p>
          <p className="text-lg font-bold">Margen {fmtRangeEur(ev.quote.margin)} ({ev.quote.marginPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %)</p>
          <p className="text-xs">Entrega a los {fmtDays(ev.quote.deliveryDays)}{ev.extraDays ? ` + ${ev.extraDays} día(s) por la incidencia` : ""}: {ev.finalStatus === "seguro" ? "a tiempo" : ev.finalStatus === "riesgo" ? "solo a tiempo en el mejor caso" : "fuera del plazo pactado"}.</p>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">Evaluación por dimensiones</h3>
        <ul className="mt-1 space-y-2">
          {ev.dimensions.map((d) => (
            <li key={d.key}>
              <div className="flex items-center justify-between text-xs"><span className="font-medium">{d.label}</span><span>{d.score}/100</span></div>
              <div className="h-2 rounded bg-slate-200" role="meter" aria-label={d.label} aria-valuenow={d.score} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded bg-indigo-500" style={{ width: `${d.score}%` }} /></div>
              <p className="text-xs text-slate-600">{d.explain}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold">Revisión de tus decisiones</h3>
        <ol className="mt-1 space-y-2">
          {ev.review.map((r) => (
            <li key={r.title} className="rounded border border-slate-200 p-2">
              <p className="flex flex-wrap items-center gap-2"><b>{r.title}:</b> {r.answer} <GradeBadge grade={r.grade} /></p>
              <ul className="list-disc pl-5 text-xs">{r.feedback.map((f) => <li key={f}>{f}</li>)}</ul>
            </li>
          ))}
        </ol>
      </div>
      <QuoteView c={c} q={ev.quote} title="Presupuesto final con la incidencia" />
      <p className="rounded bg-emerald-50 p-2 text-emerald-900"><b>Referencia:</b> la mejor opción de este caso es «{best.label}» con {c.agreed.incoterm}: coste logístico {fmtRangeEur(ev.bestQuote.logistics.total)}, entrega a los {fmtDays(ev.bestQuote.deliveryDays)} y margen {fmtRangeEur(ev.bestQuote.margin)}.</p>
      <LogisticsNotice />
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" className={btn} onClick={onRestart}>Repetir el caso</button>
        <Link href={`/aprendizaje/logistica/${nextCase.id}`} className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100">Siguiente caso: {nextCase.title}</Link>
        <Link href="/aprendizaje/logistica" className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100">Volver al laboratorio</Link>
      </div>
    </div>
  );
}
