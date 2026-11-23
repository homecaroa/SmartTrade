"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apply, CAMPAIGN_SAVE_KEY, levelDef, newCampaign, nextLevel, restore, toSave } from "@/lib/sim/campaign/engine";
import { LEVELS } from "@/lib/sim/campaign/levels";
import type { Action, CampaignSave, CampaignState } from "@/lib/sim/campaign/model";
import { SimulatedNotice } from "../../learning/simulated-notice";
import { CompanyPanel, LearningPanel, ManualPanel } from "./panels";
import { Mission } from "./mission";

type Tab = "mision" | "empresa" | "manual" | "aprendizaje";
interface Game { seed: number; levels: Action[][]; state: CampaignState }

const randomSeed = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000; } catch { return Date.now() % 1_000_000; } };

/** Estado al empezar el nivel en curso (para repetirlo): la campaña reconstruida hasta el nivel anterior. */
function stateAtLevelStart(seed: number, levels: Action[][]): CampaignState {
  if (levels.length <= 1) return newCampaign(seed);
  return nextLevel(restore({ seed, levels: levels.slice(0, -1) }).state);
}

/**
 * Campaña del Business Simulator (23/11/2026; docs/simulador-campana.md). Guardado propio: semilla y acciones de cada
 * nivel; la empresa se reconstruye nivel a nivel. No toca las partidas de la Temporada ni de la Carrera.
 */
export function Campaign() {
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("mision");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAMPAIGN_SAVE_KEY);
      if (raw) { const x = JSON.parse(raw) as CampaignSave; if (x.app === "smartrade-campana" && Array.isArray(x.levels)) { const r = restore(x); setGame({ seed: x.seed, levels: r.levels, state: r.state }); if (r.dropped) setMessage(`${r.dropped} acciones guardadas ya no son válidas y se han descartado.`); } }
    } catch { /* sin almacenamiento: se juega sin guardar */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (game) try { window.localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(toSave(game.seed, game.levels))); } catch { /* sin guardar */ } }, [game]);

  const act = (a: Action) => {
    if (!game) return;
    try {
      const state = apply(game.state, a);
      const levels = game.levels.map((l, i) => (i === game.levels.length - 1 ? [...l, a] : l));
      setGame({ ...game, levels, state });
      setMessage(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Acción no válida."); }
  };
  const goNext = () => { if (!game) return; try { setGame({ ...game, levels: [...game.levels, []], state: nextLevel(game.state) }); setTab("mision"); window.scrollTo({ top: 0 }); } catch (e) { setMessage(e instanceof Error ? e.message : "No se puede seguir."); } };
  const repeat = () => { if (!game || !window.confirm("¿Repetir este nivel desde el principio? Tu empresa vuelve a como estaba al empezarlo.")) return; const levels = [...game.levels.slice(0, -1), []]; setGame({ ...game, levels, state: stateAtLevelStart(game.seed, levels) }); setTab("mision"); };
  const start = (seed: number) => { setGame({ seed, levels: [[]], state: newCampaign(seed) }); setTab("mision"); setMessage(null); };
  const exportFile = () => {
    if (!game) return;
    const blob = new Blob([JSON.stringify(toSave(game.seed, game.levels), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `smartrade-campana-${game.seed}-nivel-${game.state.level + 1}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    try { const x = JSON.parse(await f.text()) as CampaignSave; if (x.app !== "smartrade-campana" || !Array.isArray(x.levels)) { setMessage("El archivo no es una campaña del simulador."); return; } const r = restore(x); setGame({ seed: x.seed, levels: r.levels, state: r.state }); setMessage(r.dropped ? `${r.dropped} acciones ya no son válidas y se han descartado.` : "Campaña importada."); }
    catch { setMessage("No se ha podido leer el archivo."); }
  };

  if (!loaded) return <p className="text-sm text-slate-600">Cargando…</p>;
  if (!game) return <StartScreen onStart={start} onImport={importFile} message={message} />;
  const s = game.state;
  const tabBtn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-t border-b-2 px-3 py-1.5 text-sm font-semibold ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{label}</button>
  );
  return (
    <div className="space-y-4">
      <Header s={s} />
      {message && <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">{message}</p>}
      <div role="tablist" aria-label="Vistas de la campaña" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabBtn("mision", "Misión")}{tabBtn("empresa", "Tu empresa")}{tabBtn("manual", `Manual (${s.manual.length})`)}{tabBtn("aprendizaje", "Aprendizaje")}
      </div>
      <div role="tabpanel">
        {tab === "mision" && <Mission s={s} save={{ seed: game.seed, levels: game.levels }} onAction={act} onNext={goNext} onRepeat={repeat} />}
        {tab === "empresa" && <CompanyPanel s={s} />}
        {tab === "manual" && <ManualPanel s={s} />}
        {tab === "aprendizaje" && <LearningPanel s={s} />}
      </div>
      <div className="flex flex-wrap gap-3 text-xs print:hidden">
        <button type="button" onClick={exportFile} className="underline">Exportar la campaña (archivo)</button>
        <button type="button" onClick={() => { if (window.confirm("¿Empezar una campaña nueva? La actual se perderá si no la has exportado.")) start(randomSeed()); }} className="underline">Campaña nueva</button>
        <Link href="/simulador" className="underline">Otros modos</Link>
      </div>
    </div>
  );
}

function Header({ s }: { s: CampaignState }) {
  const def = levelDef(s.level);
  const c = s.company;
  const week = s.status === "sede" ? "Preparación" : s.status === "jugando" ? `Semana ${s.week} de ${def.weeks}` : "Nivel terminado";
  return (
    <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Campaña · Acto {def.act}: {def.actTitle} · Nivel {def.n} de 18 · {def.type}</p>
      <h1 className="text-xl font-bold">{def.title}</h1>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded border border-slate-200 p-2"><dt className="text-xs text-slate-600">Momento</dt><dd className="font-bold">{week}</dd></div>
        <div className="rounded border border-slate-200 p-2"><dt className="text-xs text-slate-600">Caja</dt><dd className={`font-bold ${c.cash < 0 ? "text-rose-700" : ""}`}>{eur(c.cash)}</dd></div>
        <div className="rounded border border-slate-200 p-2"><dt className="text-xs text-slate-600">Resultado acumulado</dt><dd className={`font-bold ${c.result < 0 ? "text-rose-700" : "text-emerald-700"}`}>{eur(c.result)}</dd></div>
        <div className="rounded border border-slate-200 p-2"><dt className="text-xs text-slate-600">Reputación (fiabilidad)</dt><dd className="font-bold">{Math.round(c.reputation.fiabilidad)} / 100</dd></div>
      </dl>
      <SimulatedNotice compact />
    </header>
  );
}

function StartScreen({ onStart, onImport, message }: { onStart: (seed: number) => void; onImport: (f: File) => void; message: string | null }) {
  const [seed, setSeed] = useState("");
  const valid = /^\d{1,9}$/.test(seed.trim());
  const acts = useMemo(() => [
    { n: 1, t: "Arranque", lv: "El primer encargo · Montar la base · El cliente que paga tarde · Tu primer equipo" },
    { n: 2, t: "Consolidación", lv: "El gran cliente · Calidad o nada · Llega la competencia · Segundo vehículo" },
    { n: 3, t: "Crecimiento", lv: "El banco · Almacén de verdad · La licitación · Nueva delegación" },
    { n: 4, t: "Internacional", lv: "Primera ruta europea · Fuera de la UE · Comprar y vender" },
    { n: 5, t: "Grupo empresarial", lv: "Tormenta perfecta · Comprar un competidor · El grupo" },
  ], []);
  return (
    <section className="space-y-4 rounded-lg bg-white p-6 shadow-sm" aria-labelledby="titulo-campana">
      <h1 id="titulo-campana" className="text-xl font-bold">Business Simulator · Campaña</h1>
      <p className="text-sm">Empiezas como autónomo con una furgoneta en renting y 15.000 € de ahorros. Misión a misión, tu empresa crece: instalaciones, clientes, equipo, financiación, competencia, el extranjero… hasta convertirse en un grupo empresarial. Lo que decides en un nivel sigue contigo en los siguientes.</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>Cada nivel es una <b>misión de 4 a 8 semanas</b> con una mecánica nueva y tres objetivos: las <b>estrellas</b> miden tu gestión.</li>
        <li>Hay <b>varias formas</b> de superar cada nivel. Antes de cada decisión importante tienes una pista; después, sus consecuencias explicadas y, al terminar, <b>qué habría pasado</b> si hubieras elegido otra cosa.</li>
        <li>Lo que aprendes se mide aparte: el <b>dominio</b> de cada competencia del ciclo. Los conceptos quedan en tu <b>Manual</b>.</li>
        <li>Entre niveles, en la <b>sede</b>, compras mejoras para tu empresa. Si un nivel sale mal, puedes repetirlo.</li>
      </ul>
      <div className="rounded border border-slate-200 p-3 text-sm">
        <p className="font-semibold">La campaña: 18 niveles en 5 actos</p>
        <ol className="mt-1 space-y-0.5">{acts.map((a) => <li key={a.n}><b>Acto {a.n}. {a.t}:</b> {a.lv}</li>)}</ol>
        <p className="mt-1 text-xs text-slate-600">Disponibles ahora: los niveles 1 a {LEVELS.length}. El resto llegará por entregas.</p>
      </div>
      <SimulatedNotice compact />
      {message && <p role="status" className="rounded bg-amber-50 p-2 text-sm text-amber-900">{message}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => onStart(randomSeed())} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Empezar la campaña</button>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) onStart(Number(seed.trim())); }}>
          <label className="text-sm">Semilla concreta<input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="numeric" className="mt-1 block w-32 rounded border border-slate-300 px-2 py-1" /></label>
          <button type="submit" disabled={!valid} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Jugar esa campaña</button>
        </form>
        <label className="text-sm">Importar campaña<input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} className="mt-1 block text-xs" /></label>
      </div>
    </section>
  );
}

export const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
