/**
 * Cifras de la campaña (23/11/2026). TODAS son SIMULADAS: hipótesis de diseño del orden de magnitud de una pequeña
 * empresa de transporte, calibradas con estrategias automáticas (lib/sim/campaign/strategies.ts), no precios de
 * mercado. La normativa que se cita está comprobada en el BOE; lo que no, se dice.
 */
export const CAMPAIGN_VERSION = 1;

/** Semana de juego = 1 semana; el mes son 4 semanas, como en el resto del simulador. */
export const WEEKS_PER_MONTH = 4;

export const START = {
  /**
   * Ahorros con los que empiezas. Medido el 23/11/2026: con 8.000 €, ninguna estrategia razonable pasaba el nivel 2
   * (la fianza y la obra se comían la caja, que aún esperaba los cobros a 30 días del nivel 1).
   */
  cash: 15_000,
  /** Lo que necesitas para vivir: tu sueldo como dueño (no es una cuota legal). */
  ownerMonthly: 1_200,
  insuranceMonthly: 90,
};

/** Furgoneta en renting con la que empiezas. */
export const VAN = { id: "furgoneta", name: "Furgoneta en renting", kmWeek: 1_500, monthly: 650, mode: "renting" as const };
/** Gasóleo, neumáticos y mantenimiento de la furgoneta, por km. */
export const VAN_VARIABLE = 0.22;
/** Lo que cobra un subcontratista por km (su coste completo y su margen). */
export const SUB_RATE = 1.05;

/** Quiebra: dos semanas seguidas con la caja por debajo de lo que te deja el banco. */
export const BANKRUPT_WEEKS = 2;

/** Encargos urgentes sueltos (nivel 1 en adelante): probabilidad de 0, 1 o 2 por semana, km y precio por km. */
export const SPOT = { count: [0.3, 0.45, 0.25], km: { min: 150, max: 350 }, rate: { min: 1.0, max: 1.3 }, failPenalty: 150 };

/** Reputación: cuánto baja por cada 100 km comprometidos sin servir y por un encargo urgente fallado. */
export const REPUTATION = { per100kmMissed: 2, spotFailed: 3 };

/**
 * Póliza de crédito (nivel 3): límite, comisión de apertura e interés anual sobre lo dispuesto. Cifras simuladas.
 * Descuento de facturas: el banco adelanta lo que te deben a cambio de un porcentaje.
 */
export const BANK = { creditLimit: 10_000, openingFee: 0.005, annualRate: 0.07, factoringFee: 0.015 };

/**
 * Morosidad (nivel 3), Ley 3/2004 leída en el BOE el 23/11/2026 (texto consolidado, actualización del 01/10/2014):
 * plazo de 30 días y nunca más de 60 por pacto (art. 4); mora automática (art. 5); interés de demora = tipo del BCE +
 * 8 puntos (art. 7); 40 € fijos por costes de cobro (art. 8). El tipo del BCE de cada semestre NO se ha comprobado:
 * `lateInterestAnnual` es simulado.
 */
export const LATE = { recoveryFee: 40, lateInterestAnnual: 0.12 };
