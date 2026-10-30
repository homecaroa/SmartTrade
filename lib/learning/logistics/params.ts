import { R } from "./types";

/**
 * PARÁMETROS del Laboratorio de logística: separados de los cálculos para poder actualizarlos.
 * TODOS son «Estimaciones simuladas con fines educativos»: órdenes de magnitud plausibles expresados como rangos,
 * NO tarifas reales ni cotizaciones de transportistas. Las capacidades y los factores volumétricos son los valores de
 * referencia habituales en la enseñanza de la logística (verificar en cada operación real).
 */
export const LOGISTICS_NOTICE = "Estimaciones simuladas con fines educativos";

export const CAPACITY = {
  /** Capacidad útil orientativa (no la nominal): no se llena nunca el 100 % del volumen. */
  container20: { m3: 28, kg: 25_000, label: "contenedor de 20 pies" },
  container40: { m3: 58, kg: 26_500, label: "contenedor de 40 pies" },
  truck: { pallets: 33, kg: 24_000, m3: 85, label: "camión completo (tráiler)" },
};

/** Factores para el peso tasable: kg que se cobran por m³ cuando la mercancía es ligera para su volumen. */
export const VOLUMETRIC = {
  /** Aéreo, relación 1:6000 cm³/kg → 166,7 kg/m³. */
  aereo: 1_000_000 / 6000,
  /** Grupaje por carretera: 1 m³ = 333 kg (relación 1:3). */
  carretera: 333,
  /** Marítimo LCL: 1 tonelada o 1 m³, lo que sea mayor («W/M»). */
  lclKgPerM3: 1000,
};

export const RATES = {
  truckFixed: R(250, 400),
  truckPerKm: R(1.15, 1.45),
  customsExport: R(90, 160),
  customsImport: R(120, 250),
  insurancePct: R(0.15, 0.35),
  /** Recogida en origen (Sevilla) hasta puerto, terminal o aeropuerto, por camión o por envío pequeño. */
  pickupTruck: R(120, 220),
  pickupSmall: R(80, 150),
  /** Entrega desde puerto, terminal o aeropuerto de destino hasta el almacén del comprador. */
  lastMileTruck: R(180, 380),
  lastMileSmall: R(90, 190),
  /** Hasta cuántos palets se usa un vehículo pequeño en recogida y última milla. */
  smallLoadMaxPallets: 4,
  /** Penalización por retraso pactada en los casos: % del valor por día. Supuesto de los escenarios. */
  latePenaltyPctPerDay: 0.5,
};
