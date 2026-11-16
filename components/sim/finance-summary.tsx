"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pendingPayables, pendingReceivables } from "@/lib/sim/engine";
import { cashForecast } from "@/lib/sim/forecast";
import { weekLines } from "@/lib/sim/lines";
import type { SimState } from "@/lib/sim/model";
import { fmtEur, sum } from "@/lib/learning/money";

/**
 * Lo esencial de Finanzas en una mirada (16/11/2026): cuatro cifras con una frase cada una y un gráfico de caja frente a
 * beneficio acumulado. Colores del gráfico: azul y naranja, validados para daltonismo y contraste con el validador de
 * la guía de visualización (los dos casos en una sola escala de euros: no hay doble eje). La caja prevista es la misma
 * línea azul, discontinua.
 */
const BLUE = "#2a78d6", ORANGE = "#eb6834";
const tone = (v: number) => (v < 0 ? "text-rose-700" : "text-slate-900");

export function FinanceSummary({ s }: { s: SimState }) {
  const live = s.status !== "fin" && s.status !== "quiebra";
  const f = live ? cashForecast(s) : null;
  const ahead = f?.rows.at(-1);
  const last4 = s.weeks.slice(-4);
  const profit4 = sum(last4.map((w) => w.result));
  const rec = pendingReceivables(s);
  const overdue = sum(rec.filter((i) => i.dueWeek < s.week).map((i) => i.amount));
  const toPay = sum(pendingPayables(s).map((p) => p.amount)) + s.accruedFixed;
  const lines = last4.map((w) => weekLines(s, w));
  const t = sum(lines.map((l) => l.transporte.margin)), a = sum(lines.map((l) => l.almacen.margin));

  let acc = 0;
  const data: { label: string; caja?: number; beneficio?: number; prevista?: number }[] = s.weeks.map((w) => { acc += w.result; return { label: `S${w.week}`, caja: w.cashEnd, beneficio: Math.round(acc * 100) / 100 }; });
  if (f && data.length) { data[data.length - 1].prevista = data[data.length - 1].caja; for (const r of f.rows) data.push({ label: `S${r.week}`, prevista: r.end }); }

  const card = "rounded-lg border border-slate-200 bg-white p-3";
  return (
    <section className="space-y-3" aria-labelledby="como-vas">
      <h2 id="como-vas" className="text-base font-semibold">Cómo vas</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-600">Caja hoy</p>
          <p className={`text-2xl font-bold ${tone(s.cash)}`}>{fmtEur(s.cash)}</p>
          {ahead && <p className="text-xs text-slate-600">Prevista al cerrar la semana {ahead.week}: <b className={tone(ahead.end)}>{fmtEur(ahead.end)}</b> (con lo ya facturado; sin gasóleo).</p>}
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-600">Beneficio acumulado</p>
          <p className={`text-2xl font-bold ${tone(s.result)}`}>{fmtEur(s.result)}</p>
          {last4.length > 0 && <p className="text-xs text-slate-600">Últimas {last4.length} semanas: <b className={tone(profit4)}>{fmtEur(profit4)}</b>. {profit4 >= 0 ? "Vas ganando dinero." : "Aún pierdes dinero cada semana."}</p>}
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-600">Pendiente</p>
          <p className="text-sm">Te deben <b>{fmtEur(sum(rec.map((i) => i.amount)))}</b>{overdue > 0 && <> (<b className="text-rose-700">{fmtEur(overdue)} vencido</b>)</>}</p>
          <p className="text-sm">Debes <b>{fmtEur(toPay)}</b></p>
          <p className="text-xs text-slate-600">Lo facturado aún no es caja: entra cuando el cliente paga.</p>
        </div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase text-slate-600">Qué gana dinero</p>
          {lines.length ? <>
            <p className="text-sm">Transporte <b className={tone(t)}>{fmtEur(t)}</b></p>
            <p className="text-sm">Almacén <b className={tone(a)}>{fmtEur(a)}</b></p>
            <p className="text-xs text-slate-600">Margen de las últimas {lines.length} semanas, antes de gerente y gestoría.</p>
          </> : <p className="text-sm text-slate-600">Cuando cierres la primera semana.</p>}
        </div>
      </div>
      {s.weeks.length > 0 && (
        <div className={card}>
          <p className="text-sm font-semibold">Caja y beneficio acumulado, semana a semana</p>
          <p className="text-xs text-slate-600">No van juntos: la caja depende de cuándo cobras y pagas (facturas a 30 días, alquiler y nóminas cada 4 semanas, fianzas, compras); el beneficio, de lo que ganas aunque aún no lo hayas cobrado.</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="Leyenda">
            <li className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: BLUE }} />Caja al cerrar</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-0 w-5 border-t-2 border-dashed" style={{ borderColor: BLUE }} />Caja prevista</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5" style={{ background: ORANGE }} />Beneficio acumulado</li>
          </ul>
          <div className="mt-1 h-56 w-full" role="img" aria-label="Gráfico de la caja al cerrar cada semana, la caja prevista y el beneficio acumulado. Las cifras están en las tablas de esta página.">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: 8, right: 16, top: 4 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis width={72} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000).toLocaleString("es-ES")} mil €`} />
                <Tooltip formatter={(v) => (typeof v === "number" ? fmtEur(v) : String(v))} />
                <ReferenceLine y={0} stroke="#475569" />
                <Line type="monotone" dataKey="caja" name="Caja al cerrar" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="prevista" name="Caja prevista" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="beneficio" name="Beneficio acumulado" stroke={ORANGE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
