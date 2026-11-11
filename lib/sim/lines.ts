import { round2 } from "../learning/money";
import { amortizationAt } from "./engine";
import type { SimState, WeekRecord } from "./model";
import { GROWTH, P, WEEKS_PER_MONTH } from "./params";

/**
 * Margen por línea de negocio (11/11/2026, petición del dueño: con −18.000 € acumulados no veía QUÉ parte de la empresa
 * perdía dinero). Reparte el resultado de una semana en tres partes que suman exactamente el resultado:
 * - Transporte: ingresos de transporte − gasóleo, subcontratación y reparaciones − conductor(es), seguro, renting y
 *   amortización del camión o los camiones.
 * - Almacén: ingresos del almacén − alquiler(es), mozo(s), horas extra, temporales y reorganización.
 * - Estructura: gerente, gestoría, sanciones, indemnizaciones e intereses (no dependen de una sola línea).
 * También mide el uso de la capacidad y lo que costó la que no se usó (la parte de los costes fijos de esa línea que
 * corresponde a lo que quedó libre): capacidad ociosa.
 */
export interface LineMargin { revenue: number; costs: number; margin: number; use: number; idleCost: number }
export interface WeekLines { transporte: LineMargin; almacen: LineMargin; estructura: { costs: number } }

const m = (x: number) => x / WEEKS_PER_MONTH;

/** Costes fijos semanales de cada línea según las herramientas contratadas esa semana. Suman fixedPerWeekAt. */
export function fixedSplitAt(s: Pick<SimState, "growth">, w: number) {
  const g = s.growth;
  const truck2 = !!g?.camion && w > g.camion.week;
  const nave = !!g?.almacen && w > g.almacen.week;
  const transporte = m(P.fixedMonthly.conductor + P.fixedMonthly.seguro) + (truck2 ? m(GROWTH.truck.driverMonthly + (g!.camion!.modo === "renting" ? GROWTH.truck.renting.monthly : GROWTH.truck.compra.insuranceMonthly)) : 0);
  const almacen = m(P.fixedMonthly.alquiler + P.fixedMonthly.mozo) + (nave ? m(GROWTH.warehouse.rentMonthly + GROWTH.warehouse.workerMonthly) : 0);
  const estructura = m(P.fixedMonthly.gerente + P.fixedMonthly.gestoria);
  return { transporte: round2(transporte), almacen: round2(almacen), estructura: round2(estructura) };
}

export function weekLines(s: Pick<SimState, "growth">, r: WeekRecord): WeekLines {
  const f = fixedSplitAt(s, r.week);
  const amort = amortizationAt(s, r.week);
  const tFixed = round2(f.transporte + amort);
  const tCosts = round2(r.costVariable + r.costSubcontract + r.costRepair + tFixed);
  const tUse = r.kmCapacity ? Math.min(1, r.kmOwn / r.kmCapacity) : 0;
  const aFixed = f.almacen;
  const aCosts = round2(aFixed + (r.costStaff ?? 0));
  const capacity = r.palletCapacity ?? P.warehousePallets;
  const aUse = capacity ? Math.min(1, (r.palletsStored - (r.palletsHeld ?? 0)) / capacity) : 0;
  const eCosts = round2(f.estructura + r.costPenalties + (r.costFinancial ?? 0));
  return {
    transporte: { revenue: r.revenueTransport, costs: tCosts, margin: round2(r.revenueTransport - tCosts), use: Math.round(tUse * 100), idleCost: round2(tFixed * (1 - tUse)) },
    almacen: { revenue: r.revenueWarehouse, costs: aCosts, margin: round2(r.revenueWarehouse - aCosts), use: Math.round(aUse * 100), idleCost: round2(aFixed * (1 - aUse)) },
    estructura: { costs: eCosts },
  };
}
