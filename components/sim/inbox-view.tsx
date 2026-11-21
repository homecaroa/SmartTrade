"use client";

import { useEffect, useState } from "react";
import { ENGLISH_GLOSSARY, inboxFor, replyExercise, type Mail } from "@/lib/sim/inbox";
import { displayOrder } from "@/lib/learning/order";
import { GradeBadge } from "../learning/grade-badge";
import type { Action, SimState } from "@/lib/sim/model";
import { IncidentCard, OfferCard } from "./week-view";
import { weekLabel } from "@/lib/sim/calendar";

/**
 * Bandeja de correos (11/11/2026; lib/sim/inbox.ts). Otra forma de ver las ofertas e incidencias de la semana, escritas
 * por los clientes (los viajes internacionales, en inglés). Debajo de cada correo están las mismas acciones que en la
 * pestaña Semana: responder es aceptar, negociar o decidir. Los correos leídos se recuerdan solo en este navegador.
 */
const READ_KEY = "smartrade:simulador:correos-leidos";
const loadRead = (): string[] => { try { return JSON.parse(window.localStorage.getItem(READ_KEY) ?? "[]"); } catch { return []; } };

export function InboxView({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  // Los correos ya respondidos se quedan en la lista hasta que cambie la semana (la oferta ya no está en el estado).
  const [kept, setKept] = useState<{ week: number; mails: Mail[] }>({ week: s.week, mails: [] });
  const current = inboxFor(s);
  const base = kept.week === s.week ? kept.mails : [];
  const mails = mergeKeep(base, current);
  useEffect(() => { setKept((k) => ({ week: s.week, mails: mergeKeep(k.week === s.week ? k.mails : [], inboxFor(s)) })); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openId, setOpenId] = useState<string | null>(mails[0]?.id ?? null);
  const [read, setRead] = useState<string[]>([]);
  useEffect(() => { setRead(loadRead()); }, []);
  const key = (m: Mail) => `${s.seed}:${m.week}:${m.id}`;
  const open = mails.find((m) => m.id === openId) ?? mails[0] ?? null;
  useEffect(() => {
    if (!open || read.includes(key(open))) return;
    const next = [...read, key(open)].slice(-300);
    setRead(next);
    try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* sin guardar: solo es comodidad */ }
  }, [open?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mails.length) return <p className="rounded-lg bg-white p-4 text-sm text-slate-600 shadow-sm">No tienes correos esta semana.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <ul className="space-y-1" aria-label="Correos de la semana">
        {mails.map((m) => {
          const unread = !read.includes(key(m));
          return (
            <li key={m.id}>
              <button type="button" onClick={() => setOpenId(m.id)} aria-current={open?.id === m.id}
                className={`w-full rounded border p-2 text-left text-sm ${open?.id === m.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
                <span className="flex items-center justify-between gap-2"><span className={unread ? "font-bold" : "font-medium"}>{m.from.name}</span>{m.lang === "en" && <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold">EN</span>}</span>
                <span className="block truncate text-xs text-slate-600">{m.subject}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && <MailReader key={open.id} m={open} s={s} onAction={onAction} />}
    </div>
  );
}

/** Une los correos ya vistos esta semana con los actuales, sin repetir y en el orden en que llegaron. */
function mergeKeep(seen: Mail[], current: Mail[]): Mail[] {
  const out = [...seen];
  for (const m of current) { const i = out.findIndex((x) => x.id === m.id); if (i >= 0) out[i] = m; else out.push(m); }
  return out;
}

function MailReader({ m, s, onAction }: { m: Mail; s: SimState; onAction: (a: Action) => void }) {
  const offer = m.ref.kind === "oferta" ? s.offers.find((o) => o.id === (m.ref as { offerId: string }).offerId) : undefined;
  const incident = m.ref.kind === "incidencia" && s.pending?.id === (m.ref as { incidentId: string }).incidentId;
  return (
    <article className="space-y-3 rounded-lg bg-white p-4 shadow-sm" lang={m.lang}>
      <header className="border-b border-slate-200 pb-2">
        <h2 className="text-base font-semibold">{m.subject}</h2>
        <p className="text-xs text-slate-600">{m.from.name}{m.from.role ? ` · ${m.from.role}` : ""}{m.from.company ? ` · ${m.from.company}` : ""} · {weekLabel(s, m.week).toLowerCase()}</p>
      </header>
      <div className="space-y-2 text-sm">{m.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      {m.lang === "en" && <p className="text-xs text-slate-600">Correo en inglés: los clientes internacionales escriben así. Las condiciones son las mismas que en la oferta de abajo.</p>}
      <EnglishReply m={m} s={s} onAction={onAction} />
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">Ficha de datos del correo</summary>
        <p className="mt-1">El correo solo usa estos datos del juego (cuando haya IA, será lo único que reciba).</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 sm:grid-cols-3">{Object.entries(m.facts).map(([k, v]) => <div key={k}><dt className="font-semibold">{k.replace(/_/g, " ")}</dt><dd>{typeof v === "number" ? v.toLocaleString("es-ES") : v}</dd></div>)}</dl>
      </details>
      <section aria-label="Responder" className="space-y-2 border-t border-slate-200 pt-2">
        <h3 className="text-sm font-semibold">Responder</h3>
        {offer ? <OfferCard o={offer} s={s} onAction={onAction} />
          : incident ? <IncidentCard s={s} onAction={onAction} />
          : m.ref.kind === "aviso" ? <p className="text-sm text-slate-600">Es un aviso: no hace falta responder.</p>
          : m.ref.kind === "oferta" && s.contracts.some((c) => c.id === (m.ref as { offerId: string }).offerId) ? <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">Ya respondiste: aceptaste esta oferta.</p>
          : m.ref.kind === "oferta" ? <p className="text-sm text-slate-600">Ya respondiste: el cliente ya no la ofrece (se fue con otro transportista al negociar).</p>
          : <p className="text-sm text-slate-600">Ya respondiste a este correo.</p>}
      </section>
    </article>
  );
}

/** Practicar la respuesta en inglés: elegir entre tres borradores; la corrección queda en el informe (0824 RA2). */
function EnglishReply({ m, s, onAction }: { m: Mail; s: SimState; onAction: (a: Action) => void }) {
  const ex = replyExercise(m);
  const [pick, setPick] = useState("");
  if (!ex) return null;
  const chosen = s.answers[`correo-${m.id}`];
  const opts = displayOrder(ex.options, `${s.seed}:${m.id}:reply`);
  if (chosen) {
    const o = ex.options.find((x) => x.id === chosen)!;
    return (
      <section className="space-y-1 rounded border border-indigo-200 bg-indigo-50 p-2 text-sm" aria-label="Tu respuesta en inglés">
        <p className="flex flex-wrap items-center gap-2 font-semibold">Tu respuesta: {o.label} <GradeBadge grade={o.grade} /></p>
        <div className="space-y-1 rounded bg-white p-2" lang="en">{o.text.map((x, i) => <p key={i}>{x}</p>)}</div>
        <p>{o.feedback}</p>
        {o.grade !== "correcta" && <details><summary className="cursor-pointer text-xs">Ver la respuesta correcta</summary><div className="mt-1 space-y-1 rounded bg-white p-2" lang="en">{ex.options.find((x) => x.grade === "correcta")!.text.map((x, i) => <p key={i}>{x}</p>)}</div></details>}
      </section>
    );
  }
  return (
    <form className="space-y-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-sm" onSubmit={(e) => { e.preventDefault(); if (pick) onAction({ t: "correo", correo: m.id, opcion: pick }); }}>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Practica tu inglés: {ex.prompt}</legend>
        {opts.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 hover:border-indigo-300">
            <input type="radio" name={`reply-${m.id}`} value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1" />
            <span className="space-y-1" lang="en">{o.text.map((x, i) => <span key={i} className="block">{x}</span>)}</span>
          </label>
        ))}
      </fieldset>
      <details className="text-xs"><summary className="cursor-pointer">Vocabulario</summary><dl className="mt-1 grid grid-cols-2 gap-x-3">{ENGLISH_GLOSSARY.map(([en, es]) => <div key={en}><dt className="font-semibold" lang="en">{en}</dt><dd>{es}</dd></div>)}</dl></details>
      <button type="submit" disabled={!pick || s.status !== "jugando"} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Enviar esta respuesta</button>
    </form>
  );
}
