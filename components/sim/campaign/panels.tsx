"use client";

import { activeDeals, activeStaff, capacityKm, clientName, mastery, palletCapacity, personWeekly, weeklyFixed } from "@/lib/sim/campaign/engine";
import { Gauge } from "./fx";
import { CompanyScene } from "./scene";
import { MANUAL } from "@/lib/sim/campaign/manual";
import type { CampaignState } from "@/lib/sim/campaign/model";
import { upgradeById } from "@/lib/sim/campaign/upgrades";
import { COMPETENCE_LABELS } from "@/lib/sim/competences";
import { GradeBadge } from "../../learning/grade-badge";
import { eur } from "./campaign";

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * Tu empresa, dentro de la misión (petición del dueño, 25/11/2026: antes era una pestaña aparte). En escritorio va en
 * una columna fija junto a las decisiones; en el móvil, arriba, con el detalle plegado para no alejar las decisiones.
 */
export function CompanySide({ s }: { s: CampaignState }) {
  const c = s.company;
  const deals = activeDeals(c, s.abs);
  const pending = c.invoices.filter((i) => i.paidAbs === undefined && !i.factored).reduce((a, i) => a + i.amount, 0);
  const owe = c.payables.filter((p) => p.paidAbs === undefined).reduce((a, p) => a + p.amount, 0);
  const loans = (c.loans ?? []).filter((l) => l.principal > 0);
  const staff = activeStaff(c);
  const box = "rounded-lg bg-white p-3 text-sm shadow-sm";
  const sum = "cursor-pointer font-semibold";
  return (
    <div className="space-y-3" aria-label="Tu empresa">
      <CompanyScene s={s} compact />
      <section className={`${box} flex items-center gap-3`} aria-label="Resumen de tu empresa">
        <div className="w-28 shrink-0"><Gauge value={c.reputation.fiabilidad} label="Fiabilidad" className="w-full" /></div>
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
          <dt className="text-slate-500">Capacidad</dt><dd className="font-semibold">{capacityKm(c).toLocaleString("es-ES")} km/sem</dd>
          <dt className="text-slate-500">Nave</dt><dd className="font-semibold">{c.facility ? `${palletCapacity(c, s.abs) || c.facility.pallets} palés${s.abs < c.facility.readyAbs ? " (obras)" : ""}` : "sin nave"}</dd>
          <dt className="text-slate-500">Fijos</dt><dd className="font-semibold">{eur(weeklyFixed(c, s.abs))}/sem</dd>
          <dt className="text-slate-500">Contratos</dt><dd className="font-semibold">{deals.length}</dd>
          <dt className="text-slate-500">Te deben</dt><dd className="font-semibold">{eur(pending)}</dd>
          <dt className="text-slate-500">Equipo</dt><dd className="font-semibold">{staff.length + 1} {staff.length ? "personas" : "(tú)"}</dd>
        </dl>
      </section>
      <details className={box}>
        <summary className={sum}>Equipo</summary>
        <ul className="mt-1 space-y-1">
          <li><b>Tú</b>: dirección (tu sueldo: {eur(1_200)} al mes)</li>
          {staff.map((p) => <li key={p.id}><b>{p.name}</b>: {p.role === "conductor" ? "conductor/a" : p.role === "mozo" ? "mozo/a" : "temporal"}, {p.contract}, {eur(p.salaryMonthly)} brutos al mes · te cuesta {eur(personWeekly(p))} a la semana con cotizaciones{p.endAbs ? ` · hasta la semana ${p.endAbs - s.abs + s.week} del nivel` : ""}{s.abs <= p.trialUntilAbs ? " · en periodo de prueba" : ""}</li>)}
        </ul>
      </details>
      <details className={box}>
        <summary className={sum}>Medios</summary>
        <div className="mt-1 space-y-0.5">
          {c.vehicles.map((v) => <p key={v.id}>{v.name}: {v.kmWeek.toLocaleString("es-ES")} km a la semana ({eur(v.monthly)} al mes{v.finance && v.finance !== "renting" ? " de seguro" : ""})</p>)}
          <p>{c.facility ? `${c.facility.name}: ${palletCapacity(c, s.abs) || c.facility.pallets} palés (${eur(c.facility.rentMonthly)} al mes)${s.abs < c.facility.readyAbs ? ", en obras" : ""}` : "Sin nave"}</p>
          <p>Mejoras: {c.upgrades.length ? c.upgrades.map((u) => upgradeById(u)?.name).join(", ") : "ninguna todavía"}</p>
          {c.partnerShare > 0 && <p>Socios: tienen el {c.partnerShare} % de tu empresa.</p>}
        </div>
      </details>
      <details className={box}>
        <summary className={sum}>Cuentas</summary>
        <div className="mt-1 space-y-0.5">
          <p>Caja {eur(c.cash)} · te deben {eur(pending)} · debes {eur(owe)}</p>
          <p>Fianzas {eur(c.deposits)} · instalaciones y mejoras {eur(c.assets)}</p>
          <p>Capital {eur(c.capital)} · resultado acumulado {eur(c.result)}</p>
          {c.credit && <p>Póliza de crédito: hasta {eur(c.credit.limit)}</p>}
          {loans.map((l) => <p key={l.id}>{cap(l.label.replace(/^(el|la) /, ""))}: debes {eur(l.principal)} · cuota de {eur(l.monthly)} al mes al {(l.annualRate * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })}{"\u00a0"}%{l.variable ? " variable" : ""}</p>)}
          <p>Forma jurídica: {c.legal?.form === "sl" ? `sociedad limitada (capital de ${eur(c.legal.capital)})${c.legal.avalPersonal ? ", con tu aval personal en el préstamo" : ""}` : "autónomo"}</p>
        </div>
      </details>
      <details className={box}>
        <summary className={sum}>Clientes y contratos ({deals.length})</summary>
        {deals.length === 0 ? <p className="mt-1 text-slate-600">Aún no tienes clientes fijos.</p> : (
          <ul className="mt-1 space-y-1">{deals.map((d) => <li key={d.id}>{clientName(d.client)}: {d.kind === "transporte" ? `${d.km} km a la semana a ${d.rate!.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km${d.sub ? " (subcontratado)" : ""}` : `${d.pallets} palés a ${d.palletRate!.toLocaleString("es-ES", { minimumFractionDigits: 2 })} € por palé y semana${d.id === "l9-frio" ? " (cámara de frío)" : d.external ? " (espacio externo)" : ""}`} · cobro a {d.payWeeks * 7} días · relación {Math.round(c.relation[d.client] ?? 50)}/100</li>)}</ul>
        )}
      </details>
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
