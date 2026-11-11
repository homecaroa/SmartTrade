import { balanceGap, cashByConcept, cashStart, pendingPayables, pendingReceivables } from "@/lib/sim/engine";
import { cashForecast } from "@/lib/sim/forecast";
import { clientOf } from "@/lib/sim/market";
import type { SimState } from "@/lib/sim/model";
import { fmtEur, sum } from "@/lib/learning/money";

/** Finanzas: cuenta de resultados por semana (devengo), tesorería (caja) y balance. Se muestran juntas para comparar. */
export function FinanceView({ s }: { s: SimState }) {
  const th = "py-1 pr-3 text-right font-semibold";
  const td = "py-1 pr-3 text-right tabular-nums";
  const rec = pendingReceivables(s);
  const pay = pendingPayables(s);
  const gap = balanceGap(s);
  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="pyg">
        <h2 id="pyg" className="text-base font-semibold">Beneficio: cuenta de resultados por semana</h2>
        {s.weeks.length === 0 ? <p className="text-sm text-slate-600">Aún no has cerrado ninguna semana.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-2 min-w-[40rem] text-sm">
              <caption className="text-left text-xs text-slate-600">Devengo: lo que se gana y se gasta cada semana, se cobre o se pague cuando sea.</caption>
              <thead><tr className="border-b"><th scope="col" className="py-1 pr-3 text-left">Concepto</th>{s.weeks.map((w) => <th key={w.week} scope="col" className={th}>Sem. {w.week}</th>)}</tr></thead>
              <tbody>
                {([["Ingresos de transporte", "revenueTransport", 1], ["Ingresos de almacén", "revenueWarehouse", 1], ["Gasóleo, mantenimiento y peajes", "costVariable", -1], ["Subcontratación", "costSubcontract", -1], ["Reparaciones", "costRepair", -1], ["Sanciones, indemnizaciones y costas", "costPenalties", -1], ["Intereses y comisiones de la póliza", "costFinancial", -1], ["Horas extra, temporales y reorganización", "costStaff", -1], ["Costes fijos (alquiler, nóminas…)", "costFixed", -1], ["Amortización del camión", "amortization", -1]] as const).filter(([, k]) => (k !== "costFinancial" && k !== "costStaff") || s.weeks.some((w) => w[k])).map(([label, k, sign]) => (
                  <tr key={k} className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">{label}</th>{s.weeks.map((w) => <td key={w.week} className={td}>{fmtEur(sign * (w[k] ?? 0))}</td>)}</tr>
                ))}
                <tr className="font-semibold"><th scope="row" className="py-1 pr-3 text-left">Resultado</th>{s.weeks.map((w) => <td key={w.week} className={`${td} ${w.result < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtEur(w.result)}</td>)}</tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {s.weeks.length > 0 && (() => {
        const concepts = [...new Set(s.weeks.flatMap((w) => Object.keys(cashByConcept(s, w.week))))].sort((a, b) => (a === "Cobros de clientes" ? -1 : b === "Cobros de clientes" ? 1 : a.localeCompare(b)));
        return (
          <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="tesoreria">
            <h2 id="tesoreria" className="text-base font-semibold">Tesorería: caja por semana</h2>
            <div className="overflow-x-auto">
              <table className="mt-2 min-w-[40rem] text-sm">
                <caption className="text-left text-xs text-slate-600">Caja: solo el dinero que entra o sale de verdad. No coincide con el beneficio: se cobra y se paga en otras fechas, la fianza sale de caja sin ser gasto y la amortización es gasto sin salir de caja.</caption>
                <thead><tr className="border-b"><th scope="col" className="py-1 pr-3 text-left">Concepto</th>{s.weeks.map((w) => <th key={w.week} scope="col" className={th}>Sem. {w.week}</th>)}</tr></thead>
                <tbody>
                  <tr className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">Caja al empezar</th>{s.weeks.map((w) => <td key={w.week} className={td}>{fmtEur(cashStart(s, w.week))}</td>)}</tr>
                  {concepts.map((k) => <tr key={k} className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">{k}</th>{s.weeks.map((w) => <td key={w.week} className={td}>{fmtEur(cashByConcept(s, w.week)[k] ?? 0)}</td>)}</tr>)}
                  <tr className="font-semibold"><th scope="row" className="py-1 pr-3 text-left">Caja al cerrar</th>{s.weeks.map((w) => <td key={w.week} className={`${td} ${w.cashEnd < 0 ? "text-rose-700" : ""}`}>{fmtEur(w.cashEnd)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {s.status !== "fin" && s.status !== "quiebra" && (() => {
        const f = cashForecast(s);
        return (
          <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="prevision">
            <h2 id="prevision" className="text-base font-semibold">Previsión de tesorería (próximas {f.rows.length} semanas)</h2>
            <div className="overflow-x-auto">
              <table className="mt-2 min-w-[32rem] text-sm">
                <caption className="text-left text-xs text-slate-600">Solo con lo que ya sabes: facturas por su vencimiento, pagos pendientes, alquiler y nóminas, temporales y pagos ya decididos. No incluye el gasóleo ni las facturas de las semanas que vienen, y un cliente puede pagar tarde.</caption>
                <thead><tr className="border-b"><th scope="col" className="py-1 pr-3 text-left">Concepto</th>{f.rows.map((r) => <th key={r.week} scope="col" className={th}>Sem. {r.week}</th>)}</tr></thead>
                <tbody>
                  <tr className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">Caja al empezar</th>{f.rows.map((r) => <td key={r.week} className={td}>{fmtEur(r.start)}</td>)}</tr>
                  <tr className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">Facturas que vencen</th>{f.rows.map((r) => <td key={r.week} className={td}>{fmtEur(r.collections)}</td>)}</tr>
                  <tr className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">Pagos a proveedores</th>{f.rows.map((r) => <td key={r.week} className={td}>{fmtEur(-r.payments)}</td>)}</tr>
                  <tr className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">Alquiler, nóminas y fijos del mes</th>{f.rows.map((r) => <td key={r.week} className={td}>{fmtEur(-r.fixed)}</td>)}</tr>
                  {f.rows.some((r) => r.oneOff) && <tr className="border-b border-slate-100"><th scope="row" className="py-1 pr-3 text-left font-normal">Fianzas, compras y comisiones</th>{f.rows.map((r) => <td key={r.week} className={td}>{fmtEur(-r.oneOff)}</td>)}</tr>}
                  <tr className="font-semibold"><th scope="row" className="py-1 pr-3 text-left">Caja prevista al cerrar</th>{f.rows.map((r) => <td key={r.week} className={`${td} ${r.end < -r.limit ? "text-rose-700" : ""}`}>{fmtEur(r.end)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            {f.overdue > 0 && <p className="mt-1 text-xs text-amber-900">Además tienes {fmtEur(f.overdue)} en facturas vencidas sin cobrar: no se cuentan porque no sabes cuándo pagarán.</p>}
          </section>
        );
      })()}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="cobros">
          <h2 id="cobros" className="text-base font-semibold">Facturas pendientes de cobro ({fmtEur(sum(rec.map((i) => i.amount)))})</h2>
          {rec.length === 0 ? <p className="text-sm text-slate-600">Ninguna.</p> : (
            <ul className="mt-1 space-y-1 text-sm">{rec.map((i) => <li key={i.id}>{clientOf(i.clientId).name}: {fmtEur(i.amount)} · emitida sem. {i.week} · vence sem. {i.dueWeek}{i.dueWeek < s.week ? <span className="font-semibold text-rose-700"> · en mora</span> : null}</li>)}</ul>
          )}
          <p className="mt-2 text-xs text-slate-600">El transporte se cobra a 30 días (4 semanas): quien paga entra en mora a los 30 días (Ley 15/2009, art. 41). El resto de servicios nunca puede pactarse a más de 60 días (Ley 3/2004, art. 4).</p>
        </section>
        <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="pagos">
          <h2 id="pagos" className="text-base font-semibold">Pagos pendientes</h2>
          <ul className="mt-1 space-y-1 text-sm">
            <li>Alquiler, nóminas, seguro y gestoría devengados: {fmtEur(s.accruedFixed)} (se pagan cada 4 semanas)</li>
            {pay.map((p) => <li key={p.id}>{p.label}: {fmtEur(p.amount)} · vence sem. {p.dueWeek}</li>)}
          </ul>
        </section>
      </div>

      <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="balance">
        <h2 id="balance" className="text-base font-semibold">Balance</h2>
        <dl className="mt-1 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold">Activo</dt><dd>Caja {fmtEur(s.cash)} · Clientes {fmtEur(sum(rec.map((i) => i.amount)))} · Fianzas {fmtEur(s.deposit)} · {s.growth?.camion?.modo === "compra" ? "Camiones" : "Camión"} {fmtEur(s.truckValue)}</dd></div>
          <div><dt className="font-semibold">Patrimonio neto y pasivo</dt><dd>Capital inicial {fmtEur(s.equity0)} · Resultado {fmtEur(s.result)} · Proveedores {fmtEur(sum(pay.map((p) => p.amount)))} · Fijos devengados sin pagar {fmtEur(s.accruedFixed)}</dd></div>
        </dl>
        <p className={`mt-2 text-xs ${gap === 0 ? "text-emerald-800" : "text-rose-700"}`}>{gap === 0 ? "El balance cuadra: activo = patrimonio neto + pasivo." : `Descuadre de ${fmtEur(gap)}: es un error del simulador.`}</p>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="caja">
        <h2 id="caja" className="text-base font-semibold">Movimientos de caja</h2>
        {s.ledger.length === 0 ? <p className="text-sm text-slate-600">Aún no hay movimientos.</p> : (
          <ul className="mt-1 max-h-72 space-y-0.5 overflow-y-auto text-sm">{[...s.ledger].reverse().map((m, i) => <li key={i} className="flex justify-between gap-2"><span>Sem. {m.week} · {m.label}</span><span className={`tabular-nums ${m.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtEur(m.amount)}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}
