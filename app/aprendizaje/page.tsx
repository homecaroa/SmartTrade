import { CaseProgress } from "@/components/learning/case-progress";
import { SimulatedNotice } from "@/components/learning/simulated-notice";
import Link from "next/link";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { NEGOTIATION_SCENARIOS } from "@/lib/learning/negotiation/scenarios";

export const metadata = { title: "Modo Aprendizaje · SmarTrade" };

const DIFF_STYLE = { básica: "bg-emerald-100 text-emerald-900", media: "bg-amber-100 text-amber-900", avanzada: "bg-rose-100 text-rose-900" } as const;

export default function Learning() {
  const card = "space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Modo Aprendizaje</h1>
        <p className="text-sm">Practica situaciones reales del comercio internacional, pensadas para el Grado Superior de Comercio Internacional: <b>gestionar una exportación</b> de principio a fin , <b>negociar con un comprador extranjero</b> y <b>organizar el transporte internacional</b> en el Laboratorio de logística. Cada decisión tiene consecuencias y al final recibes una nota de conocimientos y, por separado, el resultado económico.</p>
        <p className="text-sm">Es independiente del análisis de mercados: sus resultados no afectan a los rankings ni a las puntuaciones, y no se consulta ninguna API externa. El progreso se guarda solo en este navegador.</p>
        <SimulatedNotice />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm" aria-labelledby="mod-log">
        <div className="space-y-1">
          <h2 id="mod-log" className="text-lg font-semibold">Laboratorio de logística</h2>
          <p className="text-sm text-slate-700">Cuatro rutas desde Sevilla (Alemania, Marruecos, EE. UU. y Japón): compara modalidades, calcula peso tasable, contenedores y presupuesto, elige el Incoterm y resuelve una incidencia.</p>
        </div>
        <Link href="/aprendizaje/logistica" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Entrar al laboratorio</Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="mod-export">
          <h2 id="mod-export" className="text-lg font-semibold">Operación de exportación</h2>
          <p className="text-sm text-slate-700">Del acuerdo comercial a la entrega y el cobro: Incoterm, logística, documentos, aduanas, una incidencia y la liquidación económica. El itinerario cambia según el destino y tus decisiones.</p>
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
    </div>
  );
}
