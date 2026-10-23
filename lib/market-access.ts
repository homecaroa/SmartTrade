import { MARKETS, ORIGIN } from "@/lib/config/catalog";

/**
 * Módulo INFORMATIVO de acceso al mercado. No altera la puntuación y no consulta ninguna API:
 * ninguna fuente de aranceles ha sido verificada como consultable de forma automática, por lo que
 * ningún dato se marca como «verificado». El tipo lo admite para futuros adaptadores.
 */
export type Verification = "verified" | "partial" | "pending" | "unavailable";
export type AccessTopic = "arancel" | "origen" | "impuestos" | "requisitos" | "logistica";

export interface AccessItem {
  topic: AccessTopic;
  label: string;
  /** null = sin dato: se muestra «No disponible» o «Pendiente de consulta», nunca cero. */
  value: string | null;
  status: Verification;
  source: string;
  note?: string;
}

export interface AccessLink { title: string; url: string; purpose: string }

export interface MarketAccessInfo {
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  hs6: string;
  scope: "eu" | "third" | "unknown";
  demo: boolean;
  /** Sin consulta automática: no hay fecha de consulta ni periodo de validez. */
  checkedAt: null;
  validity: null;
  items: AccessItem[];
  links: AccessLink[];
  howTo: string[];
  limitations: string[];
}

/** Únicas URLs usadas: las dos fuentes oficiales ya recogidas en la especificación del proyecto. */
export const ACCESS_LINKS: AccessLink[] = [
  { title: "Access2Markets (Comisión Europea)", url: "https://trade.ec.europa.eu/access-to-markets/es/home", purpose: "Aranceles, reglas de origen, requisitos de producto, impuestos y trámites de importación del país de destino." },
  { title: "ICEX · estadísticas y mercados", url: "https://www.icex.es/es/estadisticas", purpose: "Información comercial complementaria del mercado." },
];

const GENERAL_EU = "Regla general de la UE (no es una consulta del producto concreto)";
const NOT_QUERIED = "Sin consulta automática: consultar la fuente oficial";

export function buildMarketAccess(input: { marketCode: string; marketName: string; productCode: string; synthetic: boolean }): MarketAccessInfo {
  const market = MARKETS.find((m) => m.code === input.marketCode);
  const scope: MarketAccessInfo["scope"] = !market ? "unknown" : market.eu ? "eu" : "third";
  const eu = scope === "eu";

  const items: AccessItem[] = [
    eu
      ? { topic: "arancel", label: "Aranceles de importación", value: "No se aplican aranceles aduaneros a mercancías en libre circulación dentro de la UE.", status: "partial", source: GENERAL_EU, note: "Regla general del mercado único; no se ha comprobado el producto concreto." }
      : { topic: "arancel", label: "Aranceles de importación", value: null, status: "pending", source: NOT_QUERIED, note: "Depende del código arancelario completo, del origen y de si existe un acuerdo comercial UE–destino." },
    eu
      ? { topic: "origen", label: "Origen preferencial", value: "No aplica entre Estados miembros de la UE.", status: "partial", source: GENERAL_EU }
      : { topic: "origen", label: "Origen preferencial", value: null, status: "pending", source: NOT_QUERIED, note: "Si hay acuerdo, la preferencia exige cumplir las reglas de origen del producto." },
    eu
      ? { topic: "impuestos", label: "IVA e impuestos especiales", value: "Puede aplicarse el IVA y, según el producto (p. ej. alcohol), impuestos especiales del Estado miembro de destino.", status: "partial", source: GENERAL_EU, note: "Los tipos y las condiciones varían por país y producto: confirmar." }
      : { topic: "impuestos", label: "IVA e impuestos de importación", value: null, status: "pending", source: NOT_QUERIED, note: "Son distintos de los aranceles y se calculan según la normativa del país de destino." },
    { topic: "requisitos", label: "Requisitos de importación y documentación", value: null, status: "pending", source: NOT_QUERIED, note: "Normas técnicas, sanitarias, etiquetado, licencias o restricciones según el producto." },
    { topic: "logistica", label: "Costes logísticos (transporte, seguro, almacenaje)", value: null, status: "unavailable", source: "No incluido en SmarTrade", note: "No son requisitos de acceso ni aranceles: se estiman aparte con presupuestos reales." },
  ];

  return {
    originCode: ORIGIN.code,
    originName: ORIGIN.name,
    destinationCode: input.marketCode,
    destinationName: input.marketName,
    hs6: input.productCode,
    scope,
    demo: input.synthetic,
    checkedAt: null,
    validity: null,
    items,
    links: ACCESS_LINKS,
    howTo: [
      "Abre Access2Markets e indica el producto: SmarTrade usa los 6 primeros dígitos del código; la herramienta puede pedirte más dígitos.",
      `Selecciona origen ${ORIGIN.name} y destino ${input.marketName}.`,
      "Revisa por separado aranceles, reglas de origen, impuestos y requisitos del producto, y anota la fecha de consulta.",
      "Confirma el código arancelario completo con tu agente de aduanas o transitario.",
    ],
    limitations: [
      "SmarTrade no consulta aranceles ni requisitos de forma automática: ningún dato de esta sección está verificado para tu producto.",
      "Un arancel general no es necesariamente el aplicable: depende del código completo, el origen, las preferencias y las condiciones del momento.",
      ...(scope === "unknown" ? ["El mercado no está clasificado en el catálogo: todo queda pendiente de consulta."] : []),
      "Esta sección no influye en la puntuación de la oportunidad.",
    ],
  };
}

export const STATUS_LABEL: Record<Verification, string> = {
  verified: "Verificado",
  partial: "Parcial (regla general)",
  pending: "Pendiente de consulta",
  unavailable: "No disponible",
};
