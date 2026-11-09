/**
 * Parámetros del Business Simulator (docs/simulador.md §9.3). SIMULADOS: hipótesis de diseño para equilibrar el juego,
 * no tarifas de mercado. Las únicas cifras normativas son los plazos de pago, con su fuente.
 */
export const ENGINE_VERSION = 1;
export const PHASE1_WEEKS = 6;
/** Mes de juego = 4 semanas (simplificación declarada: alquiler, nóminas e informe cada 4 semanas). */
export const WEEKS_PER_MONTH = 4;

export const P = {
  initialCash: 40_000,
  deposit: 4_000,
  truckBookValue: 48_000,
  amortizationWeek: 200,
  /** Fijos que se pagan cada 4 semanas: alquiler 2.000, conductor 2.600, mozo 2.150, gerente 1.800, seguro 300, gestoría y suministros 900. */
  fixedMonthly: { alquiler: 2_000, conductor: 2_600, mozo: 2_150, gerente: 1_800, seguro: 300, gestoria: 900 },
  /** Gasóleo 0,30 + mantenimiento y neumáticos 0,08 + peajes 0,04 €/km. */
  variablePerKm: 0.42,
  /** Unas 4 h 30 min de conducción al día en reparto regional con paradas (≈ 210 km) × 5 días. */
  kmPerDay: 210,
  workDays: 5,
  warehousePallets: 600,
  subcontractPerKm: 1.05,
  repair: { min: 400, max: 900 },
  breakdownDays: { min: 1, max: 3 },
  /**
   * Plazos de cobro (normativa comprobada en el BOE el 09/11/2026):
   * - Transporte: quien paga incurre en mora a los 30 días (Ley 15/2009, art. 41.1) → 4 semanas en el juego.
   * - Otros servicios: 30 días sin pacto y nunca más de 60 por pacto (Ley 3/2004, art. 4.1 y 4.3).
   */
  transportPayWeeks: 4,
} as const;

export const FIXED_PER_MONTH = Object.values(P.fixedMonthly).reduce((a, b) => a + b, 0);
export const FIXED_PER_WEEK = FIXED_PER_MONTH / WEEKS_PER_MONTH;
export const TRUCK_KM_WEEK = P.kmPerDay * P.workDays;

/**
 * Plazo de pago tal como se pacta: un mes de juego son 4 semanas, así que 4 semanas se muestran como «30 días» y 8 como
 * «60 días», que es como se pacta en la realidad (y como lo cuentan la Ley 15/2009 y la Ley 3/2004).
 */
export const payTermLabel = (weeks: number) => (weeks % WEEKS_PER_MONTH === 0 ? `${(weeks / WEEKS_PER_MONTH) * 30} días` : `${weeks * 7} días`);
