"use client";

import { useState } from "react";
import { clientHistory, describeOffer, INCIDENT_OPTIONS, kmCommitted, MONTH_QUESTION, n2, palletsCommitted, seasonOutcome, serviceLevelToDate } from "@/lib/sim/engine";
import { clientOf, kmOf, reputationEffect, weeklyRevenue } from "@/lib/sim/market";
import type { Action, Offer, SimState } from "@/lib/sim/model";
import { P, payTermLabel, SEASON_WEEKS, TRUCK_KM_WEEK } from "@/lib/sim/params";
import { fmtEur } from "@/lib/learning/money";
import { displayOrder } from "@/lib/learning/order";
import { GradeBadge } from "../learning/grade-badge";
import { Calculator } from "./calculator";

const KIND = { distribucion: "Distribución regional", puntual: "Viaje puntual", almacenaje: "Almacenaje" } as const;

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round(value / max * 100));
  const over = value > max;
  return (
    <div className="text-xs">
      <div className="flex justify-between"><span>{label}</span><span className={over ? "font-semibold text-rose-700" : ""}>{value.toLocaleString("es-ES")} / {max.toLocaleString("es-ES")}{over ? " · ¡por encima de la capacidad!" : ""}</span></div>
      <div className="mt-0.5 h-2 rounded bg-slate-200" role="img" aria-label={`${label}: ${value} de ${max}`}><div className={`h-2 rounded ${over ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function WeekView({ s, lastWeek, onAction, onShowReport }: { s: SimState; lastWeek: number | null; onAction: (a: Action) => void; onShowReport: () => void }) {
  const done = s.status === "fin" || s.status === "quiebra";
  const closed = lastWeek !== null ? s.weeks.find((w) => w.week === lastWeek) : null;
  const decisions = closed ? s.learning.filter((l) => l.week === closed.week) : [];
  const horizon = Array.from({ length: 4 }, (_, i) => s.week + i).filter((w) => w <= SEASON_WEEKS);
  return (
    <div className="space-y-4">
      {closed && (
        <section className="space-y-2 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm" aria-label={`Semana ${closed.week} cerrada`}>
          <h2 className="text-base font-semibold">Semana {closed.week} cerrada: resultado {fmtEur(closed.result)} · caja {fmtEur(closed.cashEnd)}</h2>
          <p className="text-sm">Facturado {fmtEur(closed.revenueTransport + closed.revenueWarehouse)} (aún sin cobrar) · cobrado {fmtEur(closed.collections)} · {closed.kmOwn} km propios{closed.kmSubcontracted ? ` y ${closed.kmSubcontracted} subcontratados` : ""} · {closed.palletsStored} palés · servicio {closed.serviceLevel.toLocaleString("es-ES")} %</p>
          {closed.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{closed.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {decisions.length > 0 && (
            <ul className="space-y-1 text-sm">{decisions.map((d, i) => <li key={i} className="rounded bg-slate-50 p-2"><span className="flex flex-wrap items-center gap-2"><b>{d.what}</b><GradeBadge grade={d.grade} /></span>{d.feedback}</li>)}</ul>
          )}
        </section>
      )}

      {s.weeks.length >= 4 && !s.answers[MONTH_QUESTION.id] && (
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">Ya tienes el <b>informe del primer mes</b> con una pregunta sobre tus números. <button type="button" className="underline" onClick={onShowReport}>Ir al informe</button></p>
      )}
      {s.status === "quiebra" && <p className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm"><b>Fin de la partida en la semana {s.weeks.length}:</b> {s.endReason ?? "la empresa no puede seguir."} <button type="button" className="underline" onClick={onShowReport}>Ver el resumen final</button>.</p>}
      {s.status === "fin" && (() => {
        const out = seasonOutcome(s);
        return <p className={`rounded-lg border p-4 text-sm ${out.victory ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><b>{out.victory ? "¡Temporada ganada!" : "Temporada terminada sin cumplir los objetivos."}</b> Has completado las {SEASON_WEEKS} semanas. <button type="button" className="underline" onClick={onShowReport}>Ver el resumen final</button>.</p>;
      })()}

      {s.status === "incidencia" && s.pending && <IncidentCard s={s} onAction={onAction} />}

      {!done && s.status === "jugando" && (
        <>
          <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="capacidad">
            <h2 id="capacidad" className="text-base font-semibold">Capacidad comprometida</h2>
            {horizon.map((w) => (
              <div key={w} className="grid gap-2 sm:grid-cols-2">
                <Bar label={`Semana ${w} · camión (km)`} value={kmCommitted(s, w)} max={TRUCK_KM_WEEK} />
                <Bar label={`Semana ${w} · almacén (palés)`} value={palletsCommitted(s, w)} max={P.warehousePallets} />
              </div>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="space-y-2" aria-labelledby="ofertas">
            <h2 id="ofertas" className="text-base font-semibold">Ofertas de esta semana</h2>
            <p className="rounded bg-slate-50 p-2 text-xs text-slate-700"><b>Tu reputación</b> (nivel de servicio de las últimas 8 semanas: {serviceLevelToDate(s).toLocaleString("es-ES")} %): {reputationEffect(serviceLevelToDate(s), s.week).label}</p>
            {s.offers.length === 0 && <p className="text-sm text-slate-600">No quedan ofertas esta semana.</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              {displayOrder(s.offers, `${s.seed}:${s.week}`).map((o) => <OfferCard key={o.id} o={o} s={s} onAccept={() => onAction({ t: "aceptar", oferta: o.id })} />)}
            </div>
            <p className="text-xs text-slate-600">Las ofertas que no aceptes desaparecen al cerrar la semana. Antes de aceptar, comprueba que tienes capacidad y calcula si la tarifa cubre tus costes.</p>
          </section>
          <Calculator />
          </div>

          <ActiveContracts s={s} />

          <div className="rounded-lg bg-white p-4 shadow-sm">
            <button type="button" onClick={() => onAction({ t: "cerrar" })} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Cerrar la semana {s.week}</button>
            <p className="mt-1 text-xs text-slate-600">Se hacen los trabajos, se facturan, se cobran y pagan los vencimientos y llegan las ofertas de la semana siguiente.</p>
          </div>
        </>
      )}
    </div>
  );
}

function OfferCard({ o, s, onAccept }: { o: Offer; s: SimState; onAccept: () => void }) {
  const c = clientOf(o.clientId);
  const h = clientHistory(s, o.clientId);
  return (
    <article className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
      <p className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">{KIND[o.kind]}</span><b>{c.name}</b><span className="text-xs text-slate-600">({c.sector})</span></p>
      {o.kind === "distribucion" && <p>{o.kmWeek} km por semana (retornos incluidos) a <b>{n2(o.ratePerKm!)} €/km</b> durante {o.weeks} semanas → {fmtEur(weeklyRevenue(o))}/semana.</p>}
      {o.kind === "puntual" && <p>Un viaje de {o.kmOneWay} km de ida; <b>vuelves en vacío</b> ({kmOf(o)} km recorridos) por <b>{fmtEur(o.price!)}</b>.</p>}
      {o.kind === "almacenaje" && <p>{o.pallets} palés a <b>{n2(o.palletRate!)} €/palé/semana</b> (manipulación incluida) durante {o.weeks} semanas → {fmtEur(weeklyRevenue(o))}/semana.</p>}
      <p className="text-xs text-slate-600">Pago a {payTermLabel(o.payWeeks)} · {h.paid || h.overdue ? <><b>Tu experiencia:</b> {historyText(h)}</> : h.invoices ? <><b>Ya trabajas con este cliente:</b> aún no ha vencido ninguna factura. Referencias: {o.clientHint}</> : o.clientHint}</p>
      <button type="button" onClick={onAccept} className="rounded border border-indigo-600 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Aceptar</button>
    </article>
  );
}

function ActiveContracts({ s }: { s: SimState }) {
  const active = s.contracts.filter((c) => c.endWeek >= s.week && !(c.cancelledWeek !== undefined && c.cancelledWeek <= s.week));
  if (!active.length) return null;
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="contratos">
      <h2 id="contratos" className="text-base font-semibold">Tus contratos en curso</h2>
      <ul className="mt-1 space-y-1 text-sm">{active.map((c) => <li key={c.id}>{describeOffer(c)} <span className="text-xs text-slate-600">(semanas {c.startWeek}–{c.endWeek})</span></li>)}</ul>
    </section>
  );
}

function IncidentCard({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  const inc = s.pending!;
  const [pick, setPick] = useState("");
  const opts = displayOrder(INCIDENT_OPTIONS[inc.kind], `${s.seed}:${inc.id}`);
  return (
    <form className="space-y-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (pick) onAction({ t: "responder", incidencia: inc.id, opcion: pick }); }}>
      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">⚠️ {inc.title} (semana {inc.week})</legend>
        <p className="text-sm">{inc.prompt}</p>
        <p className="rounded bg-white p-2 text-xs text-slate-700"><b>Concepto:</b> {inc.concept}</p>
        {opts.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300">
            <input type="radio" name={`inc-${inc.id}`} value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1" /><span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!pick} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Decidir y seguir con la semana</button>
    </form>
  );
}



/** Lo que ya sabes de un cliente por haber trabajado con él: sustituye a las referencias de terceros. */
function historyText(h: ReturnType<typeof clientHistory>): string {
  const parts: string[] = [];
  if (h.paid) parts.push(h.paidLate ? `de ${h.paid} ${h.paid === 1 ? "factura cobrada" : "facturas cobradas"}, ${h.paidLate} con retraso (hasta ${h.maxDelayWeeks} ${h.maxDelayWeeks === 1 ? "semana" : "semanas"})` : `te ha pagado a tiempo ${h.paid === 1 ? "la factura cobrada" : `las ${h.paid} facturas cobradas`}`);
  if (h.overdue) parts.push(`${h.overdue} ${h.overdue === 1 ? "factura vencida sin pagar" : "facturas vencidas sin pagar"}`);
  return parts.join("; ") + ".";
}
