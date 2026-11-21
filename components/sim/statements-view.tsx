"use client";

import { useState } from "react";
import type { SimState } from "@/lib/sim/model";
import { balanceAt, cashFlow, incomeStatement, periods, type Period, type PeriodKind } from "@/lib/sim/statements";
import { fmtEur } from "@/lib/learning/money";

/**
 * Estados financieros de la Carrera (fase A, 21/11/2026; lib/sim/statements.ts): cuenta de resultados, balance y flujos
 * de caja de un trimestre o un año, al lado del periodo anterior para comparar. Pocas líneas a propósito: el dueño pidió
 * finanzas sencillas (16/11/2026); el detalle semanal sigue más abajo, plegado.
 */
export function StatementsView({ s }: { s: SimState }) {
  const [kind, setKind] = useState<PeriodKind>("trimestre");
  const ps = periods(s, kind);
  const [pick, setPick] = useState<number | null>(null);
  if (!ps.length) return null;
  const cur = ps.find((p) => p.index === pick) ?? ps[ps.length - 1];
  const prev = ps.find((p) => p.index === cur.index - 1) ?? null;
  const cols: Period[] = prev ? [prev, cur] : [cur];
  const pl = cols.map((p) => incomeStatement(s, p.from, p.to));
  const bs = cols.map((p) => balanceAt(s, p.to));
  const cf = cols.map((p) => cashFlow(s, p.from, p.to));
  const td = "py-1 pl-3 text-right tabular-nums";
  const row = (label: string, xs: number[], opts: { strong?: boolean; sign?: boolean } = {}) => (
    <tr className={`border-b border-slate-100 ${opts.strong ? "font-semibold" : ""}`}>
      <th scope="row" className="py-1 pr-3 text-left font-normal">{opts.strong ? <b>{label}</b> : label}</th>
      {xs.map((v, i) => <td key={i} className={`${td} ${opts.sign && v < 0 ? "text-rose-700" : ""}`}>{fmtEur(v)}</td>)}
    </tr>
  );
  const head = (title: string, labels: string[]) => (
    <thead><tr className="border-b text-left"><th scope="col" className="py-1 pr-3">{title}</th>{labels.map((l) => <th key={l} scope="col" className="py-1 pl-3 text-right">{l}</th>)}</tr></thead>
  );
  const names = cols.map((p) => `${p.label}${p.complete ? "" : " (en curso)"}`);
  const neg = (v: number) => -v;
  return (
    <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="estados">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="estados" className="text-base font-semibold">Estados financieros</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div role="group" aria-label="Periodo" className="flex gap-1">
            {(["trimestre", "año"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setPick(null); }} className={`rounded border px-2 py-0.5 ${kind === k ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-800" : "border-slate-300"}`}>{k === "trimestre" ? "Trimestre" : "Año"}</button>)}
          </div>
          <label className="flex items-center gap-1">Ver
            <select value={cur.index} onChange={(e) => setPick(Number(e.target.value))} className="rounded border border-slate-300 px-1 py-0.5">
              {ps.map((p) => <option key={p.index} value={p.index}>{p.label}{p.complete ? "" : " (en curso)"}</option>)}
            </select>
          </label>
        </div>
      </div>
      <p className="text-xs text-slate-600">Un año de juego son 52 semanas (13 meses de 4 semanas) y un trimestre, 13 semanas. Sin IVA ni impuesto de sociedades: el juego aún no los modela.</p>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left text-sm font-semibold">Cuenta de resultados</caption>
            {head("Concepto", names)}
            <tbody>
              {row("Ingresos de transporte", pl.map((x) => x.revenueTransport))}
              {row("Ingresos de almacén", pl.map((x) => x.revenueWarehouse))}
              {row("Gasóleo, peajes y dietas", pl.map((x) => neg(x.costVariable)), { sign: true })}
              {row("Subcontratistas y reparaciones", pl.map((x) => neg(x.costSubcontract + x.costRepair)), { sign: true })}
              {row("Personal, alquiler y estructura", pl.map((x) => neg(x.costFixed + x.costStaff)), { sign: true })}
              {row("Sanciones y reclamaciones (neto)", pl.map((x) => neg(x.costPenalties)), { sign: true })}
              {pl.some((x) => x.costServices) && row("Informes comerciales", pl.map((x) => neg(x.costServices)), { sign: true })}
              {row("EBITDA", pl.map((x) => x.ebitda), { strong: true, sign: true })}
              {row("Amortización", pl.map((x) => neg(x.amortization)), { sign: true })}
              {row("Gastos financieros", pl.map((x) => neg(x.costFinancial)), { sign: true })}
              {row("Resultado", pl.map((x) => x.result), { strong: true, sign: true })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-600">Margen EBITDA: {pl.map((x, i) => `${names[i]} ${x.ebitdaMarginPct === null ? "—" : `${x.ebitdaMarginPct.toLocaleString("es-ES")} %`}`).join(" · ")}. El EBITDA es lo que gana el negocio antes de amortizaciones e intereses.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left text-sm font-semibold">Balance al cierre</caption>
            {head("Concepto", names)}
            <tbody>
              {row("Camiones (valor neto)", bs.map((x) => x.truck))}
              {row("Fianzas", bs.map((x) => x.deposits))}
              {row("Clientes pendientes de cobro", bs.map((x) => x.receivables))}
              {row("Tesorería", bs.map((x) => x.cash))}
              {row("Total activo", bs.map((x) => x.assets), { strong: true })}
              {row("Capital inicial", bs.map((x) => x.capital))}
              {row("Resultados acumulados", bs.map((x) => x.retained), { sign: true })}
              {row("Póliza de crédito dispuesta", bs.map((x) => x.credit))}
              {row("Proveedores pendientes", bs.map((x) => x.payables))}
              {row("Nóminas y fijos devengados", bs.map((x) => x.accrued))}
              {row("Patrimonio neto y pasivo", bs.map((x) => round(x.equity + x.liabilities)), { strong: true })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-600">Fondo de maniobra (lo que tienes a corto plazo menos lo que debes a corto plazo): {bs.map((x, i) => `${names[i]} ${fmtEur(x.workingCapital)}`).join(" · ")}.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left text-sm font-semibold">Flujos de caja</caption>
            {head("Concepto", names)}
            <tbody>
              {row("Tesorería al empezar", cf.map((x) => x.opening))}
              {row("De explotación (cobros y pagos del negocio)", cf.map((x) => x.operating), { sign: true })}
              {row("De inversión (camión, fianzas)", cf.map((x) => x.investing), { sign: true })}
              {row("De financiación (póliza)", cf.map((x) => x.financing), { sign: true })}
              {row("Tesorería al terminar", cf.map((x) => x.closing), { strong: true })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-600">Beneficio no es caja: compara el resultado con el flujo de explotación del mismo periodo.</p>
        </div>
      </div>
    </section>
  );
}

const round = (v: number) => Math.round(v * 100) / 100;
