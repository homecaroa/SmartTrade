"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isExportSession, progress } from "@/lib/learning/export/engine";
import { exportScenario } from "@/lib/learning/export/scenarios";
import { isLogisticsSession, LOGISTICS_STEPS, type LogisticsSession } from "@/lib/learning/logistics/session";
import { isNegotiationSession } from "@/lib/learning/negotiation/session";
import { clearState, loadState, storageKey, type LearningModule } from "@/lib/learning/storage";

const NEG_STEP = { presentacion: "Presentación", preparacion: "Preparación", oferta: "Negociando", cierre: "Terminado" } as const;

/** Progreso de la sesión en este navegador y acciones para continuar o reiniciar. */
export function CaseProgress({ module, caseId, href }: { module: LearningModule; caseId: string; href: string }) {
  const key = storageKey(module, caseId);
  const [label, setLabel] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (module === "exportacion") {
      const sc = exportScenario(caseId);
      const s = loadState(key, (x): x is Parameters<typeof progress>[1] => isExportSession(x, caseId));
      if (sc && s && s.confirmed.length) { const p = progress(sc, s); setStarted(true); setLabel(p.complete ? "Terminado" : `${p.done} de ${p.total} decisiones`); } else setLabel("Sin empezar");
    } else if (module === "logistica") {
      const s = loadState(key, (x): x is LogisticsSession => isLogisticsSession(x, caseId));
      const i = s ? LOGISTICS_STEPS.findIndex((st) => st.id === s.step) : 0;
      if (s && i > 0) { setStarted(true); setLabel(s.step === "resultado" ? "Terminado" : `Paso ${i + 1} de ${LOGISTICS_STEPS.length}: ${LOGISTICS_STEPS[i].title}`); } else setLabel("Sin empezar");
    } else {
      const s = loadState(key, (x): x is { step: keyof typeof NEG_STEP; rounds: unknown[] } & object => isNegotiationSession(x, caseId));
      if (s && s.step !== "presentacion") { setStarted(true); setLabel(`${NEG_STEP[s.step]}${s.rounds.length ? ` · ${s.rounds.length} ${s.rounds.length === 1 ? "ronda" : "rondas"}` : ""}`); } else setLabel("Sin empezar");
    }
  }, [module, caseId, key]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Progreso: {label ?? "…"}</span>
      <Link href={href} className="rounded bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-700">{started ? "Continuar" : "Empezar"}</Link>
      {started && <button type="button" className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100" onClick={() => { if (window.confirm("¿Reiniciar este caso? Se borrará tu progreso.")) { clearState(key); setStarted(false); setLabel("Sin empezar"); } }}>Reiniciar</button>}
    </div>
  );
}
