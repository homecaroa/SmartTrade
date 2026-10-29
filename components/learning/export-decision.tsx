"use client";

import { useState } from "react";
import { resolve, ctxOf } from "@/lib/learning/export/engine";
import { displayOrder } from "@/lib/learning/order";
import type { Answers, Decision, ExportScenario } from "@/lib/learning/export/types";

/** Formulario de una decisión: opciones únicas (radio) o selección de documentos (casillas). */
export function ExportDecision({ sc, d, answers, onConfirm }: { sc: ExportScenario; d: Decision; answers: Answers; onConfirm: (value: string | string[]) => void }) {
  const ctx = ctxOf(sc, answers);
  const [one, setOne] = useState<string>("");
  const [many, setMany] = useState<string[]>([]);
  const name = `decision-${d.id}`;
  return (
    <form
      className={`space-y-3 rounded-lg p-4 shadow-sm ${d.incident ? "border-2 border-rose-300 bg-rose-50" : "bg-white"}`}
      onSubmit={(e) => { e.preventDefault(); if (d.kind === "single" && !one) return; onConfirm(d.kind === "single" ? one : many); }}
    >
      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">{d.incident ? "⚠️ " : ""}{d.title}</legend>
        <p className="text-sm">{resolve(d.prompt, ctx)}</p>
        {d.concept && <p className="rounded bg-slate-50 p-2 text-xs text-slate-700"><b>Concepto:</b> {d.concept}</p>}
        {d.kind === "single" ? (
          <div className="space-y-2">
            {displayOrder(d.options, `${sc.id}:${d.id}`).map((o) => (
              <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300">
                <input type="radio" name={name} value={o.id} checked={one === o.id} onChange={() => setOne(o.id)} className="mt-1" />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {displayOrder(resolve(d.docs, ctx), `${sc.id}:${d.id}`).map((o) => (
              <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300">
                <input type="checkbox" name={name} value={o.id} checked={many.includes(o.id)} onChange={(e) => setMany((m) => (e.target.checked ? [...m, o.id] : m.filter((x) => x !== o.id)))} className="mt-1" />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <button type="submit" disabled={d.kind === "single" && !one} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400">
        Confirmar decisión
      </button>
      <p className="text-xs text-slate-500">Una vez confirmada no se puede cambiar.</p>
    </form>
  );
}
