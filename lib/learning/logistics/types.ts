/**
 * Tipos de la planificación logística de las operaciones de exportación. Las rutas son DATOS; las reglas viven en capacity.ts, allocation.ts,
 * calculator.ts y assess.ts. Todo importe o plazo es un RANGO simulado: no hay precisión inventada.
 */
export interface Range { min: number; max: number }
export const R = (min: number, max: number): Range => ({ min, max });
export const mid = (r: Range) => (r.min + r.max) / 2;
export const addR = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });
export const mulR = (r: Range, k: number): Range => ({ min: r.min * k, max: r.max * k });
export const ZERO: Range = { min: 0, max: 0 };

/** Modalidad que elige el alumno (lo que se compara). */
export type Modality = "carretera" | "maritimo_fcl" | "maritimo_lcl" | "aereo" | "ferroviario" | "multimodal";
export const MODALITY_LABEL: Record<Modality, string> = {
  carretera: "Carretera", maritimo_fcl: "Marítimo FCL (contenedor completo)", maritimo_lcl: "Marítimo LCL (grupaje)",
  aereo: "Aéreo", ferroviario: "Ferroviario", multimodal: "Multimodal",
};

/** Medio de cada tramo. */
export type Vehicle = "camion" | "ferry" | "barco" | "avion" | "tren";
export const VEHICLE_LABEL: Record<Vehicle, string> = { camion: "Camión", ferry: "Ferry (camión embarcado)", barco: "Buque", avion: "Avión", tren: "Tren" };

/** Cómo se cotiza el tramo principal. Cada forma usa su unidad de cobro (ver capacity.ts). */
export type Pricing =
  | { kind: "camion_completo"; km: number }
  | { kind: "grupaje_carretera"; ratePer100Kg: Range }
  | { kind: "ferry"; perTruck: Range }
  | { kind: "fcl"; per20: Range; per40: Range }
  | { kind: "lcl"; perRevenueTon: Range }
  | { kind: "aereo"; perChargeableKg: Range }
  | { kind: "tren"; perContainer40: Range };

export interface Leg { vehicle: Vehicle; from: string; to: string; days: Range; role: "recogida" | "principal" | "ultima_milla"; pricing?: Pricing; note?: string }

export interface RouteOption {
  id: string;
  modality: Modality;
  label: string;
  legs: Leg[];
  /** Puntos de transbordo o cambio de medio (cada uno añade manipulación y riesgo). */
  transshipments: string[];
  /** Días de espera hasta la salida (frecuencia del servicio, cierre de carga). */
  waitDays: Range;
  /** Coste de manipulación en terminales por cada extremo; se multiplica por la unidad de la modalidad. */
  terminal: { kind: "por_contenedor" | "por_tonelada_volumen" | "por_kg_tasable" | "por_palet" | "por_camion"; origin: Range; destination: Range };
  /** Coste de cada transbordo por unidad de la modalidad (cambio de ancho ferroviario, consolidación…). */
  transshipmentCost?: Range;
  /** Gastos en destino por envío (documentos, entrega de la mercancía por la naviera o la aerolínea). */
  destinationCharges: Range;
  /** Advertencias de adecuación (por ejemplo, más manipulaciones para mercancía frágil). Penalizan la adecuación. */
  suitability: { penalty: number; note: string }[];
}

export interface InfeasibleOption { modality: Modality; reason: string }

export interface Cargo {
  product: string;
  hs6: string;
  goods: "general" | "fragil" | "perecedera";
  units: number;
  unit: string;
  pallets: number;
  grossKg: number;
  volumeM3: number;
  /** Valor de la mercancía (precio de venta en origen, EXW). */
  valueEur: number;
}

export type JustificationId = "plazo" | "barata_que_cumple" | "mas_barata" | "mas_rapida" | "aprovecha_capacidad" | "menos_manipulaciones" | "adecuada_mercancia";

/**
 * Envío que se planifica dentro de una operación de exportación (`ExportScenario.logistics` + datos del caso). Las
 * rutas son datos didácticos; el cálculo vive en calculator.ts y la valoración en assess.ts.
 */
export interface Shipment {
  origin: string;
  destination: string;
  /** Código del mercado de destino en el catálogo de SmarTrade (de ahí sale si es UE). */
  market: string;
  cargo: Cargo;
  /** Días disponibles desde que se confirma el pedido hasta la entrega pactada, y días de preparación en almacén. */
  deadlineDays: number;
  prepDays: number;
  routes: RouteOption[];
  infeasible: InfeasibleOption[];
  /** Por qué no hay ruta directa o qué tramos obliga la geografía (didáctico). */
  geographyNote: string;
  /** Razón que decide el caso: la justificación debe incluirla para ser plenamente correcta. */
  decisiveReason: JustificationId;
  /** Tipos SIMULADOS de arancel (general y preferencial con prueba de origen) e impuesto de importación. */
  duty: { general: number; preferential: number } | null;
  importVatPct: number | null;
}
