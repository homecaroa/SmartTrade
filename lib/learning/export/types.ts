import type { Fact } from "../provenance";
import type { Cargo, InfeasibleOption, JustificationId, RouteOption } from "../logistics/types";
import type { PaymentId } from "../payments";

/**
 * Tipos del simulador de exportación. Un escenario son DATOS (tipados y deterministas); las reglas viven en engine.ts,
 * costs.ts, validation.ts y evaluation.ts. Las funciones dentro de un escenario solo leen el contexto: no hay azar.
 */
export type Grade = "correcta" | "razonable" | "grave";
export type Party = "vendedor" | "comprador";
export type StageId = "ficha" | "preparacion" | "contrato" | "logistica" | "documentacion" | "aduanas" | "entrega";

export const STAGES: { id: StageId; title: string }[] = [
  { id: "ficha", title: "Ficha inicial" },
  { id: "preparacion", title: "Preparación comercial" },
  { id: "contrato", title: "Oferta y contrato" },
  { id: "logistica", title: "Preparación logística" },
  { id: "documentacion", title: "Documentación" },
  { id: "aduanas", title: "Aduanas y cumplimiento" },
  { id: "entrega", title: "Entrega y cobro" },
];

/** Respuestas del alumno: id de opción (decisión simple) o lista de ids (selección de documentos). */
export type Answers = Record<string, string | string[]>;

export interface Settings {
  incoterm?: string;
  payment?: PaymentId;
  /** Ruta elegida (id de `logistics.routes`). */
  transport?: string;
  packing?: string;
  /** Solo se pregunta cuando el vendedor soporta el riesgo del transporte sin obligación de asegurar (reglas D). */
  insurance?: "si" | "no";
  documents?: string[];
}

export interface DecisionCtx { scenario: ExportScenario; answers: Answers; settings: Settings }
export type Dyn<T> = T | ((ctx: DecisionCtx) => T);

/** Coste extra que provoca una decisión (por ejemplo, una penalización por retraso). */
export interface ExtraCost { concept: "incidencia" | "ajuste_comercial"; label: string; amount: number; payer: Party; note: string }

export interface Option {
  id: string;
  label: string;
  grade: Dyn<Grade>;
  /** Consecuencia de elegirla, explicada al alumno. */
  feedback: Dyn<string>;
  cost?: (ctx: DecisionCtx) => ExtraCost | null;
}

/** Opción de una selección múltiple de documentos: la nota se calcula a partir de `need`. */
export interface DocOption { id: string; label: string; need: "obligatorio" | "recomendado" | "innecesario" | "incorrecto"; explain: string }

interface BaseDecision {
  id: string;
  stage: StageId;
  title: string;
  prompt: Dyn<string>;
  /** Concepto técnico explicado en una o dos frases. */
  concept?: string;
  appliesIf?: (ctx: DecisionCtx) => boolean;
  /** Si es la incidencia del caso (se resalta en pantalla). */
  incident?: boolean;
}
export interface SingleDecision extends BaseDecision { kind: "single"; options: Option[]; best: Dyn<string>; whyBest: Dyn<string> }
export interface MultiDecision extends BaseDecision { kind: "multi"; docs: Dyn<DocOption[]> }
/** Elegir ruta entre `logistics.routes`: se corrige con assess.ts (la mejor es la más barata de las que llegan a tiempo). */
export interface RouteDecision extends BaseDecision { kind: "route" }
/** Justificar la ruta elegida marcando motivos: se corrige contra los mismos datos que ve el alumno. */
export interface JustifyDecision extends BaseDecision { kind: "justify" }
export type Decision = SingleDecision | MultiDecision | RouteDecision | JustifyDecision;

/** Planificación logística del caso: carga, rutas didácticas y alternativas no viables (lib/learning/logistics). */
export interface ShipmentPlan {
  origin: string;
  destinationPlace: string;
  /** Carga física; el valor de la mercancía se calcula con el precio EXW del caso. */
  cargo: Omit<Cargo, "valueEur" | "units" | "unit" | "hs6" | "product">;
  routes: RouteOption[];
  infeasible: InfeasibleOption[];
  geographyNote: string;
  decisiveReason: JustificationId;
}
export interface PackingOption { id: string; label: string; cost: number; protects: boolean }

export interface ExportScenario {
  id: string;
  title: string;
  difficulty: "básica" | "media" | "avanzada";
  summary: string;
  learningGoal: string;
  instructions: string[];
  hs6: string;
  /** Código del mercado de destino en el catálogo de SmarTrade (de ahí sale si es UE o no). */
  destination: string;
  company: { name: string; city: string; description: string };
  buyer: { name: string; city: string; description: string };
  quantity: { units: number; unit: string; detail: string };
  /** Precio en origen (EXW) por unidad, con el embalaje estándar incluido. Supuesto del escenario. */
  exwUnitPrice: number;
  /** Coste de fabricación o compra por unidad. Supuesto del escenario. */
  unitCost: number;
  targetMarginPct: number;
  facts: Fact[];
  /** Rutas, carga y plazos del envío. Fletes, terminales, despachos y seguro salen de lib/learning/logistics/params.ts. */
  logistics: ShipmentPlan;
  packing: PackingOption[];
  /** null en operaciones dentro de la UE (no hay aranceles ni despacho). Tipos SIMULADOS, no tarifas oficiales. */
  duty: { generalRatePct: number; preferentialRatePct: number; originProofDoc: string } | null;
  importVatRatePct: number | null;
  sellerVatRegisteredAtDestination: boolean;
  /** Días disponibles desde la confirmación del pedido hasta la entrega pactada, y días de preparación en almacén. */
  deadlineDays: number;
  prepDays: number;
  /** Ruta y embalaje con los que se calculó el escandallo de precios (lo que el vendedor repercute en cada Incoterm). */
  standard: { transport: string; packing: string };
  incoterms: string[];
  decisions: Decision[];
}
