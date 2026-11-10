"use client";

import { useState } from "react";
import { evaluate } from "@/lib/sim/calc";
import { subcontractPerKm, TRUCK_FULL_COST_PER_KM, WAREHOUSE_FULL_COST_PER_PALLET, n2 } from "@/lib/sim/engine";
import { fixedShare } from "@/lib/sim/international";
import { ENGINE_VERSION, FIXED_PER_MONTH, GROWTH, INTERNATIONAL, P, TRUCK_KM_WEEK, WAREHOUSE_V6 } from "@/lib/sim/params";
import { fmtEur } from "@/lib/learning/money";

/** Calculadora básica y tus costes de referencia. La calculadora no conoce el juego: los cálculos los planteas tú. */
export function Calculator({ version = ENGINE_VERSION }: { version?: number }) {
  const [expr, setExpr] = useState("");
  const [history, setHistory] = useState<{ expr: string; value: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    const r = evaluate(expr);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    setHistory((h) => [{ expr, value: r.value }, ...h].slice(0, 6));
    setExpr(String(r.value).replace(".", ","));
  };
  const key = (k: string) => setExpr((e) => e + k);
  const btn = "rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-100";
  return (
    <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="calculadora">
      <h2 id="calculadora" className="text-base font-semibold">Calculadora</h2>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label className="block text-xs text-slate-600" htmlFor="calc-expr">Operación (por ejemplo: 680 × 2 o (1,50 − 0,60) × 400)</label>
        <div className="flex gap-2">
          <input id="calc-expr" value={expr} onChange={(e) => setExpr(e.target.value)} inputMode="decimal" autoComplete="off" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white hover:bg-indigo-700">=</button>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Teclas de la calculadora">
          {["+", "−", "×", "÷", "(", ")", ","].map((k) => <button key={k} type="button" className={btn} onClick={() => key(k)}>{k}</button>)}
          <button type="button" className={btn} onClick={() => { setExpr(""); setError(null); }}>Borrar</button>
        </div>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      </form>
      {history.length > 0 && (
        <ul className="space-y-0.5 font-mono text-xs" aria-label="Últimos cálculos">
          {history.map((h, i) => <li key={i}><button type="button" className="text-left hover:underline" onClick={() => setExpr(String(h.value).replace(".", ","))}>{h.expr} = <b>{h.value.toLocaleString("es-ES", { maximumFractionDigits: 6 })}</b></button></li>)}
        </ul>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold">Tus costes de referencia</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Coste variable del camión: <b>{n2(P.variablePerKm)} €/km</b> (gasóleo, mantenimiento y peajes).</li>
          <li>Coste completo del camión a plena capacidad: <b>{n2(TRUCK_FULL_COST_PER_KM)} €/km</b> (variable + conductor, seguro y amortización repartidos en {TRUCK_KM_WEEK} km/semana).</li>
          {version >= WAREHOUSE_V6.fromVersion && <li>Almacén: un mozo hace unos {WAREHOUSE_V6.movesPerWorker} movimientos o {WAREHOUSE_V6.linesPerWorker.toLocaleString("es-ES")} líneas por semana y cuesta {fmtEur(P.fixedMonthly.mozo / 4)} a la semana: {n2(P.fixedMonthly.mozo / 4 / WAREHOUSE_V6.movesPerWorker)} € por movimiento y {n2(P.fixedMonthly.mozo / 4 / WAREHOUSE_V6.linesPerWorker)} € por línea. El sitio cuesta {n2(P.fixedMonthly.alquiler / 4 / P.warehousePallets)} €/palé/semana de alquiler.</li>}
          <li>Coste del almacén lleno: <b>{n2(WAREHOUSE_FULL_COST_PER_PALLET)} €/palé/semana</b> (alquiler y mozo entre {P.warehousePallets} palés).</li>
          <li>Subcontratar a otro transportista: <b>{n2(GROWTH.subcontract.perKm)} €/km</b>{subcontractPerKm(version) !== GROWTH.subcontract.perKm ? <> ({n2(subcontractPerKm(version))} €/km si es para cubrir una avería)</> : null}.</li>
          <li>Fijos totales: <b>{fmtEur(FIXED_PER_MONTH)}</b> cada 4 semanas (alquiler, nóminas, seguro, gestoría), sin contar el segundo camión ni la nave ampliada.</li>
          <li>En un viaje puntual vuelves en vacío: los km recorridos son el doble de los de ida.</li>
          <li>Viaje internacional: unos {INTERNATIONAL.kmPerDayLong} km por día de camión, más {INTERNATIONAL.loadDays} día de carga y descarga; dietas del conductor de {fmtEur(INTERNATIONAL.dietPerDay)} por día y peajes extranjeros aparte. Cada día fuera son {fmtEur(fixedShare(1))} de conductor, seguro y amortización.</li>
        </ul>
        <p className="mt-1 text-slate-600">Cifras simuladas de tu empresa ficticia.</p>
      </details>
    </section>
  );
}
