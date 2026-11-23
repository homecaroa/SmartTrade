"use client";

import { activeDeals, capacityKm, clientName, mastery, palletCapacity, weeklyFixed } from "@/lib/sim/campaign/engine";
import { MANUAL } from "@/lib/sim/campaign/manual";
import type { CampaignState } from "@/lib/sim/campaign/model";
import { upgradeById } from "@/lib/sim/campaign/upgrades";
import { COMPETENCE_LABELS } from "@/lib/sim/competences";
import { GradeBadge } from "../../learning/grade-badge";
import { eur } from "./campaign";

/** Tu empresa: lo que persiste entre niveles. */
export function CompanyPanel({ s }: { s: CampaignState }) {
  const c = s.company;
  const deals = activeDeals(c, s.abs);
  const pending = c.invoices.filter((i) => i.paidAbs === undefined && !i.factored).reduce((a, i) => a + i.amount, 0);
  const owe = c.payables.filter((p) => p.paidAbs === undefined).reduce((a, p) => a + p.amount, 0);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-1 rounded-lg bg-white p-4 text-sm shadow-sm" aria-labelledby="medios">
        <h2 id="medios" className="text-base font-semibold">Medios</h2>
        {c.vehicles.map((v) => <p key={v.id}>{v.name}: {v.kmWeek.toLocaleString("es-ES")} km a la semana ({eur(v.monthly)} al mes)</p>)}
        <p>{c.facility ? `${c.facility.name}: ${palletCapacity(c, s.abs) || c.facility.pallets} palés (${eur(c.facility.rentMonthly)} al mes)${s.abs < c.facility.readyAbs ? ", en obras" : ""}` : "Sin nave"}</p>
        <p>Capacidad de transporte: {capacityKm(c).toLocaleString("es-ES")} km a la semana · fijos: {eur(weeklyFixed(c, s.abs))} a la semana</p>
        <p>Mejoras: {c.upgrades.length ? c.upgrades.map((u) => upgradeById(u)?.name).join(", ") : "ninguna todavía"}</p>
        {c.partnerShare > 0 && <p>Socios: tienen el {c.partnerShare} % de tu empresa.</p>}
      </section>
      <section className="space-y-1 rounded-lg bg-white p-4 text-sm shadow-sm" aria-labelledby="cuentas">
        <h2 id="cuentas" className="text-base font-semibold">Cuentas</h2>
        <p>Caja {eur(c.cash)} · te deben {eur(pending)} · debes {eur(owe)}</p>
        <p>Fianzas {eur(c.deposits)} · instalaciones y mejoras {eur(c.assets)}</p>
        <p>Capital {eur(c.capital)} · resultado acumulado {eur(c.result)}</p>
        {c.credit && <p>Póliza de crédito: hasta {eur(c.credit.limit)}</p>}
      </section>
      <section className="space-y-1 rounded-lg bg-white p-4 text-sm shadow-sm md:col-span-2" aria-labelledby="clientes">
        <h2 id="clientes" className="text-base font-semibold">Tus clientes</h2>
        {deals.length === 0 ? <p className="text-slate-600">Aún no tienes clientes fijos.</p> : (
          <ul className="space-y-0.5">{deals.map((d) => <li key={d.id}>{clientName(d.client)}: {d.kind === "transporte" ? `${d.km} km a la semana a ${d.rate!.toLocaleString("es-ES")} €/km${d.sub ? " (subcontratado)" : ""}` : `${d.pallets} palés a ${d.palletRate!.toLocaleString("es-ES")} € por palé y semana`} · cobro a {d.payWeeks * 7} días · relación {Math.round(c.relation[d.client] ?? 50)}/100</li>)}</ul>
        )}
      </section>
    </div>
  );
}

/** El Manual: los conceptos que has desbloqueado jugando. */
export function ManualPanel({ s }: { s: CampaignState }) {
  const open = MANUAL.filter((m) => s.manual.includes(m.id));
  const locked = MANUAL.length - open.length;
  return (
    <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="manual">
      <h2 id="manual" className="text-base font-semibold">Manual</h2>
      {open.length === 0 ? <p className="text-sm text-slate-600">Empieza la primera misión para desbloquear conceptos.</p> : open.map((m) => (
        <details key={m.id} className="rounded border border-slate-200 p-2 text-sm"><summary className="cursor-pointer font-medium">{m.title} <span className="text-xs text-slate-500">(nivel {m.level})</span></summary><p className="mt-1">{m.text}</p>{m.source && <p className="mt-1 text-xs text-slate-600">Fuente: {m.source}</p>}</details>
      ))}
      {locked > 0 && <p className="text-xs text-slate-600">{locked} conceptos por descubrir en los próximos niveles.</p>}
    </section>
  );
}

/** Aprendizaje: el dominio por competencia del ciclo (aparte de las estrellas) y todas tus decisiones calificadas. */
export function LearningPanel({ s }: { s: CampaignState }) {
  const m = mastery(s);
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="dominio">
        <h2 id="dominio" className="text-base font-semibold">Dominio por competencia</h2>
        <p className="text-xs text-slate-600">Sale de la calidad de tus decisiones y de las preguntas del final de cada nivel, no del dinero: se puede ganar mucho y aprender poco, o al revés.</p>
        {m.length === 0 ? <p className="text-sm text-slate-600">Aún sin decisiones calificadas.</p> : (
          <ul className="space-y-1 text-sm">{m.map((x) => <li key={x.competence}><div className="flex justify-between gap-2"><span>{COMPETENCE_LABELS[x.competence] ?? x.competence} ({x.competence})</span><b>{x.pct} %</b></div><div className="h-1.5 rounded bg-slate-200"><div className="h-1.5 rounded bg-violet-500" style={{ width: `${x.pct}%` }} /></div><span className="text-xs text-slate-500">{x.n} {x.n === 1 ? "decisión" : "decisiones"}</span></li>)}</ul>
        )}
      </section>
      <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="decisiones">
        <h2 id="decisiones" className="text-base font-semibold">Tus decisiones</h2>
        {s.learning.length === 0 ? <p className="text-sm text-slate-600">Aún no has tomado decisiones calificables.</p> : (
          <ol className="space-y-2 text-sm">{[...s.learning].reverse().map((e, i) => <li key={i} className="rounded border border-slate-200 p-2"><p className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Nivel {e.level + 1}, semana {e.week}</span><b>{e.what}</b><GradeBadge grade={e.grade} /></p><p className="text-slate-700">{e.feedback}</p></li>)}</ol>
        )}
      </section>
    </div>
  );
}
