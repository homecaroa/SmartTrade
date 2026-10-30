import { CaseProgress } from "@/components/learning/case-progress";
import { LogisticsNotice } from "@/components/learning/logistics-tables";
import { LOGISTICS_CASES } from "@/lib/learning/logistics/cases";
import { LOGISTICS_STEPS } from "@/lib/learning/logistics/session";

export const metadata = { title: "Laboratorio de logística · Modo Aprendizaje · SmarTrade" };

const DIFF_STYLE = { básica: "bg-emerald-100 text-emerald-900", media: "bg-amber-100 text-amber-900", avanzada: "bg-rose-100 text-rose-900" } as const;
const ORDER = { básica: 0, media: 1, avanzada: 2 } as const;

export default function LogisticsLabIndex() {
  const cases = [...LOGISTICS_CASES].sort((a, b) => ORDER[a.difficulty] - ORDER[b.difficulty]);
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Laboratorio de logística y transporte internacional</h1>
        <p className="text-sm">Organiza el transporte de un pedido desde Sevilla: compara carretera, barco (contenedor completo o grupaje), avión, tren y combinaciones multimodales; elige y justifica una ruta, decide el Incoterm, calcula el presupuesto y resuelve una incidencia. La opción más barata no siempre es la correcta: primero hay que llegar a tiempo y con la mercancía en buen estado.</p>
        <p className="text-sm text-slate-700">Pasos: {LOGISTICS_STEPS.map((s) => s.title).join(" → ")}. Los casos van de menos a más dificultad y se pueden repetir; el progreso se guarda solo en este navegador.</p>
        <LogisticsNotice />
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Fórmulas que usa el laboratorio</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            <li>Aéreo: peso tasable = máx(peso real, volumen m³ × 166,7 kg) (relación 1:6000).</li>
            <li>Grupaje por carretera: peso tasable = máx(peso real, volumen m³ × 333 kg).</li>
            <li>Marítimo LCL: toneladas-volumen (W/M) = máx(peso en toneladas, volumen en m³).</li>
            <li>Marítimo FCL: contenedores = máx(volumen / capacidad útil, peso / carga máxima), hacia arriba; se elige el equipo de 20&apos; o 40&apos; más barato.</li>
            <li>Camión completo: camiones = máx(palés / 33, peso / 24 t, volumen / 85 m³), hacia arriba.</li>
            <li>Seguro: prima (%) × 110 % del valor de la mercancía.</li>
            <li>% logístico = coste logístico total / valor de la mercancía; margen = ingresos − coste de producto − costes que paga el vendedor según el Incoterm.</li>
          </ul>
        </details>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {cases.map((c) => (
          <article key={c.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{c.title}</h2><span className={`rounded px-2 py-0.5 text-xs ${DIFF_STYLE[c.difficulty]}`}>Dificultad {c.difficulty}</span></div>
            <p className="text-sm">{c.summary}</p>
            <p className="text-xs text-slate-600"><b>Aprenderás a:</b> {c.learningGoal}</p>
            <CaseProgress module="logistica" caseId={c.id} href={`/aprendizaje/logistica/${c.id}`} />
          </article>
        ))}
      </div>
    </div>
  );
}
