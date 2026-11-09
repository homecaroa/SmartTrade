"use client";

import { useState } from "react";
import { iresolve, optionsOf } from "@/lib/learning/import/engine";
import type { ImportAnswers, ImportDecision as Decision, ImportScenario } from "@/lib/learning/import/types";
import { displayOrder } from "@/lib/learning/order";

/** Formulario de una decisión de importación: opción única (radio) o selección múltiple (casillas). */
export function ImportDecision({ sc, d, answers, onConfirm }: { sc: ImportScenario; d: Decision; answers: ImportAnswers; onConfirm: (value: string | string[]) => void }) {
  const ctx = { scenario: sc, answers };
  const [one, setOne] = useState("");
  const [many, setMany] = useState<string[]>([]);
  const name = `decision-${d.id}`;
  const box = "flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300";
  const items: { id: string; label: string }[] = d.kind === "single" ? optionsOf(d, ctx) : iresolve(d.docs, ctx);
  return (
    <form
      className={`space-y-3 rounded-lg p-4 shadow-sm ${d.incident ? "border-2 border-rose-300 bg-rose-50" : "bg-white"}`}
      onSubmit={(e) => { e.preventDefault(); if (d.kind === "single" && !one) return; onConfirm(d.kind === "single" ? one : many); }}
    >
      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">{d.incident ? "⚠️ " : ""}{d.title}</legend>
        <p className="text-sm">{iresolve(d.prompt, ctx)}</p>
        {d.concept && <p className="rounded bg-slate-50 p-2 text-xs text-slate-700"><b>Concepto:</b> {d.concept}</p>}
        <div className="space-y-2">
          {displayOrder(items, `${sc.id}:${d.id}`).map((o) => (
            <label key={o.id} className={box}>
              {d.kind === "single"
                ? <input type="radio" name={name} value={o.id} checked={one === o.id} onChange={() => setOne(o.id)} className="mt-1" />
                : <input type="checkbox" name={name} value={o.id} checked={many.includes(o.id)} onChange={(e) => setMany((m) => (e.target.checked ? [...m, o.id] : m.filter((x) => x !== o.id)))} className="mt-1" />}
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={d.kind === "single" && !one} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Confirmar decisión</button>
    </form>
  );
}
