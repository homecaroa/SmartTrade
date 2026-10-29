import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import type { OperationResult } from "@/lib/learning/export/costs";
import { ProvenanceBadge } from "./provenance-badge";

/** Liquidación de la operación: cada coste una vez, con quién lo paga y de dónde sale el dato. */
export function CostTable({ r, unit, units, targetMarginPct }: { r: OperationResult; unit: string; units: number; targetMarginPct: number }) {
  const th = "px-2 py-1 text-left text-xs font-semibold uppercase text-slate-500";
  const td = "px-2 py-1 align-top";
  return (
    <div className="space-y-2 text-sm">
      <p>Incoterm: <b>{r.incoterm.code}</b> ({r.incoterm.name}). Precio por {unit}: <b>{fmtEur(r.unitPrice)}</b> × {units.toLocaleString("es-ES")} = <b>{fmtEur(r.revenue)}</b>.</p>
      <p className="text-xs text-slate-600">El precio sale del escandallo: precio en origen (EXW) más los costes logísticos estándar que asume el vendedor en {r.incoterm.code}, repartidos por {unit}.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Costes de la operación y quién los paga</caption>
          <thead><tr className="border-b"><th className={th} scope="col">Concepto</th><th className={th} scope="col">Paga</th><th className={`${th} text-right`} scope="col">Importe</th><th className={th} scope="col">Dato</th></tr></thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={`${l.concept}-${i}`} className="border-b border-slate-100">
                <td className={td}>{l.label}<p className="text-xs text-slate-500">{l.note}</p></td>
                <td className={td}>{l.payer}</td>
                <td className={`${td} text-right tabular-nums`}>{fmtEur(l.amount)}</td>
                <td className={td}><ProvenanceBadge prov={l.prov} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.vat && (
        <p className={`rounded border p-2 text-xs ${r.vat.recoverable ? "border-slate-200 bg-slate-50" : "border-rose-200 bg-rose-50"}`}>
          <b>IVA o impuesto de importación: {fmtEur(r.vat.amount)}</b> (paga el {r.vat.payer}). {r.vat.recoverable ? "No se suma a los costes: " : "Se suma a los costes: "}{r.vat.note}
        </p>
      )}
      <dl className="grid gap-2 sm:grid-cols-4">
        <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-600">Ingresos</dt><dd className="font-semibold tabular-nums">{fmtEur(r.revenue)}</dd></div>
        <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-600">Coste del producto</dt><dd className="font-semibold tabular-nums">{fmtEur(r.productCost)}</dd></div>
        <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-600">Otros costes del vendedor</dt><dd className="font-semibold tabular-nums">{fmtEur(r.sellerCosts)}</dd></div>
        <div className={`rounded p-2 ${r.margin < 0 ? "bg-rose-50" : "bg-emerald-50"}`}><dt className="text-xs text-slate-600">Margen</dt><dd className="font-semibold tabular-nums">{fmtEur(r.margin)} ({fmtPctLearning(r.marginPct)})</dd><dd className="text-xs text-slate-600">Objetivo: {fmtPctLearning(targetMarginPct, 0)}</dd></div>
      </dl>
      <p className="text-xs text-slate-600">Margen = ingresos − coste del producto − costes que paga el vendedor. Coste para el comprador hasta su almacén: {fmtEur(r.buyerLanded)} (precio + lo que paga él, sin impuestos recuperables).</p>
    </div>
  );
}
