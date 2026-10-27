import { ACCESS_LINKS } from "@/lib/market-access";

/**
 * Lista de comprobaciones PENDIENTES antes de exportar. SmarTrade no verifica ninguna: todas figuran como pendientes
 * y solo se enlazan las fuentes oficiales ya conocidas. No hay seguimiento persistente (no hay almacenamiento).
 */
export interface ResearchStep { id: string; task: string; verify: string; sourceTitle?: string; sourceUrl?: string; internalHref?: string; internalTitle?: string }

const A2M = ACCESS_LINKS[0];
const ICEX = ACCESS_LINKS[1];

export const RESEARCH_STEPS: ResearchStep[] = [
  { id: "requisitos", task: "Requisitos de importación y de producto", verify: "Normas técnicas, sanitarias, etiquetado, licencias o restricciones del país de destino para tu código.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "aranceles", task: "Aranceles y preferencias comerciales", verify: "Arancel aplicable a tu código completo y si existe un acuerdo UE–destino.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "origen", task: "Reglas de origen", verify: "Qué exige el acuerdo para que tu producto se considere originario y cómo se acredita.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "impuestos", task: "IVA y otros impuestos de importación", verify: "Impuestos y trámites aduaneros del país de destino, distintos del arancel.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "competencia", task: "Competidores y precios comerciales", verify: "Quién abastece ese mercado, a qué precios de venta y con qué marcas o canales (el valor unitario estadístico no es un precio).", sourceTitle: ICEX.title, sourceUrl: ICEX.url },
  { id: "canales", task: "Distribuidores y compradores", verify: "Importadores, distribuidores o plataformas que podrían comprar tu producto." },
  { id: "transporte", task: "Transporte, seguro y plazos", verify: "Presupuestos reales de transporte y seguro, y el Incoterm de la oferta; SmarTrade no estima costes ni tiempos.", internalHref: "/logistica", internalTitle: "Guía de transporte e Incoterms" },
];
