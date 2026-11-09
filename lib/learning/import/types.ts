import type { DocOption, Grade } from "../export/types";
import type { Fact } from "../provenance";

/**
 * Simulador de IMPORTACIÓN (desde el 09/11/2026). Es un módulo propio, no una variante del de exportación: aquel calcula
 * el margen del VENDEDOR y reparte costes vendedor/comprador; aquí el alumno es el comprador español y lo que cuenta es
 * el coste puesto en su almacén. Comparte con exportación solo piezas genéricas (calificación de documentos, orden
 * mezclado, notas, aviso de datos simulados). Cubre sobre todo el módulo 0627 (Gestión administrativa del comercio
 * internacional) del currículo: ver docs/curriculo.md.
 */
export type { DocOption, Grade };

export type ImportStageId = "ficha" | "proveedor" | "contrato" | "clasificacion" | "valoracion" | "despacho" | "impuestos" | "mercado";

export const IMPORT_STAGES: { id: ImportStageId; title: string }[] = [
  { id: "proveedor", title: "Elección del proveedor" },
  { id: "contrato", title: "Contrato de compra" },
  { id: "clasificacion", title: "Clasificación y origen" },
  { id: "valoracion", title: "Valor en aduana" },
  { id: "despacho", title: "Despacho de importación" },
  { id: "impuestos", title: "IVA a la importación" },
  { id: "mercado", title: "Recepción y puesta en el mercado" },
];

export type ImportAnswers = Record<string, string | string[]>;

/** Oferta de un proveedor. Precios por unidad, FOB en su puerto. Todo SIMULADO. */
export interface SupplierOffer {
  id: string;
  label: string;
  /** País de ORIGEN real de la mercancía (el que cuenta para aranceles y antidumping). */
  origin: string;
  /** País desde el que se envía. */
  consignedFrom: string;
  port: string;
  fobUnit: number;
  /** Flete marítimo del contenedor hasta Valencia. */
  freight: number;
  /** Se aplica el derecho antidumping (origen China o enviado desde un país al que se extendió la medida). */
  antidumping: boolean;
  /** Propuesta ilegal (elusión de medidas): se califica como error grave y no se liquida como ahorro. */
  evasion?: boolean;
  note: string;
}

export interface ImportCtx { scenario: ImportScenario; answers: ImportAnswers }
export type IDyn<T> = T | ((ctx: ImportCtx) => T);

export interface ImportOption { id: string; label: string; grade: IDyn<Grade>; feedback: IDyn<string>; extraCost?: (ctx: ImportCtx) => { label: string; amount: number; note: string } | null }

interface Base { id: string; stage: ImportStageId; title: string; prompt: IDyn<string>; concept?: string; appliesIf?: (ctx: ImportCtx) => boolean; incident?: boolean }
export interface ImportSingle extends Base { kind: "single"; options: IDyn<ImportOption[]>; best: IDyn<string>; whyBest: IDyn<string> }
export interface ImportMulti extends Base { kind: "multi"; docs: IDyn<DocOption[]>; /** Frase cuando la selección es exacta. */ allRight?: string }
export type ImportDecision = ImportSingle | ImportMulti;

export interface ImportScenario {
  id: string;
  title: string;
  difficulty: "básica" | "media" | "avanzada";
  summary: string;
  learningGoal: string;
  instructions: string[];
  /** Código NC de 8 dígitos de la mercancía y su descripción. */
  cnCode: string;
  importer: { name: string; city: string; description: string };
  quantity: { units: number; unit: string; detail: string };
  suppliers: SupplierOffer[];
  /** Precio al que el importador vende a las tiendas, por unidad. Supuesto. */
  resaleUnitPrice: number;
  targetMarginPct: number;
  /** Tipos SIMULADOS (salvo que la ficha diga otra cosa). */
  rates: {
    conventionalDutyPct: number;
    antidumpingPct: number;
    vatPct: number;
    /** Prima del seguro sobre el 110 % del valor CIF, según cobertura. */
    insuranceA: number;
    insuranceC: number;
    /** Sobreprecio que aplica el proveedor cuando contrata él el flete (CIF/DAP), sobre el coste del flete. */
    supplierFreightMarkupPct: number;
  };
  /** Pagos del importador que forman (o no) parte del valor en aduana. */
  royaltyUnit: number;
  buyingCommissionPct: number;
  /** Gastos en el puerto de llegada (descarga y manipulación), transporte al almacén y despacho. */
  destinationHandling: number;
  inlandTransport: number;
  customsBrokerDirect: number;
  customsBrokerIndirect: number;
  /** Interés anual con el que se estima el coste de adelantar el IVA (si no se difiere) y días hasta recuperarlo. */
  vatAdvance: { annualRatePct: number; days: number };
  facts: Fact[];
  decisions: ImportDecision[];
}
