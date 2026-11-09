import Link from "next/link";
import { CaseProgress } from "@/components/learning/case-progress";
import { SimulatedNotice } from "@/components/learning/simulated-notice";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { IMPORT_SCENARIOS } from "@/lib/learning/import/scenarios";
import { NEGOTIATION_SCENARIOS } from "@/lib/learning/negotiation/scenarios";

const DIFF_STYLE = { básica: "bg-emerald-100 text-emerald-900", media: "bg-amber-100 text-amber-900", avanzada: "bg-rose-100 text-rose-900" } as const;

/** Portada del Modo Aprendizaje. Desde el 09/11/2026 es la portada de SmarTrade (`app/page.tsx`). */
export function LearningHome() {
  const card = "space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Modo Aprendizaje</h1>
        <p className="text-sm">Practica situaciones reales del comercio internacional, pensadas para el Grado Superior de Comercio Internacional: <b>gestionar una exportación</b> de principio a fin (incluida la planificación del transporte internacional), <b>gestionar una importación</b> (aranceles, antidumping, valor en aduana, IVA y despacho) y <b>negociar con un comprador extranjero</b>. Cada decisión tiene consecuencias y al final recibes una nota de conocimientos y, por separado, el resultado económico.</p>
        <p className="text-sm">Todo es simulado y no se consulta ninguna API externa. El progreso se guarda solo en este navegador. Si quieres consultar estadísticas reales de comercio exterior, está el <Link className="underline" href="/mercados">análisis de mercados</Link>.</p>
        <SimulatedNotice />
      </section>

      <section className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4" aria-labelledby="mod-sim">
        <h2 id="mod-sim" className="text-lg font-semibold">Nuevo: Business Simulator</h2>
        <p className="text-sm">Dirige un pequeño operador logístico de Valencia semana a semana: acepta trabajos según tu capacidad, cobra, paga y mantén la caja a flote durante una temporada de 26 semanas.</p>
        <Link href="/simulador" className="inline-block rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-700">Jugar</Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="mod-export">
          <h2 id="mod-export" className="text-lg font-semibold">Operación de exportación</h2>
          <p className="text-sm text-slate-700">Del acuerdo comercial a la entrega y el cobro: Incoterm, ruta de transporte (comparando carretera, barco, avión, tren y combinaciones, con peso tasable, contenedores y presupuesto por conceptos), documentos, aduanas, una incidencia y la liquidación económica. El itinerario cambia según el destino y tus decisiones.</p>
          {EXPORT_SCENARIOS.map((sc) => (
            <article key={sc.id} className={card}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{sc.title}</h3><span className={`rounded px-2 py-0.5 text-xs ${DIFF_STYLE[sc.difficulty]}`}>Dificultad {sc.difficulty}</span></div>
              <p className="text-sm">{sc.summary}</p>
              <p className="text-xs text-slate-600"><b>Aprenderás a:</b> {sc.learningGoal}</p>
              <CaseProgress module="exportacion" caseId={sc.id} href={`/aprendizaje/exportacion/${sc.id}`} />
            </article>
          ))}
        </section>
        <section className="space-y-3" aria-labelledby="mod-neg">
          <h2 id="mod-neg" className="text-lg font-semibold">Negociación internacional</h2>
          <p className="text-sm text-slate-700">Prepara tu estrategia, haz ofertas con valores concretos y responde a las contraofertas de un comprador simulado que decide con reglas fijas, sin azar.</p>
          {NEGOTIATION_SCENARIOS.map((sc) => (
            <article key={sc.id} className={card}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{sc.title}</h3><span className={`rounded px-2 py-0.5 text-xs ${DIFF_STYLE[sc.difficulty]}`}>Dificultad {sc.difficulty}</span></div>
              <p className="text-sm">{sc.summary}</p>
              <p className="text-xs text-slate-600"><b>Aprenderás a:</b> {sc.learningGoal}</p>
              <CaseProgress module="negociacion" caseId={sc.id} href={`/aprendizaje/negociacion/${sc.id}`} />
            </article>
          ))}
        </section>
      </div>

      <section className="space-y-3" aria-labelledby="mod-import">
        <h2 id="mod-import" className="text-lg font-semibold">Operación de importación</h2>
        <p className="text-sm text-slate-700">Eres el comprador español: eliges proveedor por el coste puesto en almacén, clasificas la mercancía, calculas el valor en aduana y el IVA, y despachas.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {IMPORT_SCENARIOS.map((sc) => (
            <article key={sc.id} className={card}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{sc.title}</h3><span className={`rounded px-2 py-0.5 text-xs ${DIFF_STYLE[sc.difficulty]}`}>Dificultad {sc.difficulty}</span></div>
              <p className="text-sm">{sc.summary}</p>
              <p className="text-xs text-slate-600"><b>Aprenderás a:</b> {sc.learningGoal}</p>
              <CaseProgress module="importacion" caseId={sc.id} href={`/aprendizaje/importacion/${sc.id}`} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
