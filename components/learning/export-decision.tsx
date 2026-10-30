"use client";

import { useState } from "react";
import { resolve, ctxOf } from "@/lib/learning/export/engine";
import { routeOf, shipmentOf } from "@/lib/learning/export/costs";
import { assessRoutes, JUSTIFICATIONS } from "@/lib/learning/logistics/assess";
import { MODALITY_LABEL } from "@/lib/learning/logistics/types";
import { displayOrder } from "@/lib/learning/order";
import type { Answers, Decision, ExportScenario } from "@/lib/learning/export/types";
import { LogisticsNotice, RoutesTable } from "./logistics-tables";

/**
 * Formulario de una decisión: opciones únicas (radio), selección de documentos (casillas), ruta de transporte (tabla de
 * alternativas + radio) o justificación de la ruta (casillas de motivos).
 */
export function ExportDecision({ sc, d, answers, onConfirm }: { sc: ExportScenario; d: Decision; answers: Answers; onConfirm: (value: string | string[]) => void }) {
  const ctx = ctxOf(sc, answers);
  const [one, setOne] = useState<string>("");
  const [many, setMany] = useState<string[]>([]);
  const name = `decision-${d.id}`;
  const single = d.kind === "single" || d.kind === "route";
  const box = "flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300";
  const toggle = (id: string, on: boolean) => setMany((m) => (on ? [...m, id] : m.filter((x) => x !== id)));
  const checkboxes = (items: { id: string; label: string }[]) => (
    <div className="space-y-2">
      {displayOrder(items, `${sc.id}:${d.id}`).map((o) => (
        <label key={o.id} className={box}>
          <input type="checkbox" name={name} value={o.id} checked={many.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} className="mt-1" />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
  const shipment = d.kind === "route" || d.kind === "justify" ? shipmentOf(sc) : null;
  return (
    <form
      className={`space-y-3 rounded-lg p-4 shadow-sm ${d.incident ? "border-2 border-rose-300 bg-rose-50" : "bg-white"}`}
      onSubmit={(e) => { e.preventDefault(); if (single && !one) return; onConfirm(single ? one : many); }}
    >
      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">{d.incident ? "⚠️ " : ""}{d.title}</legend>
        <p className="text-sm">{resolve(d.prompt, ctx)}</p>
        {d.concept && <p className="rounded bg-slate-50 p-2 text-xs text-slate-700"><b>Concepto:</b> {d.concept}</p>}
        {d.kind === "single" && (
          <div className="space-y-2">
            {displayOrder(d.options, `${sc.id}:${d.id}`).map((o) => (
              <label key={o.id} className={box}>
                <input type="radio" name={name} value={o.id} checked={one === o.id} onChange={() => setOne(o.id)} className="mt-1" />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )}
        {d.kind === "multi" && checkboxes(resolve(d.docs, ctx))}
        {d.kind === "route" && shipment && (
          <div className="space-y-3">
            <LogisticsNotice />
            <p className="text-xs text-slate-700">{shipment.geographyNote} Costes con todos los conceptos (los pague quien los pague), seguro incluido.</p>
            <RoutesTable c={shipment} rows={displayOrder(assessRoutes(shipment).all.map((a) => ({ ...a, id: a.route.id })), `${sc.id}:alternativas`)} />
            {shipment.infeasible.length > 0 && (
              <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs">
                <p className="font-semibold">Alternativas que no son viables</p>
                <ul className="list-disc pl-5">{shipment.infeasible.map((x) => <li key={x.modality}><b>{MODALITY_LABEL[x.modality]}:</b> {x.reason}</li>)}</ul>
              </div>
            )}
            <p className="text-sm font-semibold">¿Qué ruta eliges?</p>
            <div className="space-y-2">
              {displayOrder(shipment.routes, `${sc.id}:${d.id}`).map((r) => (
                <label key={r.id} className={box}>
                  <input type="radio" name={name} value={r.id} checked={one === r.id} onChange={() => setOne(r.id)} className="mt-1" />
                  <span>{r.label} <span className="text-xs text-slate-600">({MODALITY_LABEL[r.modality]})</span></span>
                </label>
              ))}
            </div>
          </div>
        )}
        {d.kind === "justify" && shipment && (
          <div className="space-y-2">
            <p className="text-sm">Ruta elegida: <b>{routeOf(sc, ctx.settings.transport).label}</b>.</p>
            <details className="rounded border border-slate-200 p-2 text-sm">
              <summary className="cursor-pointer font-medium">Repasar las alternativas</summary>
              <div className="mt-2"><RoutesTable c={shipment} rows={assessRoutes(shipment).all} /></div>
            </details>
            {checkboxes(JUSTIFICATIONS)}
          </div>
        )}
      </fieldset>
      <button type="submit" disabled={single && !one} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400">
        Confirmar decisión
      </button>
      <p className="text-xs text-slate-500">Una vez confirmada no se puede cambiar.</p>
    </form>
  );
}
