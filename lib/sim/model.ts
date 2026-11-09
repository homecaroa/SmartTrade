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
}

export interface Contract extends Offer { startWeek: number; endWeek: number; cancelledWeek?: number }

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
}

export type Action =
  | { t: "aceptar"; oferta: string }
  | { t: "responder"; incidencia: string; opcion: string }
  | { t: "pregunta"; pregunta: string; opcion: string }
  | { t: "cerrar" };

export interface SaveFile { app: "smartrade-simulador"; version: number; seed: number; actions: Action[]; savedAt: string }
