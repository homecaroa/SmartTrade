import { INCOTERMS, type Incoterm, type Party } from "@/lib/logistics/incoterms";
import { incotermOf, sellerBearsTransitRisk, sellerMustInsure } from "../export/costs";
import type { Modality, RouteOption } from "./types";

/**
 * Quién paga cada concepto logístico según el Incoterm. Parte de la tabla de Incoterms® 2020 que ya existe en
 * SmarTrade (transporte principal, despachos, seguro: lib/logistics/incoterms.ts) y añade los conceptos que esa tabla
 * no detalla, con estas convenciones didácticas (simplificación: en una operación real se pactan por escrito):
 * - Lugar convenido: reglas E/F en origen (EXW en el almacén del vendedor; FCA en la terminal de salida); reglas C en
 *   la terminal, puerto o aeropuerto de destino; reglas D en el almacén del comprador.
 * - Recogida y transporte interior en origen: comprador en EXW; vendedor en el resto.
 * - Manipulación en la terminal de origen: comprador en EXW, FCA y FAS (entrega antes de cargar); vendedor en el resto.
 * - Manipulación en la terminal de destino y última milla: vendedor en las reglas D; comprador en el resto.
 * - Gastos en destino (documentos, entrega por la naviera o aerolínea): vendedor solo en reglas D.
 * - Descarga en el almacén de destino: solo la paga el vendedor en DPU (va incluida en la última milla).
 * El riesgo y la propiedad son cosas distintas: el Incoterm fija cuándo pasa el RIESGO; la propiedad depende del
 * contrato de compraventa y de la ley aplicable.
 */
export type LogisticsConcept =
  | "recogida" | "terminal_origen" | "despacho_exportacion" | "transporte_principal" | "transbordos" | "seguro"
  | "terminal_destino" | "gastos_destino" | "despacho_importacion" | "ultima_milla" | "aranceles" | "iva_importacion";

export const CONCEPT_LABEL: Record<LogisticsConcept, string> = {
  recogida: "Recogida y transporte interior en origen", terminal_origen: "Manipulación y terminal de origen",
  despacho_exportacion: "Despacho de exportación", transporte_principal: "Transporte principal", transbordos: "Transbordos y cambios de medio",
  seguro: "Seguro de la mercancía", terminal_destino: "Manipulación y terminal de destino", gastos_destino: "Gastos en destino",
  despacho_importacion: "Despacho de importación", ultima_milla: "Última milla hasta el almacén del comprador",
  aranceles: "Aranceles", iva_importacion: "IVA o impuesto de importación",
};

const D_RULES = ["DAP", "DPU", "DDP"];

export function payerOf(concept: LogisticsConcept, code: string): Party {
  const i = incotermOf(code);
  switch (concept) {
    case "recogida": return code === "EXW" ? "comprador" : "vendedor";
    case "terminal_origen": return ["EXW", "FCA", "FAS"].includes(code) ? "comprador" : "vendedor";
    case "despacho_exportacion": return i.exportClearance;
    case "transporte_principal": case "transbordos": return i.carriage;
    case "seguro": return sellerMustInsure(i) || sellerBearsTransitRisk(i) ? "vendedor" : "comprador";
    case "terminal_destino": case "gastos_destino": case "ultima_milla": return D_RULES.includes(code) ? "vendedor" : "comprador";
    case "despacho_importacion": case "aranceles": case "iva_importacion": return i.importClearance;
  }
}

/** ¿Dónde pasa el riesgo? Explicación breve para el alumno (a partir de la tabla existente). */
export const riskPoint = (code: string) => incotermOf(code).risk;

/** ¿El riesgo del transporte principal es todavía del vendedor? (decide quién soporta un daño en ruta). */
export const sellerRiskInMainLeg = (code: string) => sellerBearsTransitRisk(incotermOf(code));

/** ¿Tiene el vendedor obligación de entregar en destino en una fecha? Solo en las reglas D (en E/F/C cumple al expedir). */
export const sellerDeliversAtDestination = (code: string) => D_RULES.includes(code);

/**
 * Aplicabilidad de una regla a la ruta elegida:
 * - FAS, FOB, CFR y CIF son solo para transporte marítimo y vías navegables: contradicción si el tramo principal no es
 *   por barco (camión, avión, tren, o camión embarcado en ferry, que se contrata como transporte por carretera).
 * - Con contenedores (FCL/LCL), la ICC recomienda FCA, CPT o CIP en lugar de FOB, CFR o CIF: es un aviso, no un error.
 */
export function applicability(code: string, route: Pick<RouteOption, "modality" | "legs">): { ok: boolean; level: "ok" | "aviso" | "contradiccion"; message: string } {
  const i = incotermOf(code);
  const mainBySea = route.legs.some((l) => l.role === "principal" && l.vehicle === "barco");
  if (i.modes === "solo marítimo y fluvial" && !mainBySea)
    return { ok: false, level: "contradiccion", message: `${code} es una regla solo para transporte marítimo y vías navegables interiores; el transporte principal elegido no es por barco. Hay que usar una regla multimodal (EXW, FCA, CPT, CIP, DAP, DPU o DDP).` };
  if (i.modes === "solo marítimo y fluvial" && (route.modality === "maritimo_fcl" || route.modality === "maritimo_lcl"))
    return { ok: true, level: "aviso", message: `${code} es válida por barco, pero con contenedores la ICC recomienda FCA, CPT o CIP: el contenedor se entrega en la terminal antes de embarcar y el riesgo en ${code} pasa más tarde, cuando el vendedor ya no lo controla.` };
  return { ok: true, level: "ok", message: `${code} sirve para cualquier modo de transporte.` };
}

export const ALL_INCOTERMS: Incoterm[] = INCOTERMS;
export const MULTIMODAL_RULES = INCOTERMS.filter((i) => i.modes === "cualquier modo").map((i) => i.code);
export const SEA_ONLY_RULES = INCOTERMS.filter((i) => i.modes !== "cualquier modo").map((i) => i.code);
export type { Party, Modality };
