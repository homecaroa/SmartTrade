import { round2, sum } from "../learning/money";
import { creditLimitAt, fixedPerWeekAt } from "./engine";
import type { SimState } from "./model";
import { GROWTH, P, SEASON_WEEKS, WAREHOUSE_V6, WEEKS_PER_MONTH } from "./params";

/**
 * Previsión de tesorería (11/11/2026, petición del dueño tras quedarse a una semana de la quiebra sin aviso).
 * Solo usa lo que el jugador ya sabe: facturas emitidas según su VENCIMIENTO (un cliente que paga tarde no se adivina),
 * pagos pendientes, fijos y nóminas devengados, temporales contratados y pagos de herramientas ya decididas. No incluye
 * el gasóleo ni las facturas de las semanas que vienen: es una previsión prudente, no una predicción.
 */
export interface ForecastWeek { week: number; start: number; collections: number; payments: number; fixed: number; oneOff: number; end: number; limit: number }

export function cashForecast(s: SimState, weeks = 4): { rows: ForecastWeek[]; overdue: number; firstBreach: number | null } {
  const rows: ForecastWeek[] = [];
  let cash = s.cash, accrued = s.accruedFixed;
  const pendingInv = s.receivables.filter((i) => i.paidWeek === undefined);
  const g = s.growth;
  for (let w = s.week; w < s.week + weeks && w <= SEASON_WEEKS; w++) {
    const collections = round2(sum(pendingInv.filter((i) => i.dueWeek === w).map((i) => i.amount)));
    const payments = round2(sum(s.payables.filter((p) => p.paidWeek === undefined && p.dueWeek === w).map((p) => p.amount)));
    const temps = s.version >= WAREHOUSE_V6.fromVersion ? (s.staff?.temps ?? []).filter((d) => w > d && w <= d + WAREHOUSE_V6.temp.weeks).length * WAREHOUSE_V6.temp.weeklyCost : 0;
    const abc = s.staff?.abcWeek === w ? WAREHOUSE_V6.abc.cost : 0;
    accrued = round2(accrued + fixedPerWeekAt(s, w) + temps + abc);
    const fixed = w % WEEKS_PER_MONTH === 0 ? accrued : 0;
    if (fixed) accrued = 0;
    let oneOff = w === 1 ? P.deposit : 0;
    if (g?.camion?.week === w && g.camion.modo === "compra") oneOff += GROWTH.truck.compra.price;
    if (g?.almacen?.week === w) oneOff += GROWTH.warehouse.rentMonthly * GROWTH.warehouse.depositMonths;
    if (g?.poliza?.week === w) oneOff += round2(GROWTH.credit.limit * GROWTH.credit.openingFee);
    const end = round2(cash + collections - payments - fixed - oneOff);
    rows.push({ week: w, start: cash, collections, payments, fixed, oneOff: round2(oneOff), end, limit: creditLimitAt(s, w) });
    cash = end;
  }
  const overdue = round2(sum(pendingInv.filter((i) => i.dueWeek < s.week).map((i) => i.amount)));
  const breach = rows.find((r) => r.end < -r.limit);
  return { rows, overdue, firstBreach: breach ? breach.week : null };
}
