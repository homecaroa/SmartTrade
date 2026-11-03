import { MARKETS, ORIGIN } from "@/lib/config/catalog";
import { WITS_SOURCE, type WitsTariff } from "@/lib/sources/wits";

/**
 * Módulo INFORMATIVO de acceso al mercado. No altera los rankings y no consulta ninguna API por sí mismo: recibe, si
 * lo hay, el arancel NMF que el servicio obtiene de WITS (lib/sources/wits.ts) para mercados fuera de la UE. Hasta el
 * 03/11/2026 ningún arancel se consultaba de forma automática. Aun así nada se marca como «verificado»: el dato de WITS
 * es el arancel general (no el preferencial que puede corresponder a un producto español) y lleva retraso.
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
  /** Fecha de la consulta automática del arancel (WITS), si la hubo; null si no se consultó nada. */
  checkedAt: string | null;
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
  // Solo enlace (decisión del 03/11/2026): sus empresas vienen de Kompass y Dun & Bradstreet con licencia, no hay API
  // abierta y la extracción automatizada no está permitida, así que SmarTrade no copia nada; la consulta la hace el usuario.
  { title: "Trade Map (ITC) · empresas importadoras y exportadoras", url: "https://www.trademap.org/", purpose: "Directorio de empresas por producto y país (fuentes: Kompass y Dun & Bradstreet; cobertura parcial, sin valores ni destinos por empresa). Requiere cuenta del ITC; el módulo de empresas puede exigir suscripción." },
];
export const TRADE_MAP = ACCESS_LINKS[2];

const GENERAL_EU = "Regla general de la UE (no es una consulta del producto concreto)";
const NOT_QUERIED = "Sin consulta automática: consultar la fuente oficial";

/** Resultado de la consulta del arancel NMF: el dato (o null si WITS no lo tiene), o el error si la consulta falló. */
export interface TariffLookup { tariff: WitsTariff | null; checkedAt: string; error?: string; yearsTried: [number, number] }

const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

/** Texto del arancel NMF. El preferencial (acuerdo UE–destino) no está en la API: se avisa siempre. */
export function tariffItem(t: TariffLookup, marketName: string): AccessItem {
  const pref = `Es el arancel GENERAL (nación más favorecida). Si hay acuerdo comercial UE–${marketName}, un producto de origen español que cumpla las reglas de origen puede pagar menos: compruébalo en Access2Markets.`;
  if (t.error) return { topic: "arancel", label: "Aranceles de importación", value: null, status: "pending", source: `${WITS_SOURCE}: la consulta falló`, note: `${t.error}. ${pref}` };
  if (!t.tariff) return { topic: "arancel", label: "Aranceles de importación", value: null, status: "unavailable", source: `${WITS_SOURCE}: sin datos para este producto entre ${t.yearsTried[1]} y ${t.yearsTried[0]}`, note: pref };
  const a = t.tariff;
  const range = a.min !== null && a.max !== null && a.min !== a.max ? ` (entre ${pct(a.min)} y ${pct(a.max)})` : "";
  const na = a.naLines > 0 ? ` ${a.naLines} línea(s) sin equivalente calculable no entran en la media.` : "";
  return {
    topic: "arancel", label: "Aranceles de importación",
    value: `Arancel general medio: ${pct(a.average)}${range}, año ${a.year}.`,
    status: "partial",
    source: `${WITS_SOURCE}, año ${a.year}`,
    note: `Media simple de ${a.lines} línea(s) arancelaria(s) nacional(es) del código HS6, como equivalente ad valorem estimado (incluye derechos por unidad convertidos a %).${na} ${pref}`,
  };
}

export function buildMarketAccess(input: { marketCode: string; marketName: string; productCode: string; synthetic: boolean; tariff?: TariffLookup }): MarketAccessInfo {
  const market = MARKETS.find((m) => m.code === input.marketCode);
  const scope: MarketAccessInfo["scope"] = !market ? "unknown" : market.eu ? "eu" : "third";
  const eu = scope === "eu";

  const items: AccessItem[] = [
    eu
      ? { topic: "arancel", label: "Aranceles de importación", value: "No se aplican aranceles aduaneros a mercancías en libre circulación dentro de la UE.", status: "partial", source: GENERAL_EU, note: "Regla general del mercado único; no se ha comprobado el producto concreto." }
      : input.tariff && !input.synthetic
        ? tariffItem(input.tariff, input.marketName)
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
    checkedAt: input.tariff && !input.synthetic && !eu ? input.tariff.checkedAt : null,
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
      eu || !input.tariff || input.synthetic
        ? "SmarTrade no consulta aranceles ni requisitos de forma automática para este mercado: ningún dato de esta sección está verificado para tu producto."
        : "Fuera de la UE, SmarTrade consulta solo el arancel general (NMF) a 6 dígitos en WITS; origen, impuestos y requisitos no se consultan. Nada de esta sección está verificado para tu producto.",
      "Un arancel general no es necesariamente el aplicable: depende del código completo, el origen, las preferencias y las condiciones del momento.",
      ...(scope === "unknown" ? ["El mercado no está clasificado en el catálogo: todo queda pendiente de consulta."] : []),
      "Esta sección no influye en los rankings de la oportunidad.",
    ],
  };
}

export const STATUS_LABEL: Record<Verification, string> = {
  verified: "Verificado",
  partial: "Parcial (regla general)",
  pending: "Pendiente de consulta",
  unavailable: "No disponible",
};
