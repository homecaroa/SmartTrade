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
 * - v4 (10/11/2026): reclamaciones con base legal: avería de la mercancía, retraso y un cliente que pide pagar a 90 días
 *   (ver CLAIMS y lib/sim/claims.ts).
 * - v5 (10/11/2026): viajes internacionales por carretera (ver INTERNATIONAL y lib/sim/international.ts).
 * - v6 (10/11/2026): almacén a fondo: movimientos y preparación de pedidos cobrados aparte, capacidad del mozo, personal
 *   temporal, reorganización ABC, punto de pedido y devoluciones (ver WAREHOUSE_V6 y lib/sim/warehouse.ts).
 * - v7 (11/11/2026): la prima y las rebajas por reputación se aplican también a la carga de retorno y a la manipulación
 *   del almacén (antes solo al precio principal; ver scaleRates en market.ts).
 * - v8 (11/11/2026): las devoluciones guardadas sin cobrar ocupan sitio, pero no cuentan para el objetivo de ocupación
 *   ni, si no caben, generan el aviso de que el cliente cancela (ver HELD_RETURNS_FROM en lib/sim/warehouse.ts).
 * - v9 (17/11/2026): incidencias durante los repartos (ver DELIVERY y lib/sim/delivery.ts).
 * - v10 (21/11/2026): la paralización por espera se cuenta desde la PRIMERA hora (Ley 15/2009, art. 22, redacción vigente
 *   desde el 02/03/2022). La v9 usaba la redacción original de 2009 (dos horas): ver DELIVERY.
 * - v11 (21/11/2026): Carrera, fase B1 (operaciones profundas: CAREER_DEEP y lib/sim/deep.ts). Solo cambia la Carrera;
 *   una Temporada v11 se juega exactamente como una v10.
 * - v12 (22/11/2026): Carrera, fase B2: gasóleo variable y revisión del precio (Ley 15/2009, art. 38; FUEL y
 *   lib/sim/fuel.ts). Solo la Carrera; la Temporada v12 se juega como la v10.
 */
export const ENGINE_VERSION = 12;
export const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
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

/**
 * Reclamaciones (reglas v4, 10/11/2026; docs/simulador.md §17 septies). Cada una aparece como mucho una vez por
 * temporada, en una semana de su ventana elegida por la semilla (o la primera siguiente en que haya un contrato al que
 * pueda afectar). Normativa comprobada en el BOE el 10/11/2026 (Ley 15/2009, arts. 47, 48, 56, 57 y 60; Ley 3/2004,
 * art. 4.3). Lo demás es SIMULADO:
 * - `ipremMonthly`: 600 € al mes es lo que dan fuentes secundarias para 2026 (prorrogado); NO comprobado en el BOE. El
 *   límite legal por avería es un tercio del IPREM/día por kg de peso bruto (art. 57.1); con 600 €/mes, 6,67 €/kg.
 * - Kilos, valor de la mercancía, perjuicio reclamado, costas y probabilidades: decisiones de diseño.
 */
export const CLAIMS = {
  fromVersion: 4,
  ipremMonthly: 600,
  dano: { window: { from: 6, to: 17 }, kg: { min: 200, max: 1_500 }, valuePerKg: { min: 15, max: 40 }, lateDays: 12, lateChance: 0.5, costs: 600, lostCaseCosts: 300 },
  retraso: { window: { from: 12, to: 21 }, claimFactor: { min: 1.2, max: 2.0 }, ownFaultChance: 0.6, costs: 300 },
  plazo: { window: { from: 8, to: 22 }, extensionWeeks: 4, askedWeeks: 12, legalMaxWeeks: 8, acceptsLegalChance: 0.7 },
} as const;

/**
 * Viajes internacionales por carretera (reglas v5, 10/11/2026; docs/simulador.md §17 octies). Destinos de la UE
 * (Francia y Portugal): sin aduana. Kilómetros por carretera desde Valencia, redondeados [S]. Todo lo demás es SIMULADO:
 * - `kmPerDayLong`: en larga distancia el camión rueda unos 600 km al día (unas 9 h de conducción, el límite diario
 *   general del Reglamento (CE) 561/2006, art. 6.1; texto consolidado vigente pendiente de verificar), frente a los 210
 *   del reparto regional con paradas. El viaje ocupa días enteros de camión: ida y vuelta más un día de carga y descarga.
 * - Peajes extranjeros por viaje (ida y vuelta) y dietas del conductor por día fuera: órdenes de magnitud, no tarifas.
 * - Precio por km de ida, probabilidad de oferta y de carga de retorno: decisiones de diseño.
 * Marruecos y otros destinos fuera de la UE no se incluyen: su régimen de autorizaciones no está verificado.
 */
export const INTERNATIONAL = {
  fromVersion: 5,
  fromWeek: 5,
  chance: 0.5,
  kmPerDayLong: 600,
  loadDays: 1,
  dietPerDay: 90,
  pricePerKmOneWay: { min: 1.8, max: 3.2 },
  backhaulChance: 0.5,
  backhaulPerKm: { min: 0.6, max: 1.2 },
  destinations: [
    { id: "toulouse", city: "Toulouse", country: "Francia", km: 720, tolls: 260 },
    { id: "marsella", city: "Marsella", country: "Francia", km: 820, tolls: 300 },
    { id: "lyon", city: "Lyon", country: "Francia", km: 900, tolls: 330 },
    { id: "oporto", city: "Oporto", country: "Portugal", km: 940, tolls: 150 },
  ],
} as const;

/**
 * Almacén a fondo (reglas v6, 10/11/2026; docs/simulador.md §17 nonies). Todas las cifras son SIMULADAS:
 * - El almacenaje se cobra en tres partes: €/palé/semana (solo el sitio), €/movimiento (entrada o salida de un palé) y
 *   €/línea de pedido preparada. Hasta la v5 la manipulación iba incluida en el precio del palé.
 * - Productividad de un mozo: 400 movimientos o 1.000 líneas por semana. §8 decía 250 y 400; se revisaron porque con
 *   ellas un mozo no atendía ni la mitad del almacén con una rotación normal (decisión de diseño, no medición).
 * - Por encima de su capacidad, hasta un 20 % más con horas extra pagadas un 40 % más; lo demás no se hace.
 * - Mozo temporal (empresa de trabajo temporal): 4 semanas, desde la semana siguiente, a 650 € por semana.
 * - Reorganizar el almacén por rotación (ABC): 900 € una vez; el mozo rinde un 15 % más desde la semana siguiente.
 * - Tarifa del sitio 1,45-2,15 €/palé/semana: con la manipulación, el almacén factura lo mismo que en la v5. Medido con
 *   1,10-1,80, facturaba unos 170 € menos por semana y la estrategia selectiva pasaba de 166 a 31 victorias en 300
 *   partidas; con 1,30-2,00, 70 € menos y 95 victorias.
 * - v7: la prima de reputación ya sube también la manipulación. Con 1,45-2,15 el almacén facturaba 76 € por semana más
 *   que en la v5 (1.557 € frente a 1.481 €, selectiva, 100 partidas); se vuelve a 1,30-2,00 para mantener la paridad.
 */
export const WAREHOUSE_V6 = {
  fromVersion: 6,
  storageRate: { min: 1.45, max: 2.15 },
  /** Desde la v7, con la prima de reputación también sobre la manipulación, el sitio vuelve a 1,30-2,00 (ver abajo). */
  storageRateV7: { min: 1.3, max: 2.0 },
  rotation: { min: 0.15, max: 0.6 },
  linesPerMove: { min: 0.5, max: 3 },
  moveRate: { min: 1.6, max: 2.4 },
  lineRate: { min: 0.5, max: 0.9 },
  movesPerWorker: 400,
  linesPerWorker: 1_000,
  overtime: { maxShare: 0.2, costFactor: 1.4 },
  temp: { weeklyCost: 650, weeks: 4 },
  abc: { cost: 900, productivity: 0.15 },
  stock: { window: { from: 7, to: 18 }, penaltyShort: 400, penaltyExcess: 300 },
  returns: { window: { from: 10, to: 22 }, pallets: { min: 10, max: 40 }, sortRate: 8, gestorPerPallet: 3, dumpFine: 1_500, holdWeeks: 4 },
} as const;

/**
 * Incidencias en los repartos (reglas v9, 17/11/2026, petición del dueño: «más problemas en algunos repartos,
 * situaciones reales»; docs/simulador.md §17 terdecies). Solo en transporte nacional (la Ley 15/2009 no rige el
 * internacional, que va por el Convenio CMR). Desde la semana 3, cada semana con repartos propios hay una probabilidad
 * de que surja una; cada tipo, como mucho una vez por temporada. Base legal comprobada en el BOE el 17/11/2026 (Ley
 * 15/2009, arts. 20, 21, 22, 26, 29, 36 y 47). Importes y probabilidades: SIMULADOS.
 * - `paralizacionPerHour`: el art. 22.3 fija dos veces el IPREM/día por hora o fracción, sin contar la primera ni más de
 *   diez al día; con el IPREM de 600 €/mes (no comprobado en el BOE, ver CLAIMS) son 40 € por hora.
 * - `freeHoursV9`/`freeHours`: CORRECCIÓN del 21/11/2026. Las reglas v9 se escribieron con la redacción ORIGINAL de 2009
 *   del art. 22 («más de dos horas», «sin contar las dos primeras»). Desde la modificación publicada el 02/03/2022 la ley
 *   dice «superior a una hora» y «sin que se tenga en cuenta la primera hora» (texto vigente, 15/04/2026, leído en el
 *   BOE el 21/11/2026, junto con el original). Desde la v10 se calcula así; las partidas v9 guardadas conservan su
 *   cálculo para reproducirse igual, pero su texto explica ya la ley vigente.
 */
export const DELIVERY = {
  fromVersion: 9,
  fromWeek: 3,
  chance: 0.35,
  paralizacionPerHour: 40,
  freeHoursV9: 2,
  freeHours: 1,
  waitHours: { min: 4, max: 7 },
  stolenGoods: 900,
  overweightFine: 1_200,
  stowageDamage: 800,
  stowageDispute: 300,
  missingPallets: 2,
  palletValue: 350,
  disputeCost: 200,
  returnTripCost: 180,
  detourKm: { min: 40, max: 120 },
} as const;

/**
 * Carrera, fase B1 (reglas v11, 21/11/2026; lib/sim/deep.ts y docs/simulador-carrera.md §6). Todas las cifras son
 * SIMULADAS, decisiones de diseño a medir con las estrategias automáticas, no datos del mercado:
 * - `count`: probabilidad de que en una semana lleguen 0, 1, 2 o 3 ofertas: 1,55 de media, un tercio de las de la
 *   Temporada (3-6). Medido con estrategias automáticas el 21/11/2026: con una de media (0, 1 o 2), TODAS quebraban.
 *   El camión solo es rentable casi lleno (1,30 €/km a 1.050 km por semana, 1,96 €/km a 600) y con tan pocas ofertas
 *   los contratos llegan a trozos: el camión iba al 60 % y el almacén pasaba años medio vacío.
 * - `priceFactor`: una operación grande y comprometida se paga un 20 % mejor que la media de los encargos sueltos. Con
 *   el 10 % seguían quebrando la mitad de las prudentes. Decisión calibrada con las estrategias, no un dato de mercado.
 * - `weeks`: un contrato recurrente dura de 8 a 26 semanas (2 a 6 meses); `volume`: piden entre 1,2 y 1,8 veces más.
 * - `maxKmWeek`: una distribución no pide más de 1.000 km a la semana (lo que hace un camión).
 * - `tolerance`: el escandallo es correcto a menos de un 10 % del coste completo y razonable a menos de un 25 %.
 * - `reportCost`: lo que cuesta un informe comercial de un cliente.
 */
export const CAREER_DEEP = {
  fromVersion: 11,
  count: [0.1, 0.4, 0.35, 0.15],
  weeks: { min: 8, max: 26 },
  volume: { min: 1.2, max: 1.8 },
  maxKmWeek: 1_000,
  tolerance: { ok: 0.1, close: 0.25 },
  reportCost: 90,
  priceFactor: 1.2,
} as const;

/**
 * Gasóleo variable (Carrera, fase B2, reglas v12, 22/11/2026; lib/sim/fuel.ts). La ley está comprobada (Ley 15/2009,
 * art. 38); las cifras son SIMULADAS:
 * - `fuelPerKm`: la parte de gasóleo de los 0,42 €/km variables (P.variablePerKm). Es la única que se mueve con el índice.
 * - Índice semanal: paso aleatorio de hasta ±`weeklyStep`, con vuelta a la media (`meanReversion`) y entre `min` y `max`.
 * - `threshold`: el 5 % del art. 38.2 (sin pacto de un umbral menor).
 * - `shareOfFullCost`: peso del gasóleo en el coste completo del camión lleno (0,30 de 1,30 €/km). La ley remite a la
 *   fórmula de la Administración (no leída): este peso es del juego.
 * - `unilateralRise`, `lateRefundCost`, `disputeWeeks`: consecuencias de las respuestas equivocadas.
 */
export const FUEL = {
  fromVersion: 12,
  fuelPerKm: 0.3,
  weeklyStep: 0.025,
  meanReversion: 0.03,
  min: 0.75,
  max: 1.45,
  threshold: 0.05,
  shareOfFullCost: 0.23,
  unilateralRise: 0.15,
  lateRefundCost: 150,
  disputeWeeks: 6,
} as const;
