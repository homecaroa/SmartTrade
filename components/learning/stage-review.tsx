"use client";

import { useState } from "react";
import { displayOrder } from "@/lib/learning/order";
import { reviewKey, reviewsFor } from "@/lib/learning/export/review";
import type { Answers, StageId } from "@/lib/learning/export/types";

/**
 * Repaso al cerrar una etapa (propuesta 9): dos preguntas de conceptos. Primero se responden; después se ve la
 * corrección con su explicación. No cuenta en la nota de conocimientos.
 */
export function StageReview({ caseId, stage, title, answers, onSubmit, onContinue }: {
  caseId: string; stage: StageId; title: string; answers: Answers;
  onSubmit?: (picks: Record<string, string>) => void; onContinue?: () => void;
}) {
  const qs = reviewsFor(stage);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const done = !onSubmit; // modo corrección: las respuestas ya están en la sesión
  const box = "flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300";
  return (
    <form className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); if (onSubmit && qs.every((q) => picks[q.id])) onSubmit(picks); }}>
      <h2 className="text-base font-semibold">Repaso: {title}</h2>
      <p className="text-xs text-slate-600">Dos preguntas para fijar los conceptos de esta etapa. No cuentan en la nota.</p>
      {qs.map((q) => {
        const given = done ? (answers[reviewKey(q.id)] as string | undefined) : picks[q.id];
        const ok = given === q.correct;
        return (
          <fieldset key={q.id} className="space-y-2">
            <legend className="text-sm font-medium">{q.prompt}</legend>
            {displayOrder(q.options, `${caseId}:repaso:${q.id}`).map((o) => (
              <label key={o.id} className={`${box} ${done && o.id === q.correct ? "border-emerald-500 bg-emerald-50" : ""}`}>
                <input type="radio" name={`repaso-${q.id}`} value={o.id} checked={given === o.id} disabled={done}
                  onChange={() => setPicks((p) => ({ ...p, [q.id]: o.id }))} className="mt-1" />
                <span>{o.label}</span>
              </label>
            ))}
            {done && <p className={`rounded p-2 text-xs ${ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}><b>{ok ? "Correcto." : "No es correcto."}</b> {q.explain}</p>}
          </fieldset>
        );
      })}
      {done
        ? <button type="button" onClick={onContinue} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Continuar</button>
        : <button type="submit" disabled={!qs.every((q) => picks[q.id])} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-400">Comprobar</button>}
    </form>
  );
}
