import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import type { CompetitorAnalysis } from "@/lib/trade/competitors";

/** Redondea antes de poner el signo: un cambio que se muestra como 0,0 no lleva «+» ni color. */
const rounded = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const signed = (v: number | null, unit: string, d = 1) => {
  if (v === null) return "n.d.";
  const r = rounded(v, d);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d })} ${unit}`;
};
const tone = (v: number | null) => (v === null || rounded(v, 1) === 0 ? "" : v > 0 ? "text-emerald-700" : "text-rose-700");

/**
 * España frente a sus competidores en el mercado. El valor unitario es un indicio estadístico, no un precio, y en el
 * comercio dentro de la UE el país proveedor es el Estado miembro de expedición (Eurostat), no necesariamente el de
 * origen: un país puede reexpedir mercancía producida en otro.
 */
export function CompetitorsTable({ a, currency, euMarket }: { a: CompetitorAnalysis; currency: "EUR" | "USD" | null; euMarket: boolean }) {
  const cur = currency ?? "";
  const th = "px-2 py-1 text-left text-xs font-semibold text-slate-600";
  const td = "px-2 py-1 align-top tabular-nums whitespace-nowrap";
  return (
    <div className="space-y-2 text-sm">
      {a.spain ? (
        <p>España es el proveedor nº <b>{a.spain.rank}</b> de {a.suppliersCount} con una cuota del <b>{fmtPct(a.spain.sharePct)}</b> ({signed(a.spain.shareChangePp, "puntos")} entre {a.startYear} y {a.endYear}){a.spain.unitValue !== null && <> y un valor unitario de <b>{fmtNum(a.spain.unitValue, 2)} {cur}/kg</b></>}.</p>
      ) : <p>No hay importaciones desde España registradas en {a.endYear}.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Principales proveedores del mercado: importaciones, cuota, variación de cuota y valor unitario</caption>
          <thead><tr className="border-b">
            <th className={th} scope="col">Proveedor</th><th className={th} scope="col">Importaciones {a.endYear}</th><th className={th} scope="col">Cuota</th>
            <th className={th} scope="col">Variación de cuota {a.startYear}–{a.endYear}</th><th className={th} scope="col">Valor unitario</th><th className={th} scope="col">Frente a España</th>
          </tr></thead>
          <tbody>
            {a.rows.map((r) => (
              <tr key={r.code} className={`border-b border-slate-100 ${r.isSpain ? "bg-amber-50 font-semibold" : ""}`}>
                <td className="px-2 py-1 align-top">{r.rank}. {r.name}</td>
                <td className={td}>{fmtMoney(r.value, currency)}</td>
                <td className={td}>{fmtPct(r.sharePct)}</td>
                <td className={`${td} ${tone(r.shareChangePp)}`}>{signed(r.shareChangePp, "pp")}</td>
                <td className={td}>{r.unitValue === null ? "n.d." : `${fmtNum(r.unitValue, 2)} ${cur}/kg`}{r.weightEstimated && <span className="text-xs text-amber-700"> (peso estimado)</span>}</td>
                <td className={td}>{r.isSpain ? "—" : r.unitValueVsSpainPct === null ? "n.d." : signed(r.unitValueVsSpainPct, "%", 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-disc pl-5 text-xs text-slate-600">
        <li>Valor unitario = valor / peso neto. Es un <b>indicio</b>, no un precio de venta: dentro de un mismo código HS6 se mezclan calidades, formatos y envases. Una diferencia grande sugiere un posicionamiento distinto, no que se pueda vender a ese precio.</li>
        {euMarket && <li>Dentro de la UE, Eurostat asigna cada importación al Estado miembro <b>de expedición</b>, no necesariamente al de origen: un país puede reexpedir mercancía producida en otro (también española).</li>}
        <li>Variación de cuota en puntos porcentuales entre el primer y el último año de la ventana. «n.d.» = dato no disponible, nunca cero.</li>
      </ul>
    </div>
  );
}
