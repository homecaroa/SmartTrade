"use client";

import { useState } from "react";
import { activeDeals, capacityKm, levelDef, levelResult, palletCapacity, RESCUE, rescueAvailable, transportKm, upgradesFor, whatIf } from "@/lib/sim/campaign/engine";
import { LEVELS } from "@/lib/sim/campaign/levels";
import type { Action, CampaignSave, CampaignState, Decision } from "@/lib/sim/campaign/model";
import { has } from "@/lib/sim/campaign/upgrades";
import { displayOrder } from "@/lib/learning/order";
import { GradeBadge } from "../../learning/grade-badge";
import { eur } from "./campaign";

type Props = { s: CampaignState; save: Pick<CampaignSave, "seed" | "levels">; onAction: (a: Action) => void; onNext: () => void; onRepeat: () => void };

/** La misión: preparación en la sede, semanas con decisiones y el informe final. */
export function Mission({ s, save, onAction, onNext, onRepeat }: Props) {
  if (s.status === "sede") return <Sede s={s} onAction={onAction} />;
  if (s.status === "jugando") return <Weeks s={s} onAction={onAction} />;
  return <Report s={s} save={save} onAction={onAction} onNext={onNext} onRepeat={onRepeat} />;
}

function Objectives({ s, done }: { s: CampaignState; done?: [boolean, boolean, boolean] }) {
  const def = levelDef(s.level);
  return (
    <ol className="space-y-1 text-sm" aria-label="Objetivos del nivel">
      {def.objectives.map((o, i) => <li key={i} className="flex gap-2"><span aria-hidden className={done ? (done[i] ? "text-amber-500" : "text-slate-300") : "text-slate-400"}>{"★".repeat(i + 1)}</span><span>{o}{done && <b className={done[i] ? " text-emerald-700" : " text-rose-700"}>{done[i] ? " · conseguido" : " · no conseguido"}</b>}</span></li>)}
    </ol>
  );
}

// ── Sede: antes de empezar ────────────────────────────────────────────────────────────────────────────────────────

function Sede({ s, onAction }: { s: CampaignState; onAction: (a: Action) => void }) {
  const def = levelDef(s.level);
  const ups = upgradesFor(s);
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="briefing">
        <h2 id="briefing" className="text-base font-semibold">La misión</h2>
        <p className="text-sm">{def.briefing}</p>
        <p className="rounded bg-indigo-50 p-2 text-sm text-indigo-900"><b>Nuevo en este nivel:</b> {def.mechanic}</p>
        <h3 className="text-sm font-semibold">Objetivos ({def.weeks} semanas)</h3>
        <Objectives s={s} />
        <details className="text-sm"><summary className="cursor-pointer text-indigo-800">Formas de superarlo (si quieres pistas)</summary><ul className="mt-1 list-disc pl-5">{def.strategies.map((x) => <li key={x}>{x}</li>)}</ul></details>
      </section>
      {ups.length > 0 && (
        <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="mejoras">
          <h2 id="mejoras" className="text-base font-semibold">Mejoras para tu empresa</h2>
          <p className="text-xs text-slate-600">Son inversiones: se pagan ahora, van al activo y se amortizan. Tienes {eur(s.company.cash)} en caja.</p>
          <ul className="grid gap-2 md:grid-cols-2">{ups.map((u) => {
            const owned = has(s.company, u.id), why = u.requires?.(s.company);
            return (
              <li key={u.id} className="space-y-1 rounded border border-slate-200 p-2 text-sm">
                <p className="font-semibold">{u.name} · {eur(u.cost)}</p>
                <p>{u.effect}</p>
                <p className="text-xs text-slate-600">{u.lesson}</p>
                {owned ? <p className="text-xs font-semibold text-emerald-800">Ya la tienes.</p> : why ? <p className="text-xs text-slate-600">{why}</p> : <button type="button" disabled={s.company.cash < u.cost} onClick={() => onAction({ t: "mejora", id: u.id })} className="rounded border border-indigo-600 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">Comprar</button>}
              </li>
            );
          })}</ul>
        </section>
      )}
      {rescueAvailable(s) && (
        <section className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" aria-label="Socio">
          <p><b>Tienes poca caja para empezar.</b> Un socio aportaría {eur(RESCUE.amount)} a cambio del {RESCUE.share} % de tu empresa. Es financiarte con capital en lugar de con deuda: no lo devuelves, pero ya no todo el beneficio es tuyo.</p>
          <button type="button" onClick={() => onAction({ t: "rescate" })} className="rounded border border-amber-600 px-3 py-1 text-xs font-semibold text-amber-900">Aceptar al socio</button>
        </section>
      )}
      <button type="button" onClick={() => onAction({ t: "empezar" })} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Empezar la misión</button>
    </div>
  );
}

// ── Las semanas ───────────────────────────────────────────────────────────────────────────────────────────────────

function Weeks({ s, onAction }: { s: CampaignState; onAction: (a: Action) => void }) {
  const c = s.company, def = levelDef(s.level);
  const last = s.logs.at(-1);
  const recent = s.learning.filter((l) => l.level === s.level && l.week === s.week);
  const cap = capacityKm(c), used = transportKm(c, s.abs) + Number(s.data.spotKm ?? 0);
  const pc = palletCapacity(c, s.abs), pu = activeDeals(c, s.abs).filter((d) => d.kind === "almacen").reduce((a, d) => a + d.pallets!, 0);
  return (
    <div className="space-y-4">
      {last && last.level === s.level && (
        <section className="rounded-lg border border-indigo-200 bg-white p-3 text-sm shadow-sm" aria-label="Semana anterior">
          <p className="font-semibold">Semana {last.week} cerrada: resultado <span className={last.result < 0 ? "text-rose-700" : "text-emerald-700"}>{eur(last.result)}</span> · caja {eur(last.cashEnd)}</p>
          <p className="text-xs text-slate-600">Facturado {eur(last.revenue)} · gasóleo y mantenimiento {eur(last.variable)} · fijos {eur(last.fixed)}{last.other ? ` · otros ${eur(last.other)}` : ""}{last.financial ? ` · intereses ${eur(last.financial)}` : ""} · cobrado {eur(last.collections)}</p>
          {last.notes.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{last.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </section>
      )}
      <section className="grid gap-2 rounded-lg bg-white p-3 text-sm shadow-sm sm:grid-cols-2" aria-label="Capacidad">
        <Meter label={`Furgoneta: ${used.toLocaleString("es-ES")} de ${cap.toLocaleString("es-ES")} km esta semana`} value={used} max={cap} />
        {c.facility && <Meter label={pc ? `Nave: ${pu} de ${pc} palés` : `Nave en obras: lista en la semana ${c.facility.readyAbs - s.abs + s.week} del nivel`} value={pu} max={pc || 1} />}
      </section>
      {s.pending.length > 0 ? (
        <section className="space-y-3" aria-labelledby="bandeja">
          <h2 id="bandeja" className="text-base font-semibold">Decisiones de esta semana ({s.pending.length})</h2>
          {s.pending.map((d) => <DecisionCard key={d.id} d={d} s={s} onAction={onAction} />)}
        </section>
      ) : (
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm">No te queda nada por decidir esta semana.</p>
          <button type="button" onClick={() => onAction({ t: "cerrar" })} className="mt-2 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Cerrar la semana {s.week} de {def.weeks}</button>
        </section>
      )}
      {recent.length > 0 && (
        <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="aprendido">
          <h2 id="aprendido" className="text-base font-semibold">Lo que han traído tus decisiones</h2>
          {[...recent].reverse().map((l, i) => <div key={i} className="rounded border border-slate-200 p-2 text-sm"><p className="flex flex-wrap items-center gap-2"><b>{l.what}</b><GradeBadge grade={l.grade} /></p><p className="text-slate-700">{l.feedback}</p></div>)}
        </section>
      )}
      <details className="rounded-lg bg-white p-4 text-sm shadow-sm"><summary className="cursor-pointer font-semibold">Objetivos del nivel</summary><div className="mt-2"><Objectives s={s} /></div></details>
    </div>
  );
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round(value / Math.max(1, max) * 100));
  return <div><p className="text-xs">{label}</p><div className="mt-1 h-2 rounded bg-slate-200"><div className={`h-2 rounded ${value > max ? "bg-rose-600" : "bg-blue-500"}`} style={{ width: `${pct}%` }} /></div></div>;
}

function DecisionCard({ d, s, onAction }: { d: Decision; s: CampaignState; onAction: (a: Action) => void }) {
  const [pick, setPick] = useState("");
  const opts = displayOrder(d.options, `${s.seed}:${d.id}`);
  return (
    <form className="space-y-2 rounded-lg border border-indigo-200 bg-white p-3 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (pick) onAction({ t: "decidir", id: d.id, opcion: pick }); }}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{d.key ? "★ " : ""}{d.title}</legend>
        <p className="text-sm">{d.prompt}</p>
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900"><b>Pista:</b> {d.hint}</p>
        {opts.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-2 text-sm hover:border-indigo-300">
            <input type="radio" name={`d-${d.id}`} value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1" />
            <span><span className="font-medium">{o.label}</span>{o.detail && <span className="block text-xs text-slate-600">{o.detail}</span>}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!pick} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Decidir</button>
    </form>
  );
}

// ── Informe final del nivel ───────────────────────────────────────────────────────────────────────────────────────

function Report({ s, save, onAction, onNext, onRepeat }: Props) {
  const def = levelDef(s.level);
  const r = s.results.find((x) => x.level === s.level)!;
  const stars = r.stars.filter(Boolean).length;
  const mine = s.learning.filter((l) => l.level === s.level);
  const pts = mine.reduce((a, l) => a + (l.grade === "correcta" ? 10 : l.grade === "razonable" ? 6 : 0), 0);
  const qs = def.debrief(s);
  const keys = s.history.filter((h) => h.level === s.level);
  const last = s.level + 1 >= LEVELS.length;
  return (
    <div className="space-y-4">
      <section className={`space-y-2 rounded-lg border p-4 ${r.passed ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`} aria-labelledby="informe">
        <h2 id="informe" className="text-lg font-bold">{s.status === "quiebra" ? "La empresa no ha aguantado" : r.passed ? "Misión cumplida" : "Misión no cumplida"} <span aria-label={`${r.passed ? stars : 0} estrellas de 3`} className="text-amber-500">{"★".repeat(r.passed ? stars : 0)}<span className="text-slate-300">{"★".repeat(3 - (r.passed ? stars : 0))}</span></span></h2>
        {s.endReason && <p className="text-sm">{s.endReason}</p>}
        <Objectives s={s} done={r.passed ? r.stars : [false, false, false]} />
        <p className="text-sm">Resultado del nivel: <b className={r.resultLevel < 0 ? "text-rose-700" : "text-emerald-700"}>{eur(r.resultLevel)}</b> · caja al terminar: <b>{eur(r.cashEnd)}</b></p>
        <p className="text-xs text-slate-600">Las estrellas miden tu gestión. Tu aprendizaje se mide aparte: {mine.length ? `${Math.round(pts / (mine.length * 10) * 100)} % en ${mine.length} decisiones de este nivel` : "aún sin decisiones calificadas"} (detalle en la pestaña Aprendizaje).</p>
      </section>

      {keys.length > 0 && (
        <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="que-habria">
          <h2 id="que-habria" className="text-base font-semibold">¿Qué habría pasado si…?</h2>
          <p className="text-xs text-slate-600">Se rejuega el nivel cambiando solo esa decisión; el resto de lo que hiciste se mantiene (lo que ya no tenga sentido se salta).</p>
          {keys.map((h) => <WhatIf key={h.id} h={h} s={s} save={save} />)}
        </section>
      )}

      {qs.length > 0 && (
        <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="preguntas">
          <h2 id="preguntas" className="text-base font-semibold">Para cerrar: {qs.length} preguntas</h2>
          {qs.map((q) => <Question key={q.id} q={q} s={s} onAction={onAction} />)}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {r.passed && !last && <button type="button" onClick={onNext} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Ir a la sede: nivel {def.n + 1}</button>}
        {r.passed && last && <p className="rounded bg-indigo-50 p-2 text-sm text-indigo-900">Has completado los niveles disponibles. Los siguientes llegarán en las próximas entregas; tu empresa te esperará aquí.</p>}
        <button type="button" onClick={onRepeat} className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Repetir el nivel</button>
      </div>
    </div>
  );
}

function WhatIf({ h, s, save }: { h: CampaignState["history"][number]; s: CampaignState; save: Pick<CampaignSave, "seed" | "levels"> }) {
  const [alt, setAlt] = useState<{ opcion: string; cash: number; result: number; stars: number; bankrupt: boolean } | null>(null);
  const others = h.options.filter((o) => o.id !== h.chosen);
  const mineResult = levelResult(s, s.level);
  return (
    <div className="space-y-1 rounded border border-slate-200 p-2 text-sm">
      <p><b>{h.title}</b> (semana {h.week}): elegiste «{h.options.find((o) => o.id === h.chosen)?.label}».</p>
      <div className="flex flex-wrap gap-1">{others.map((o) => <button key={o.id} type="button" onClick={() => { const w = whatIf(save, s.level, h.id, o.id); setAlt({ opcion: o.label, cash: w.cash, result: w.result, stars: w.stars.filter(Boolean).length, bankrupt: w.bankrupt }); }} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">¿Y si «{o.label}»?</button>)}</div>
      {alt && <p className="rounded bg-slate-50 p-2 text-xs">Con «{alt.opcion}»: {alt.bankrupt ? "la empresa no habría aguantado el nivel" : <>resultado del nivel <b>{eur(alt.result)}</b> (tú: {eur(mineResult)}), caja final <b>{eur(alt.cash)}</b> y {alt.stars} {alt.stars === 1 ? "estrella" : "estrellas"}</>}.</p>}
    </div>
  );
}

function Question({ q, s, onAction }: { q: ReturnType<ReturnType<typeof levelDef>["debrief"]>[number]; s: CampaignState; onAction: (a: Action) => void }) {
  const answered = s.debrief[q.id];
  const [pick, setPick] = useState("");
  const opts = displayOrder(q.options, `${s.seed}:${q.id}`);
  if (answered) { const o = q.options.find((x) => x.id === answered)!; return <div className="rounded border border-slate-200 p-2 text-sm"><p className="font-medium">{q.prompt}</p><p className="mt-1 flex flex-wrap items-center gap-2">Tu respuesta: {o.label} <GradeBadge grade={o.grade} /></p><p className="text-slate-700">{o.feedback}</p></div>; }
  return (
    <form className="space-y-1 rounded border border-slate-200 p-2 text-sm" onSubmit={(e) => { e.preventDefault(); if (pick) onAction({ t: "pregunta", id: q.id, opcion: pick }); }}>
      <p className="font-medium">{q.prompt}</p>
      {opts.map((o) => <label key={o.id} className="flex cursor-pointer items-start gap-2"><input type="radio" name={q.id} checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1" /><span>{o.label}</span></label>)}
      <button type="submit" disabled={!pick} className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">Responder</button>
    </form>
  );
}

