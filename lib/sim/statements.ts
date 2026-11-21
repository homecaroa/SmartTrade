import { round2, sum } from "../learning/money";
import { lastWeekOf, modeOf, WEEKS_PER_QUARTER, WEEKS_PER_YEAR, yearOf } from "./calendar";
import type { SimState, WeekRecord } from "./model";
import { P, WEEKS_PER_MONTH } from "./params";

/**
 * Estados financieros (Carrera, fase A, 21/11/2026): cuenta de resultados, balance y flujos de caja por trimestre o año.
 * No guardan nada: se calculan con lo que la partida ya registra (semanas, facturas, pagos y movimientos de caja), así
 * que no añaden peso a la partida.
 *
 * El balance de una semana pasada se RECONSTRUYE: facturas emitidas hasta esa semana y aún no cobradas en ella, pagos
 * pendientes, fianzas pagadas, valor del camión menos la amortización acumulada, y los fijos devengados desde el último
 * pago mensual. Tiene que cuadrar en todas las semanas (lo comprueban las pruebas): si no, algo del motor no se registra.
 *
 * Simplificaciones declaradas (no son la norma contable, son lo que el juego modela):
 * - No hay IVA ni impuesto de sociedades: el juego no los modela (pendiente de decisión del dueño).
 * - La póliza de crédito es la única deuda: lo dispuesto es la caja negativa. Su variación es el flujo de financiación;
 *   comisiones e intereses van en explotación, porque en el juego son un gasto más de la semana.
 * - Inversión: la compra del segundo camión y las fianzas. Todo lo demás es explotación.
 */

export type PeriodKind = "trimestre" | "año";

export interface Period { kind: PeriodKind; index: number; from: number; to: number; label: string; complete: boolean }

export interface IncomeStatement {
  revenueTransport: number; revenueWarehouse: number; revenue: number;
  costVariable: number; costSubcontract: number; costRepair: number; costStaff: number; costFixed: number; costPenalties: number; costServices: number;
  ebitda: number; amortization: number; costFinancial: number; result: number;
  ebitdaMarginPct: number | null;
}

export interface BalanceSheet {
  week: number;
  // Activo
  truck: number; deposits: number; receivables: number; cash: number; assets: number;
  // Patrimonio neto y pasivo
  capital: number; retained: number; equity: number; credit: number; payables: number; accrued: number; liabilities: number;
  /** Activo corriente − pasivo corriente. */
  workingCapital: number;
  /** Debe ser 0. */
  gap: number;
}

export interface CashFlow { opening: number; operating: number; investing: number; financing: number; closing: number }

const sumOf = (ws: WeekRecord[], f: (w: WeekRecord) => number) => round2(sum(ws.map(f)));

export const periodLength = (kind: PeriodKind) => (kind === "año" ? WEEKS_PER_YEAR : WEEKS_PER_QUARTER);

/** Periodos de la partida hasta la última semana cerrada (el último puede estar en curso). */
export function periods(s: SimState, kind: PeriodKind): Period[] {
  const closed = s.weeks.length ? s.weeks[s.weeks.length - 1].week : 0;
  const len = periodLength(kind);
  const total = Math.ceil(lastWeekOf(s) / len);
  const out: Period[] = [];
  for (let i = 0; i < total; i++) {
    const from = i * len + 1, to = Math.min((i + 1) * len, lastWeekOf(s));
    if (from > closed) break;
    const label = kind === "año"
      ? modeOf(s) === "carrera" ? `Año ${i + 1}` : `Semanas ${from}–${to}`
      : modeOf(s) === "carrera" ? `T${(i % 4) + 1} del año ${yearOf(from)}` : `Trimestre ${i + 1} (semanas ${from}–${to})`;
    out.push({ kind, index: i + 1, from, to, label, complete: closed >= to });
  }
  return out;
}

const weeksIn = (s: SimState, from: number, to: number) => s.weeks.filter((w) => w.week >= from && w.week <= to);

export function incomeStatement(s: SimState, from: number, to: number): IncomeStatement {
  const ws = weeksIn(s, from, to);
  const revenueTransport = sumOf(ws, (w) => w.revenueTransport), revenueWarehouse = sumOf(ws, (w) => w.revenueWarehouse);
  const revenue = round2(revenueTransport + revenueWarehouse);
  const costVariable = sumOf(ws, (w) => w.costVariable), costSubcontract = sumOf(ws, (w) => w.costSubcontract), costRepair = sumOf(ws, (w) => w.costRepair);
  const costStaff = sumOf(ws, (w) => w.costStaff ?? 0), costFixed = sumOf(ws, (w) => w.costFixed), costPenalties = sumOf(ws, (w) => w.costPenalties), costServices = sumOf(ws, (w) => w.costServices ?? 0);
  const ebitda = round2(revenue - costVariable - costSubcontract - costRepair - costStaff - costFixed - costPenalties - costServices);
  const amortization = sumOf(ws, (w) => w.amortization), costFinancial = sumOf(ws, (w) => w.costFinancial ?? 0);
  const result = round2(ebitda - amortization - costFinancial);
  return { revenueTransport, revenueWarehouse, revenue, costVariable, costSubcontract, costRepair, costStaff, costFixed, costPenalties, costServices, ebitda, amortization, costFinancial, result, ebitdaMarginPct: revenue ? round2(ebitda / revenue * 100) : null };
}

const isInvestment = (label: string) => label === "Compra del segundo camión" || label.startsWith("Fianza");

/**
 * Caja al cerrar una semana (0 = antes de empezar). Si la semana aún no se ha cerrado (un periodo en curso, o una partida
 * que acabó en quiebra a mitad de trimestre), la de la última semana cerrada: hasta el 21/11/2026, antes de publicarse,
 * devolvía la caja inicial y los flujos de caja de esos periodos no cuadraban (lo cazó la prueba de la identidad).
 */
function cashAt(s: SimState, week: number): number {
  let c: number = P.initialCash;
  for (const w of s.weeks) { if (w.week > week) break; c = w.cashEnd; }
  return c;
}

/** Balance al cerrar la semana `week` (0 = el balance de partida; una semana sin cerrar, el de la última cerrada). */
export function balanceAt(s: SimState, at: number): BalanceSheet {
  const week = Math.max(0, Math.min(at, s.weeks.length ? s.weeks[s.weeks.length - 1].week : 0));
  const ws = s.weeks.filter((w) => w.week <= week);
  const moves = s.ledger.filter((m) => m.week <= week);
  const purchases = round2(-sum(moves.filter((m) => m.label === "Compra del segundo camión").map((m) => m.amount)));
  const truck = round2(P.truckBookValue + purchases - sum(ws.map((w) => w.amortization)));
  const deposits = round2(-sum(moves.filter((m) => m.label.startsWith("Fianza")).map((m) => m.amount)));
  const receivables = round2(sum(s.receivables.filter((i) => i.week <= week && (i.paidWeek === undefined || i.paidWeek > week)).map((i) => i.amount)));
  const c = cashAt(s, week);
  const cash = Math.max(0, c), credit = round2(Math.max(0, -c));
  const payables = round2(sum(s.payables.filter((p) => p.week <= week && (p.paidWeek === undefined || p.paidWeek > week)).map((p) => p.amount)));
  // Fijos y personal devengados desde el último pago mensual (se pagan al cerrar cada 4 semanas).
  const lastPay = week - (week % WEEKS_PER_MONTH);
  const accrued = round2(sum(ws.filter((w) => w.week > lastPay).map((w) => w.costFixed + (w.costStaff ?? 0))));
  const capital = s.equity0, retained = round2(sum(ws.map((w) => w.result)));
  const assets = round2(truck + deposits + receivables + cash);
  const equity = round2(capital + retained), liabilities = round2(credit + payables + accrued);
  return {
    week, truck, deposits, receivables, cash, assets, capital, retained, equity, credit, payables, accrued, liabilities,
    workingCapital: round2(receivables + cash - credit - payables - accrued),
    gap: round2(assets - equity - liabilities) || 0,
  };
}

/** Flujos de caja de las semanas `from`–`to`: explotación + inversión + financiación = variación de la tesorería. */
export function cashFlow(s: SimState, from: number, to: number): CashFlow {
  const moves = s.ledger.filter((m) => m.week >= from && m.week <= to);
  const investing = round2(sum(moves.filter((m) => isInvestment(m.label)).map((m) => m.amount)));
  const operating = round2(sum(moves.filter((m) => !isInvestment(m.label)).map((m) => m.amount)));
  const open = balanceAt(s, from - 1), close = balanceAt(s, to);
  return { opening: open.cash, operating, investing, financing: round2(close.credit - open.credit), closing: close.cash };
}
