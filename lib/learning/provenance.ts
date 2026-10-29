/**
 * Procedencia de cada dato del Modo Aprendizaje. Separa lo que viene de SmarTrade (real, con su fuente) de lo inventado
 * para el caso. Regla: un dato inventado NUNCA se presenta como estadística, tarifa, empresa u oferta real.
 */
export const SIMULATED_NOTICE = "Datos simulados con fines educativos";

export type ProvenanceKind = "real" | "supuesto" | "estimacion" | "verificar";
export interface Provenance { kind: ProvenanceKind; source?: string }

export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  real: "Dato real reutilizado",
  supuesto: "Supuesto del escenario",
  estimacion: "Estimación didáctica",
  verificar: "Verificar en una operación real",
};

/** Un dato mostrado en una ficha, con su procedencia. */
export interface Fact { label: string; value: string; prov: Provenance }

export const REAL_HS = { kind: "real", source: "Catálogo HS6 de SmarTrade (selección orientativa, nomenclatura HS2022)" } as const satisfies Provenance;
export const REAL_MARKET = { kind: "real", source: "Catálogo de mercados de SmarTrade (pertenencia a la UE)" } as const satisfies Provenance;
export const REAL_INCOTERMS = { kind: "real", source: "Resumen de Incoterms® 2020 de SmarTrade (/logistica); no es el texto oficial de la ICC" } as const satisfies Provenance;
export const SUPUESTO = { kind: "supuesto" } as const satisfies Provenance;
export const ESTIMACION = { kind: "estimacion" } as const satisfies Provenance;
export const VERIFICAR = { kind: "verificar" } as const satisfies Provenance;
