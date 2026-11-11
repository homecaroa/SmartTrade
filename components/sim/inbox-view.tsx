"use client";

import { useEffect, useState } from "react";
import { inboxFor, type Mail } from "@/lib/sim/inbox";
import type { Action, SimState } from "@/lib/sim/model";
import { IncidentCard, OfferCard } from "./week-view";

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
        <p className="text-xs text-slate-600">{m.from.name}{m.from.role ? ` · ${m.from.role}` : ""}{m.from.company ? ` · ${m.from.company}` : ""} · semana {m.week}</p>
      </header>
      <div className="space-y-2 text-sm">{m.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      {m.lang === "en" && <p className="text-xs text-slate-600">Correo en inglés: los clientes internacionales escriben así. Las condiciones son las mismas que en la oferta de abajo.</p>}
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
