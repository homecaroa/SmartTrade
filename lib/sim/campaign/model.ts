/**
 * Campaña del Business Simulator (motor nuevo, 23/11/2026; docs/simulador-campana.md). Tipos del estado.
 *
 * La empresa PERSISTE entre niveles: caja, deudas, vehículos, nave, clientes, reputación, mejoras y la memoria de lo
 * que decidiste. Cada nivel es una misión de 4 a 8 semanas sobre esa empresa. Todo es SIMULADO salvo la normativa, que
 * se cita solo si está comprobada en el BOE.
 */
import type { Grade } from "../model";

export type { Grade };

export interface Vehicle { id: string; name: string; kmWeek: number; monthly: number; mode: "renting" | "propio" }

/**
 * Persona de la plantilla (nivel 4 en adelante). Solo los puestos clave tienen nombre (decisión del dueño, 23/11/2026).
 * Sueldos SIMULADOS (no se ha encontrado publicado el convenio de transporte de Valencia), siempre por encima del
 * salario mínimo de 2026.
 */
export interface Person {
  id: string;
  name: string;
  role: "conductor" | "mozo" | "temporal";
  contract: "indefinido" | "temporal";
  /** Sueldo bruto al mes (el coste para la empresa es mayor: cotizaciones). */
  salaryMonthly: number;
  startAbs: number;
  /** Fin del contrato temporal (incluida) o salida. */
  endAbs?: number;
  /** Último día del periodo de prueba (Estatuto de los Trabajadores, art. 14). */
  trialUntilAbs: number;
  /** Km de más (o de menos) a la semana que hace la furgoneta con esta persona al volante. */
  kmBonus?: number;
  /** Ahorro semanal en horas de empresa de trabajo temporal en la nave. */
  opsSaving?: number;
  satisfaction: number;
  left?: boolean;
}

export interface Facility {
  id: "urbana" | "poligono" | "compartida";
  name: string;
  pallets: number;
  rentMonthly: number;
  /** Coste semanal de operarla (personal por horas, luz, carretilla). */
  opsWeek: number;
  /** Km de más a la semana por estar lejos de los clientes. */
  kmExtra: number;
  /** Semana absoluta desde la que funciona (cuando acaba la obra). */
  readyAbs: number;
}

/** Contrato recurrente de la cartera: transporte (km a la semana) o almacenaje (palés). */
export interface Deal {
  id: string;
  client: string;
  kind: "transporte" | "almacen";
  km?: number;
  rate?: number;
  pallets?: number;
  palletRate?: number;
  /** Plazo de pago pactado, en semanas. */
  payWeeks: number;
  /** Semana absoluta en que empieza y, si la tiene, en que acaba. */
  fromAbs: number;
  toAbs?: number;
  /** Semanas seguidas sin servirle entero (a la segunda, se va). */
  missed: number;
  ended?: boolean;
  /** Lo hace un subcontratista: no ocupa tu furgoneta y te cobra SUB_RATE por km. */
  sub?: boolean;
  /** Lo cubre tu propia gente fuera de la capacidad normal (horas extra, un temporal): no lo cobra un subcontratista. */
  selfCovered?: boolean;
  /** Almacenaje en un espacio externo alquilado: no ocupa tu nave (su coste lo carga el nivel). */
  external?: boolean;
}

export interface Invoice { id: string; client: string; amount: number; issuedAbs: number; dueAbs: number; payAbs: number; paidAbs?: number; factored?: boolean }
export interface Payable { id: string; label: string; amount: number; dueAbs: number; paidAbs?: number }

export interface Company {
  name: string;
  cash: number;
  /** Capital inicial y aportaciones de socios (rescates). */
  capital: number;
  /** Parte del capital que has cedido a socios, en %. */
  partnerShare: number;
  result: number;
  vehicles: Vehicle[];
  facility: Facility | null;
  deals: Deal[];
  invoices: Invoice[];
  payables: Payable[];
  /** Fianzas entregadas (activo: se recuperan al irte). */
  deposits: number;
  /** Instalaciones y equipos: valor neto (se amortiza cada semana). */
  assets: number;
  assetsWeekly: number;
  credit: { limit: number; annualRate: number } | null;
  /** Relación con cada cliente, 0-100. */
  relation: Record<string, number>;
  /** Reputación de la empresa, 0-100. */
  reputation: { fiabilidad: number; precio: number };
  upgrades: string[];
  /** Plantilla (desde el nivel 4; ausente antes, para que las campañas guardadas no cambien). */
  staff?: Person[];
  /** Lo que decidiste y tiene consecuencias más adelante (p. ej. «aplazaste el pago al taller sin pactarlo»). */
  memory: string[];
}

export interface Option { id: string; label: string; detail?: string }

/** Decisión pendiente en la bandeja: se resuelve antes de cerrar la semana. */
export interface Decision {
  id: string;
  title: string;
  /** Situación, con las cifras de tu empresa. */
  prompt: string;
  /** Pista de concepto ANTES de decidir (sin dar la respuesta). */
  hint: string;
  options: Option[];
  /** Decisión importante: entra en «qué habría pasado si» y en el dominio. */
  key: boolean;
  data?: Record<string, string | number>;
}

export interface LearningRec {
  week: number; level: number; id: string; what: string; answer: string; grade: Grade;
  /** Consecuencias explicadas, con las cifras y la norma si la hay. */
  feedback: string;
  competences: string[];
  key: boolean;
}

export interface WeekLog {
  abs: number; week: number; level: number;
  revenue: number; variable: number; fixed: number; financial: number; other: number; amortization: number; result: number;
  /** Sueldos y cotizaciones de la plantilla (solo si la hay). */
  staff?: number;
  kmDemand: number; kmCapacity: number; kmServed: number; pallets: number; palletCapacity: number;
  collections: number; payments: number; cashEnd: number; notes: string[];
}

export type Status = "sede" | "jugando" | "fin_nivel" | "quiebra";

export interface CampaignState {
  version: number;
  seed: number;
  company: Company;
  /** Índice del nivel en curso (0 = nivel 1). */
  level: number;
  /** Semana dentro del nivel (1…) y absoluta en la campaña. */
  week: number;
  abs: number;
  status: Status;
  pending: Decision[];
  /** Respuestas dadas (id de decisión → opción). */
  answers: Record<string, string>;
  logs: WeekLog[];
  learning: LearningRec[];
  /** Conceptos desbloqueados del Manual. */
  manual: string[];
  /** Preguntas del informe final respondidas (id → opción). */
  debrief: Record<string, string>;
  /** Estado propio del nivel en curso. */
  data: Record<string, number | string | boolean>;
  /** Resultado de cada nivel terminado. */
  results: LevelResult[];
  negativeWeeks: number;
  endReason?: string;
  /** Gastos (o ingresos, negativos) decididos esta semana que se cargan al cerrarla. `cash: false`: quedan como deuda. */
  charges: { label: string; amount: number; cash: boolean }[];
  /** Decisiones importantes ya tomadas, con sus opciones (para el informe y «qué habría pasado si»). */
  history: { level: number; week: number; id: string; title: string; options: Option[]; chosen: string }[];
}

export interface LevelResult { level: number; stars: [boolean, boolean, boolean]; passed: boolean; resultLevel: number; cashEnd: number }

export type Action =
  | { t: "decidir"; id: string; opcion: string }
  | { t: "cerrar" }
  | { t: "mejora"; id: string }
  | { t: "empezar" }
  | { t: "rescate" }
  | { t: "pregunta"; id: string; opcion: string };

export interface CampaignSave { app: "smartrade-campana"; version: number; seed: number; levels: Action[][]; savedAt: string }
