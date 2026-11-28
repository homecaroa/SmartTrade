"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calificar, muestraFinal, prepararPregunta, rng, semillaDe, barajar, type PreguntaVista } from "@/lib/practica/engine";
import { VERIFICACION_TEXTO, type Pregunta } from "@/lib/practica/schema";
import { clearState, loadState, saveState } from "@/lib/learning/storage";

/**
 * Test de estudio. Dos modos:
 *  - «estudio»: se corrige cada pregunta al contestar y se muestra la explicación, el criterio y el nivel de verificación.
 *  - «examen»: sin corrección hasta entregar; nota con penalización de medio acierto por fallo; repaso al final.
 * El orden de preguntas y de opciones sale de una semilla (clave + nº de intento): el mismo intento se reproduce igual.
 * El nº de intento y la mejor nota se guardan en localStorage, solo como comodidad (si se bloquea, todo funciona igual).
 */
interface Guardado { intento: number; mejor: { aciertos: number; total: number } | null }
const esGuardado = (x: unknown): x is Guardado => {
  if (typeof x !== "object" || x === null) return false;
  const g = x as Guardado;
  return Number.isInteger(g.intento) && g.intento >= 0 && (g.mejor === null || (typeof g.mejor === "object" && Number.isFinite(g.mejor.aciertos) && Number.isFinite(g.mejor.total)));
};
const claveStorage = (clave: string) => `smartrade:practica:v1:${clave}`;
const LETRAS = ["A", "B", "C", "D"];

export interface QuizProps {
  clave: string;
  titulo: string;
  modo: "estudio" | "examen";
  preguntas: Pregunta[];
  /** Etiqueta de grupo (unidad) por id de pregunta, para el desglose del test final. */
  grupos?: Record<string, string>;
  /** Test final: preguntas por unidad; en cada intento se toma una muestra repartida por peso (con la semilla del intento). */
  porUnidad?: Pregunta[][];
  volver: { href: string; texto: string };
}

export function Quiz({ clave, titulo, modo, preguntas, porUnidad, grupos, volver }: QuizProps) {
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  useEffect(() => { setGuardado(loadState(claveStorage(clave), esGuardado) ?? { intento: 0, mejor: null }); }, [clave]);
  if (!guardado) return <p className="text-sm text-slate-600" role="status">Cargando…</p>;
  return <Intento key={`${clave}:${guardado.intento}`} {...{ clave, titulo, modo, preguntas, porUnidad, grupos, volver }} guardado={guardado}
    onTerminar={(aciertos, total) => {
      const mejor = !guardado.mejor || aciertos / total > guardado.mejor.aciertos / guardado.mejor.total ? { aciertos, total } : guardado.mejor;
      saveState(claveStorage(clave), { intento: guardado.intento, mejor });
      setGuardado({ ...guardado, mejor });
    }}
    onRepetir={() => { const n = { intento: guardado.intento + 1, mejor: guardado.mejor }; saveState(claveStorage(clave), n); setGuardado(n); }}
    onBorrar={() => { clearState(claveStorage(clave)); setGuardado({ intento: 0, mejor: null }); }} />;
}

interface IntentoProps extends QuizProps { guardado: Guardado; onTerminar: (a: number, t: number) => void; onRepetir: () => void; onBorrar: () => void }

function Intento({ clave, titulo, modo, preguntas, porUnidad, grupos, volver, guardado, onTerminar, onRepetir, onBorrar }: IntentoProps) {
  const vistas: PreguntaVista[] = useMemo(() => {
    const azar = rng(semillaDe(clave, guardado.intento));
    const base = porUnidad ? muestraFinal(porUnidad, azar) : preguntas;
    return barajar(base, azar).map((q) => prepararPregunta(q, azar));
  }, [clave, guardado.intento, preguntas, porUnidad]);
  const [pos, setPos] = useState(0);
  const [elegidas, setElegidas] = useState<(number | null)[]>(() => vistas.map(() => null));
  const [entregado, setEntregado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const total = vistas.length;
  const correctas = vistas.map((v, i) => elegidas[i] === v.q.respuesta);
  const contestadas = elegidas.map((e) => e !== null);
  const nContestadas = contestadas.filter(Boolean).length;
  const terminado = modo === "estudio" ? nContestadas === total && pos >= total : entregado;

  useEffect(() => { if (terminado) onTerminar(correctas.filter(Boolean).length, total); }, [terminado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (terminado) return <Resultado {...{ titulo, modo, vistas, elegidas, correctas, contestadas, grupos, volver, mejor: guardado.mejor, onRepetir, onBorrar }} />;

  const v = vistas[pos];
  const eleg = elegidas[pos];
  const corregida = modo === "estudio" && eleg !== null;
  const elegir = (idx: number) => {
    if (modo === "estudio" && eleg !== null) return;
    setElegidas((e) => e.map((x, i) => (i === pos ? (modo === "examen" && x === idx ? null : idx) : x)));
  };
  return (
    <section className="space-y-4" aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{titulo} · pregunta {pos + 1} de {total} · contestadas {nContestadas}</span>
        <Link href={volver.href} className="underline">{volver.texto}</Link>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-200" aria-hidden><div className="h-full bg-indigo-600" style={{ width: `${(nContestadas / total) * 100}%` }} /></div>
      <p className="text-lg font-semibold text-slate-900">{v.q.enunciado}</p>
      <div className="space-y-2" role="group" aria-label="Opciones">
        {v.opciones.map((o, i) => {
          const esCorrecta = o.idx === v.q.respuesta, esElegida = o.idx === eleg;
          const estado = corregida ? (esCorrecta ? "border-emerald-600 bg-emerald-50" : esElegida ? "border-red-600 bg-red-50" : "border-slate-300 bg-white opacity-70")
            : esElegida ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50";
          return (
            <button key={o.idx} type="button" onClick={() => elegir(o.idx)} aria-pressed={esElegida} disabled={corregida}
              className={`flex w-full items-start gap-3 rounded border px-3 py-2 text-left text-sm ${estado}`}>
              <span className="font-bold">{LETRAS[i]})</span><span>{o.texto}</span>
              {corregida && esCorrecta && <span className="ml-auto font-semibold text-emerald-700">Correcta</span>}
              {corregida && esElegida && !esCorrecta && <span className="ml-auto font-semibold text-red-700">Tu respuesta</span>}
            </button>
          );
        })}
      </div>
      {corregida && <Explicacion q={v.q} />}
      <div className="flex flex-wrap items-center gap-3">
        {modo === "examen" && <button type="button" disabled={pos === 0} onClick={() => setPos(pos - 1)} className="rounded border px-3 py-1 text-sm disabled:opacity-40">Anterior</button>}
        {modo === "estudio" && corregida && <button type="button" onClick={() => setPos(pos + 1)} className="rounded bg-indigo-700 px-3 py-1 text-sm font-semibold text-white">{pos + 1 < total ? "Siguiente" : "Ver resultado"}</button>}
        {modo === "examen" && pos + 1 < total && <button type="button" onClick={() => setPos(pos + 1)} className="rounded bg-indigo-700 px-3 py-1 text-sm font-semibold text-white">Siguiente</button>}
        {modo === "examen" && !confirmando && <button type="button" onClick={() => setConfirmando(true)} className="rounded border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-800">Entregar</button>}
        {modo === "examen" && confirmando && (
          <span className="flex items-center gap-2 text-sm">
            {total - nContestadas > 0 ? `Quedan ${total - nContestadas} en blanco.` : "Todas contestadas."} ¿Entregar?
            <button type="button" onClick={() => setEntregado(true)} className="rounded bg-emerald-700 px-3 py-1 font-semibold text-white">Sí, entregar</button>
            <button type="button" onClick={() => setConfirmando(false)} className="rounded border px-3 py-1">Seguir</button>
          </span>
        )}
      </div>
    </section>
  );
}

function Explicacion({ q }: { q: Pregunta }) {
  return (
    <div className="space-y-1 rounded border border-slate-300 bg-slate-50 p-3 text-sm" role="status">
      <p>{q.explicacion}</p>
      <p className="text-xs text-slate-600">Criterio {q.criterio} · Fuente: {q.fuente}</p>
      <p className="text-xs"><span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold">{q.verificacion}</span> <span className="text-slate-600">{VERIFICACION_TEXTO[q.verificacion]}</span></p>
    </div>
  );
}

interface ResultadoProps {
  titulo: string; modo: "estudio" | "examen"; vistas: PreguntaVista[]; elegidas: (number | null)[]; correctas: boolean[]; contestadas: boolean[];
  grupos?: Record<string, string>; volver: { href: string; texto: string }; mejor: Guardado["mejor"];
  onRepetir: () => void; onBorrar: () => void;
}
const num = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Resultado({ titulo, modo, vistas, elegidas, correctas, contestadas, grupos, volver, mejor, onRepetir, onBorrar }: ResultadoProps) {
  const r = calificar(correctas, contestadas);
  const desglose = useMemo(() => {
    if (!grupos) return [];
    const m = new Map<string, { ok: number; n: number }>();
    vistas.forEach((v, i) => { const g = grupos[v.q.id] ?? "Otras"; const x = m.get(g) ?? { ok: 0, n: 0 }; x.n++; if (correctas[i]) x.ok++; m.set(g, x); });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }));
  }, [grupos, vistas, correctas]);
  const falladas = vistas.map((v, i) => ({ v, i })).filter(({ i }) => !correctas[i]);
  return (
    <section className="space-y-4" aria-label="Resultado">
      <h2 className="text-xl font-bold">{titulo}: {r.aciertos} de {r.total}</h2>
      {modo === "examen" ? (
        <p>Nota con penalización de medio acierto por fallo: <strong>{num(r.sobre10)}</strong> sobre 10 ({r.fallos} fallos, {r.blancos} en blanco). Sin penalizar: {num(r.sobre10SinPenalizar)}. <span className="text-xs text-slate-600">Convención didáctica, no la de un examen oficial concreto.</span></p>
      ) : <p>{num(r.sobre10SinPenalizar)} sobre 10.</p>}
      {mejor && <p className="text-sm text-slate-600">Mejor resultado guardado en este navegador: {mejor.aciertos} de {mejor.total}.</p>}
      {desglose.length > 0 && (
        <table className="w-full max-w-md text-sm"><caption className="text-left font-semibold">Por unidad</caption><tbody>
          {desglose.map(([g, x]) => <tr key={g} className="border-b"><td className="py-1">{g}</td><td className="text-right">{x.ok} / {x.n}</td></tr>)}
        </tbody></table>
      )}
      {falladas.length > 0 && (
        <div className="space-y-3"><h3 className="font-semibold">Repaso de fallos y blancos ({falladas.length})</h3>
          {falladas.map(({ v, i }) => (
            <div key={v.q.id} className="space-y-1 rounded border p-3 text-sm">
              <p className="font-semibold">{v.q.enunciado}</p>
              <p>{elegidas[i] === null ? "En blanco." : <>Elegiste: <span className="text-red-700">{v.q.opciones[elegidas[i] as number]}</span></>}</p>
              <p>Correcta: <span className="font-semibold text-emerald-700">{v.q.opciones[v.q.respuesta]}</span></p>
              <Explicacion q={v.q} />
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onRepetir} className="rounded bg-indigo-700 px-3 py-1 text-sm font-semibold text-white">Repetir con otro orden</button>
        <Link href={volver.href} className="rounded border px-3 py-1 text-sm">{volver.texto}</Link>
        <button type="button" onClick={onBorrar} className="text-xs underline">Borrar mi progreso de este test</button>
      </div>
    </section>
  );
}
