import { ACCESS_LINKS } from "@/lib/market-access";

/**
 * Lista de comprobaciones PENDIENTES antes de exportar. SmarTrade no verifica ninguna: todas figuran como pendientes
 * y solo se enlazan las fuentes oficiales ya conocidas. No hay seguimiento persistente (no hay almacenamiento).
 */
export interface ResearchLink { title: string; url: string; purpose: string }
export interface ResearchStep { id: string; task: string; verify: string; sourceTitle?: string; sourceUrl?: string; internalHref?: string; internalTitle?: string; links?: ResearchLink[] }

/**
 * Organismos públicos españoles de seguro y financiación de la exportación (decisión del dueño, 03/11/2026: solo
 * enlaces; ninguno publica datos que se puedan integrar). Direcciones comprobadas el 04/11/2026: ICO, COFIDES y CESCE
 * responden; la de la Secretaría de Estado de Comercio (FIEM) se tomó del buscador porque su servidor no completa la
 * cadena de certificados para clientes automáticos.
 */
export const FINANCE_LINKS: ResearchLink[] = [
  { title: "CESCE · seguro de crédito a la exportación", url: "https://www.cesce.es/es/seguros-de-credito", purpose: "Cubrir el riesgo de impago del comprador y consultar el riesgo país." },
  { title: "ICO · líneas de internacionalización", url: "https://www.ico.es/", purpose: "Líneas ICO Exportadores (anticipo de facturas) e ICO Internacional, a través de los bancos." },
  { title: "COFIDES · financiación de inversiones en el exterior", url: "https://www.cofides.es/", purpose: "Fondos FIEX y FONPYME para proyectos de inversión de empresas españolas fuera de España." },
  { title: "FIEM · Secretaría de Estado de Comercio", url: "https://comercio.gob.es/Financiacion_para_internacionalizacion/FIEM/Paginas/index.aspx", purpose: "Financiación pública de exportaciones y proyectos en el exterior." },
];

const A2M = ACCESS_LINKS[0];
const ICEX = ACCESS_LINKS[1];
const TRADE_MAP = ACCESS_LINKS[2];

export const RESEARCH_STEPS: ResearchStep[] = [
  { id: "requisitos", task: "Requisitos de importación y de producto", verify: "Normas técnicas, sanitarias, etiquetado, licencias o restricciones del país de destino para tu código.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "aranceles", task: "Aranceles y preferencias comerciales", verify: "Arancel aplicable a tu código completo y si existe un acuerdo UE–destino.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "origen", task: "Reglas de origen", verify: "Qué exige el acuerdo para que tu producto se considere originario y cómo se acredita.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "impuestos", task: "IVA y otros impuestos de importación", verify: "Impuestos y trámites aduaneros del país de destino, distintos del arancel.", sourceTitle: A2M.title, sourceUrl: A2M.url },
  { id: "competencia", task: "Competidores y precios comerciales", verify: "Quién abastece ese mercado, a qué precios de venta y con qué marcas o canales (el valor unitario estadístico no es un precio).", sourceTitle: ICEX.title, sourceUrl: ICEX.url },
  { id: "canales", task: "Distribuidores y compradores", verify: "Importadores, distribuidores o plataformas que podrían comprar tu producto.", sourceTitle: "Buscar empresas en Trade Map (requiere cuenta del ITC)", sourceUrl: TRADE_MAP.url },
  { id: "financiacion", task: "Cobro, seguro de crédito y financiación", verify: "Forma de cobro adecuada al riesgo del comprador y del país, seguro de crédito a la exportación y si alguna línea pública puede financiar la operación. SmarTrade no evalúa el riesgo de ningún comprador.", links: FINANCE_LINKS },
  { id: "transporte", task: "Transporte, seguro y plazos", verify: "Presupuestos reales de transporte y seguro, y el Incoterm de la oferta; SmarTrade no estima costes ni tiempos.", internalHref: "/logistica", internalTitle: "Guía de transporte e Incoterms" },
];
