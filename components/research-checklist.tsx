import Link from "next/link";
import { RESEARCH_STEPS } from "@/lib/research-checklist";

export function ResearchChecklist() {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm space-y-2 break-inside-avoid" aria-labelledby="siguientes-pasos">
      <h2 id="siguientes-pasos" className="font-semibold">Qué falta por comprobar antes de exportar</h2>
      <p className="text-xs text-slate-500">Todo está pendiente: SmarTrade no ha verificado ninguno de estos puntos. Anota la fecha y la fuente de cada comprobación.</p>
      <ul className="space-y-2 text-sm">
        {RESEARCH_STEPS.map((s) => (
          <li key={s.id} className="flex gap-2">
            <span aria-hidden="true">☐</span>
            <div>
              <span className="font-medium">{s.task}</span> <span className="text-xs text-amber-700">(pendiente)</span>
              <p className="text-slate-600">{s.verify}</p>
              {s.internalHref && <Link className="text-xs underline" href={s.internalHref}>{s.internalTitle}</Link>}
              {s.sourceUrl && <a className="text-xs underline" href={s.sourceUrl} target="_blank" rel="noopener noreferrer">{s.sourceTitle}</a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
