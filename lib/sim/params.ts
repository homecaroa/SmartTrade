/**
 * Parámetros del Business Simulator (docs/simulador.md §9.3). SIMULADOS: hipótesis de diseño para equilibrar el juego,
 * no tarifas de mercado. Las únicas cifras normativas son los plazos de pago, con su fuente.
 */
/**
 * Versión de las reglas. Una partida guardada se reproduce SIEMPRE con la versión con la que empezó:
 * - v1: reglas hasta el 09/11/2026 (viajes puntuales casi siempre por debajo del coste completo: «ruido», según el dueño).
 * - v2 (09/11/2026): viajes puntuales con precios realistas y, en algunos, carga de retorno (ver PUNTUAL_V2).
 * - v3 (10/11/2026): el subcontratista cobra GROWTH.subcontract.perKm también en las averías (antes 1,05 €/km, por
 *   debajo del coste completo de un camión propio: subcontratar salía más barato que tener camión).
 */
export const ENGINE_VERSION = 3;
export const SUPPORTED_VERSIONS = [1, 2, 3] as const;
/**
 * Viajes puntuales desde la v2. Precio por km de IDA entre 1,60 y 3,20 € (0,80-1,60 €/km recorrido contando el retorno):
 * cerca del 40 % cubre el coste completo del camión y ninguno queda por debajo del variable. En un 40 % de los viajes el
 * cliente ofrece una carga de retorno que paga 0,50-1,00 € por km de vuelta. Decisiones de diseño, medidas con las
 * estrategias automáticas (docs/simulador.md §17 quinquies).
 */
export const PUNTUAL_V2 = { minPerKmOneWay: 1.6, maxPerKmOneWay: 3.2, backhaulChance: 0.4, backhaulPerKm: { min: 0.5, max: 1.0 } };
/**
 * Temporada completa: 26 semanas (decisión del dueño, 09/11/2026). Hasta ese día la partida terminaba en la semana 6
 * (fase 1); se amplió sin cambiar ninguna regla de las semanas 1-6, así que las partidas guardadas continúan.
 */
export const SEASON_WEEKS = 26;
/** Estacionalidad (docs/simulador.md §11): más ofertas en campaña y menos en la semana valle. Decisión de diseño. */
export const SEASON_PEAK = { from: 10, to: 14 };
export const SEASON_LOW = { from: 20, to: 22 };
/** Una avería por tramo de 8 semanas: la primera entre las semanas 2 y 5 (igual que en la fase 1), luego 10-13 y 18-21. */
export const BREAKDOWN_WINDOWS = [{ from: 2, to: 5 }, { from: 10, to: 13 }, { from: 18, to: 21 }];
/** Objetivos de temporada (docs/simulador.md §12): se gana cumpliendo 2 de 3. */
export const OBJECTIVES = { minWarehouseOccupancyPct: 70, minServicePct: 95 };
/** Derrota por servicio: por debajo del 80 % cuatro semanas seguidas, los clientes clave se van. */
export const SERVICE_FLOOR = { pct: 80, weeks: 4 };
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

/**
 * Tras el arranque (desde la semana 7) el mercado ya conoce a la empresa: llega una oferta más por semana y, si su nivel
 * de servicio es del 95 % o más, los clientes pagan una prima por un proveedor fiable (+20 % en las tarifas).
 * Medido con estrategias automáticas (200 semillas, 09/11/2026): sin estos dos efectos, ni eligiendo siempre las mejores
 * ofertas la empresa salía rentable en ninguna temporada (1 de 200); con ellos, la estrategia selectiva es rentable en
 * las 8 últimas semanas en 90 de 200 y la prudente en 67 de 200. El +20 % es una decisión de diseño, no una medición
 * del mercado real.
 */
export const MARKET_GROWTH_FROM = 7;
export const EXTRA_OFFERS = 1;
export const RELIABILITY_PREMIUM = { minServicePct: 95, factor: 1.2 };

/**
 * Herramientas para crecer (10/11/2026, docs/simulador.md §17 sexies). Todas las cifras son SIMULADAS: hipótesis de
 * diseño del orden de magnitud de una pyme logística, no precios de mercado comprobados. Una partida que no las usa se
 * juega exactamente igual que antes (no cambian ni la versión de las reglas ni las partidas guardadas).
 * - Subcontratar al aceptar: el subcontratista cobra `perKm` (cubre su coste completo, del orden del de tu camión, 1,30
 *   €/km, y su margen; con 1,05 €/km subcontratar salía más barato que tener camión y era la única forma de crecer), se
 *   le paga a 30 días y falla alguna semana
 *   (`failChance`): tú respondes ante el cliente de su trabajo (Ley 15/2009, art. 6: el transportista contractual
 *   responde de la ejecución aunque la encargue a otro). Tus colaboradores tienen como mucho un camión libre para ti
 *   (`maxKmWeek`): sin ese límite, subcontratar sin fin con la prima de fiabilidad ganaba 299 de 300 temporadas.
 * - Segundo camión, desde la semana siguiente: dobla los km semanales. En renting, una cuota mensual que incluye seguro y
 *   mantenimiento; comprado, sale de la caja de golpe, se amortiza y paga su seguro. Los dos necesitan otro conductor.
 * - Ampliar el almacén (nave contigua), desde la semana siguiente: más palés, más alquiler, un mozo más y dos meses de
 *   fianza (art. 36.1 LAU: en arrendamiento para uso distinto de vivienda, la fianza legal es de dos mensualidades).
 * - Póliza de crédito: permite que la caja baje de cero hasta el límite pagando intereses solo por lo dispuesto, más
 *   una comisión de apertura. Sin póliza, dos semanas con caja negativa son quiebra; con ella, dos semanas por debajo del
 *   límite.
 */
export const GROWTH = {
  subcontract: { perKm: 1.4, failChance: 0.03, payWeeks: 4, maxKmWeek: 1_050 },
  truck: {
    renting: { monthly: 1_500 },
    compra: { price: 48_000, amortizationWeek: 200, insuranceMonthly: 300 },
    driverMonthly: 2_600,
  },
  warehouse: { pallets: 400, rentMonthly: 1_200, workerMonthly: 2_150, depositMonths: 2 },
  credit: { limit: 20_000, openingFee: 0.005, annualRate: 0.07 },
} as const;
