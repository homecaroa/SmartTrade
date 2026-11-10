/** Tipos del estado de la partida y de las acciones (docs/simulador.md §5 y §6). */

export type Grade = "correcta" | "razonable" | "grave";
export type PayProfile = "puntual" | "tardio";

export interface Client { id: string; name: string; sector: string; profile: PayProfile }

export type OfferKind = "distribucion" | "puntual" | "almacenaje";

export interface Offer {
  id: string;
  week: number;
  kind: OfferKind;
  clientId: string;
  /** Lo que el jugador sabe del cliente al ver la oferta (el perfil de pago no se revela del todo). */
  clientHint: string;
  /** Distribución: km recorridos por semana (retornos incluidos) y €/km. */
  kmWeek?: number;
  ratePerKm?: number;
  /** Servicio puntual: km de ida (el retorno es en vacío) y precio cerrado. */
  kmOneWay?: number;
  price?: number;
  /** Almacenaje: palés y €/palé/semana. */
  pallets?: number;
  palletRate?: number;
  weeks: number;
  /** Plazo de pago pactado, en semanas. */
  payWeeks: number;
  /** Negociación (09/11/2026): condiciones con las que llegó la oferta, rondas hechas y último mensaje del cliente. */
  original?: { rate: number; weeks: number; payWeeks: number };
  round?: number;
  note?: string;
  /** El cliente aceptó tus condiciones: falta que confirmes (con la documentación). */
  agreed?: boolean;
  /** Viaje puntual (v2): carga que el mismo cliente te ofrece para la vuelta, si la hay. */
  backhaul?: { pallets: number; price: number };
}

export interface Contract extends Offer {
  startWeek: number;
  endWeek: number;
  cancelledWeek?: number;
  /** Documentación preparada al aceptar (ausente en partidas anteriores al 09/11/2026: no se califica ni penaliza). */
  docs?: string[];
  docIssues?: ("sin_control" | "sin_albaran")[];
  /** La consecuencia de la documentación que faltaba ya ocurrió (solo una vez por contrato). */
  docPenalized?: boolean;
  /** Viaje puntual: aceptaste también la carga de retorno. */
  withBackhaul?: boolean;
  /** Transporte encargado a otro transportista (10/11/2026): no ocupa tu camión y cuesta P.subcontractPerKm. */
  subcontracted?: boolean;
}

export interface Invoice { id: string; contractId: string; clientId: string; amount: number; week: number; dueWeek: number; payWeek: number; paidWeek?: number }
export interface Payable { id: string; label: string; amount: number; week: number; dueWeek: number; paidWeek?: number }
export interface CashMove { week: number; label: string; amount: number }

export interface WeekRecord {
  week: number;
  kmCapacity: number;
  kmCommitted: number;
  kmOwn: number;
  kmSubcontracted: number;
  kmUnserved: number;
  palletsCommitted: number;
  palletsStored: number;
  revenueTransport: number;
  revenueWarehouse: number;
  costVariable: number;
  costSubcontract: number;
  costRepair: number;
  costFixed: number;
  /** Sanciones y reclamaciones por documentación (09/11/2026). */
  costPenalties: number;
  /** Intereses y comisiones de la póliza de crédito (10/11/2026; ausente en semanas anteriores). */
  costFinancial?: number;
  /** Palés que cabían esa semana (10/11/2026; ausente = P.warehousePallets). */
  palletCapacity?: number;
  amortization: number;
  result: number;
  collections: number;
  payments: number;
  cashEnd: number;
  serviceLevel: number;
  notes: string[];
}

export type IncidentKind = "averia" | "mora";
export interface Incident { id: string; kind: IncidentKind; week: number; title: string; prompt: string; concept: string; data: Record<string, number | string> }
export interface IncidentOption { id: string; label: string; grade: Grade; feedback: string }

/** Registro de aprendizaje: cada decisión calificada, con las competencias que ejercita (docs/curriculo.md). */
export interface LearningEntry { week: number; what: string; answer: string; grade: Grade; feedback: string; competences: string[] }

export type GameStatus = "jugando" | "incidencia" | "quiebra" | "fin";

export interface SimState {
  version: number;
  seed: number;
  week: number;
  status: GameStatus;
  cash: number;
  deposit: number;
  truckValue: number;
  equity0: number;
  result: number;
  accruedFixed: number;
  receivables: Invoice[];
  payables: Payable[];
  contracts: Contract[];
  offers: Offer[];
  weeks: WeekRecord[];
  ledger: CashMove[];
  pending: Incident | null;
  answers: Record<string, string>;
  negativeWeeks: number;
  /** Semanas seguidas con servicio por debajo del mínimo (derrota a las 4). Opcional por compatibilidad. */
  lowServiceWeeks?: number;
  /** Motivo del final si la partida acaba antes de tiempo. */
  endReason?: string;
  learning: LearningEntry[];
  /** Herramientas para crecer contratadas y semana de la decisión (surten efecto la semana siguiente; 10/11/2026). */
  growth?: Growth;
}

export const GROWTH_OPTIONS = ["renting", "compra", "almacen", "poliza"] as const;
export type GrowthOption = (typeof GROWTH_OPTIONS)[number];
export interface Growth { camion?: { modo: "renting" | "compra"; week: number }; almacen?: { week: number }; poliza?: { week: number } }

export type Action =
  | { t: "aceptar"; oferta: string; docs?: string[]; retorno?: boolean; subcontratar?: boolean }
  | { t: "crecer"; opcion: GrowthOption }
  | { t: "proponer"; oferta: string; tarifa: number; semanas: number; plazo: number }
  | { t: "responder"; incidencia: string; opcion: string }
  | { t: "pregunta"; pregunta: string; opcion: string }
  | { t: "cerrar" };

export interface SaveFile { app: "smartrade-simulador"; version: number; seed: number; actions: Action[]; savedAt: string }
