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

/**
 * Personal (nivel 4). Normativa leída en el BOE el 23/11/2026, texto literal:
 * - Estatuto de los Trabajadores (RDLeg 2/2015, consolidado, actualización del 18/11/2026): periodo de prueba de
 *   hasta 2 meses (3 en empresas de menos de 25 personas) y 6 meses para técnicos titulados (art. 14.1); contrato por
 *   circunstancias de la producción de hasta 6 meses, ampliable a un año por convenio sectorial, y para situaciones
 *   ocasionales y previsibles hasta 90 días en el año (art. 15.2); jornada de 40 horas semanales de promedio anual
 *   (art. 34.1); como mucho 80 horas extra al año (art. 35.2); al acabar un contrato temporal, 12 días de salario por año
 *   (art. 49.1.c); despido objetivo, 20 días por año con un máximo de 12 mensualidades (art. 53.1.b); improcedente, 33
 *   días por año con un máximo de 24 (art. 56.1).
 * - Orden PJC/297/2026 (cotización 2026): la empresa paga contingencias comunes 23,60 %, desempleo 5,50 % (indefinido)
 *   o 6,70 % (duración determinada), FOGASA 0,20 %, formación profesional 0,60 % y MEI 0,75 % (art. 16). Accidentes de
 *   trabajo: según la tarifa de primas de cada actividad, NO un porcentaje fijo: el 1,5 % del juego es SIMULADO.
 * - Salario mínimo 2026: 1.221 € al mes (Real Decreto 126/2026, art. 1).
 * Sueldos y productividad: SIMULADOS.
 */
export const LABOR = {
  employerRate: { indefinido: 0.236 + 0.055 + 0.002 + 0.006 + 0.0075, temporal: 0.236 + 0.067 + 0.002 + 0.006 + 0.0075 },
  accidentRate: 0.015,
  smi: 1_221,
  trialWeeks: { general: 8, small: 12 },
  temporaryMaxWeeks: 26,
  occasionalMaxDays: 90,
  overtimeMaxYear: 80,
  overtimeFactor: 1.4,
  endOfTemporaryDays: 12,
  objectiveDismissalDays: 20,
  unfairDismissalDays: 33,
};
