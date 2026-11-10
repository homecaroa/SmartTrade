"use client";

import { useEffect, useRef, useState } from "react";
import { apply, newGame, pendingPayables, pendingReceivables, serviceLevelToDate } from "@/lib/sim/engine";
import type { Action, SimState } from "@/lib/sim/model";
import { SEASON_WEEKS } from "@/lib/sim/params";
import { parseSave, restore, SAVE_KEY, toSave } from "@/lib/sim/save";
import { fmtEur, sum } from "@/lib/learning/money";
import { SimulatedNotice } from "../learning/simulated-notice";
import { FinanceView } from "./finance-view";
import { ReportView } from "./report-view";
import { WeekView } from "./week-view";

interface Game { seed: number; actions: Action[]; state: SimState }
type Tab = "semana" | "finanzas" | "informe";

/** Semilla nueva: fuera del motor (el motor no usa azar propio). */
const randomSeed = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000; } catch { return Date.now() % 1_000_000; } };

export function Simulator() {
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("semana");
  const [message, setMessage] = useState<string | null>(null);
  const [lastWeek, setLastWeek] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const p = parseSave(JSON.parse(raw));
        if (p.ok) { const r = restore(p.save); setGame({ seed: p.save.seed, actions: r.actions, state: r.state }); if (p.warning) setMessage(p.warning); }
      }
    } catch { /* sin almacenamiento: se juega sin guardar */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (game) try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(game.seed, game.actions, game.state.version))); } catch { /* sin guardar */ } }, [game]);

  const start = (seed: number) => { setGame({ seed, actions: [], state: newGame(seed) }); setTab("semana"); setLastWeek(null); setMessage(null); };
  const act = (a: Action) => {
    if (!game) return;
    try {
      const before = game.state.weeks.length;
      const state = apply(game.state, a);
      setGame({ ...game, actions: [...game.actions, a], state });
      if (state.weeks.length > before) { setLastWeek(state.weeks[state.weeks.length - 1].week); headingRef.current?.focus(); }
      setMessage(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Acción no válida."); }
  };
  const exportFile = () => {
    if (!game) return;
    const blob = new Blob([JSON.stringify(toSave(game.seed, game.actions, game.state.version), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `smartrade-partida-${game.seed}-semana-${game.state.week}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    try {
      const p = parseSave(JSON.parse(await f.text()));
      if (!p.ok) { setMessage(p.error); return; }
      const r = restore(p.save);
      setGame({ seed: p.save.seed, actions: r.actions, state: r.state });
      setMessage([p.warning, r.dropped ? `${r.dropped} acciones ya no son válidas con las reglas actuales y se han descartado.` : null].filter(Boolean).join(" ") || "Partida importada.");
    } catch { setMessage("No se ha podido leer el archivo."); }
  };

  if (!loaded) return <p className="text-sm text-slate-600">Cargando…</p>;
  if (!game) return <StartScreen onStart={start} onImport={importFile} message={message} />;

  const s = game.state;
  const last = s.weeks[s.weeks.length - 1];
  const tabBtn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`rounded-t border-b-2 px-3 py-1.5 text-sm font-semibold ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{label}</button>
  );
  return (
    <div className="space-y-4">
      <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Business Simulator · temporada de {SEASON_WEEKS} semanas · partida {game.seed}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold">Transportes y Almacenes del Turia (ficticia)</h1>
        <SimulatedNotice compact />
        <div className="grid gap-2 text-sm md:grid-cols-[auto_1fr_1fr]">
          <dl className="grid grid-cols-2 gap-2 rounded border border-slate-200 p-2 md:grid-cols-1">
            <div><dt className="text-slate-600">Semana</dt><dd className="text-lg font-bold">{s.status === "fin" || s.status === "quiebra" ? "Terminada" : `${s.week} de ${SEASON_WEEKS}`}</dd></div>
            <div><dt className="text-slate-600">Nivel de servicio (reputación)</dt><dd className="text-lg font-bold">{serviceLevelToDate(s).toLocaleString("es-ES")} %</dd></div>
          </dl>
          <div className="rounded border border-slate-200 p-2" aria-label="Beneficio">
            <p className="text-xs font-semibold uppercase text-slate-600">Beneficio · cuenta de resultados</p>
            <dl className="mt-1 grid grid-cols-2 gap-2">
              <div><dt className="text-slate-600">Última semana</dt><dd className={`text-lg font-bold ${(last?.result ?? 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{last ? fmtEur(last.result) : "—"}</dd></div>
              <div><dt className="text-slate-600">Acumulado</dt><dd className={`text-lg font-bold ${s.result < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtEur(s.result)}</dd></div>
            </dl>
          </div>
          <div className="rounded border border-slate-200 p-2" aria-label="Tesorería">
            <p className="text-xs font-semibold uppercase text-slate-600">Tesorería · caja</p>
            <dl className="mt-1 grid grid-cols-3 gap-2">
              <div><dt className="text-slate-600">Caja</dt><dd className={`text-lg font-bold ${s.cash < 0 ? "text-rose-700" : ""}`}>{fmtEur(s.cash)}</dd></div>
              <div><dt className="text-slate-600">Por cobrar</dt><dd className="font-semibold">{fmtEur(sum(pendingReceivables(s).map((i) => i.amount)))}</dd></div>
              <div><dt className="text-slate-600">Por pagar</dt><dd className="font-semibold">{fmtEur(sum(pendingPayables(s).map((p) => p.amount)) + s.accruedFixed)}</dd></div>
            </dl>
          </div>
        </div>
        {message && <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">{message}</p>}
      </header>

      <div role="tablist" aria-label="Vistas de la empresa" className="flex gap-1 border-b border-slate-200">
        {tabBtn("semana", "Semana")}{tabBtn("finanzas", "Finanzas")}{tabBtn("informe", s.status === "fin" || s.status === "quiebra" ? "Resumen final" : "Informe")}
      </div>
      <div role="tabpanel">
        {tab === "semana" && <WeekView s={s} lastWeek={lastWeek} onAction={act} onShowReport={() => setTab("informe")} />}
        {tab === "finanzas" && <FinanceView s={s} />}
        {tab === "informe" && <ReportView s={s} onAction={act} />}
      </div>

      <div className="flex flex-wrap gap-3 text-xs print:hidden">
        <button type="button" onClick={exportFile} className="underline">Exportar la partida (archivo)</button>
        <button type="button" onClick={() => { if (window.confirm("¿Empezar una partida nueva? La actual se perderá si no la has exportado.")) start(randomSeed()); }} className="underline">Partida nueva</button>
        <button type="button" onClick={() => { if (window.confirm(`¿Volver a jugar la partida ${game.seed} desde la semana 1? Los sucesos serán los mismos; tus decisiones, nuevas.`)) start(game.seed); }} className="underline">Rejugar esta partida</button>
      </div>
    </div>
  );
}

function StartScreen({ onStart, onImport, message }: { onStart: (seed: number) => void; onImport: (f: File) => void; message: string | null }) {
  const [seed, setSeed] = useState("");
  const valid = /^\d{1,9}$/.test(seed.trim());
  return (
    <section className="space-y-4 rounded-lg bg-white p-6 shadow-sm" aria-labelledby="titulo-simulador">
      <h1 id="titulo-simulador" className="text-xl font-bold">Business Simulator</h1>
      <p className="text-sm">Diriges <b>Transportes y Almacenes del Turia</b> (ficticia), un operador logístico de Valencia: un camión, un almacén de 600 palés, un conductor y un mozo, y 40.000 € en caja. Cada semana eliges qué trabajos aceptas, cobras y pagas. La temporada dura <b>{SEASON_WEEKS} semanas</b>.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Facturar no es cobrar: el transporte se cobra a 30 días y el alquiler y las nóminas se pagan cada 4 semanas.</li>
        <li>El camión hace unos 1.050 km por semana y el almacén guarda 600 palés: lo que aceptes por encima no se puede servir.</li>
        <li><b>Para ganar</b>, al final de la temporada la empresa debe dar beneficio (últimas 8 semanas) y cumplir uno de estos dos: nivel de servicio de al menos el 95 % u ocupación media del almacén de al menos el 70 %. Pierdes si te quedas sin caja dos semanas o si tu servicio cae por debajo del 80 % cuatro semanas seguidas.</li>
        <li>Habrá <b>reclamaciones</b>: mercancía dañada, retrasos o clientes que quieren pagar tarde. La ley marca hasta dónde respondes y lo que hayas documentado cuenta.</li>
        <li>Para <b>crecer</b> puedes subcontratar trabajos, poner un segundo camión (en renting o comprado), ampliar el almacén y pedir una póliza de crédito. Todo cuesta desde el primer día.</li>
        <li>Tu <b>nivel de servicio es tu reputación</b>: si cumples, a partir de la semana 7 los clientes pagan más; si fallas, te llegan menos ofertas y peores.</li>
        <li>Lo que no depende de ti (ofertas, averías, pagos) lo decide la <b>semilla</b> de la partida: con la misma semilla puedes rejugar y comparar estrategias.</li>
      </ul>
      <SimulatedNotice compact />
      {message && <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">{message}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => onStart(randomSeed())} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Empezar una partida nueva</button>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) onStart(Number(seed.trim())); }}>
          <label className="text-sm">Semilla concreta<input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="numeric" className="mt-1 block w-32 rounded border border-slate-300 px-2 py-1" /></label>
          <button type="submit" disabled={!valid} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Jugar esa partida</button>
        </form>
        <label className="text-sm">Importar partida<input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} className="mt-1 block text-xs" /></label>
      </div>
    </section>
  );
}
