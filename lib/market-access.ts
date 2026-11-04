import { MARKETS, ORIGIN } from "@/lib/config/catalog";
import { WTO_SOURCE, type WtoTariff } from "@/lib/sources/wto";

/**
 * Módulo INFORMATIVO de acceso al mercado. No altera los rankings y no consulta ninguna API por sí mismo: recibe, si
 * lo hay, el arancel que el servicio obtiene de la API de la OMC (lib/sources/wto.ts) para mercados fuera de la UE.
 * Hasta el 03/11/2026 ningún arancel se consultaba de forma automática. Aun así nada se marca como «verificado»: son
 * medias a 6 dígitos (el tipo real depende del código nacional completo) y el preferencial exige cumplir el origen.
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
  /** Fecha de la consulta automática del arancel (API de la OMC), si la hubo; null si no se consultó nada. */
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

/** Resultado de la consulta del arancel: el dato (o null si la OMC no lo tiene), o el error si la consulta falló. */
export interface TariffLookup { tariff: WtoTariff | null; checkedAt: string; error?: string }

const pct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

/**
 * Texto del arancel. Reglas (comprobadas con datos reales, ver lib/sources/wto.ts):
 * - Si todas las líneas son derechos por unidad, no hay porcentaje: se dice así, nunca «0 %».
 * - Si solo parte de las líneas es ad valorem, la media se presenta como «sobre N de M líneas».
 * - Que la OMC no publique un preferencial para España NO significa que no haya acuerdo (Reino Unido, México).
 */
export function tariffItem(t: TariffLookup, marketName: string): AccessItem {
  const base = { topic: "arancel" as const, label: "Aranceles de importación" };
  const checkOrigin = `Compruébalo en Access2Markets con el código completo: el tipo real depende del código nacional y, el preferencial, de cumplir las reglas de origen.`;
  if (t.error) return { ...base, value: null, status: "pending", source: `${WTO_SOURCE}: la consulta falló`, note: `${t.error}. ${checkOrigin}` };
  const m = t.tariff?.mfn ?? null;
  const p = t.tariff?.preference ?? null;
  if (!m && !p) return { ...base, value: null, status: "unavailable", source: `${WTO_SOURCE}: sin datos de ${marketName} para este producto`, note: checkOrigin };
  const parts: string[] = [];
  if (m) {
    const adv = m.lines - m.nonAdValoremLines;
    if (m.average === null) parts.push(`Arancel general (NMF): derechos por unidad (por ejemplo, por litro o por kilo) en ${m.lines === 1 ? "su única línea" : `sus ${m.lines} líneas`}; no se puede expresar en %. Año ${m.year}.`);
    else {
      const rest = m.nonAdValoremLines === 1 ? "la otra es un derecho por unidad y no entra en la media" : `las otras ${m.nonAdValoremLines} son derechos por unidad y no entran en la media`;
      parts.push(`Arancel general (NMF) medio: ${pct(m.average)}${m.nonAdValoremLines ? `, sobre ${adv} de ${m.lines} líneas (${rest})` : ` (${m.lines} línea${m.lines === 1 ? "" : "s"})`}. Año ${m.year}.`);
    }
  } else parts.push("Arancel general (NMF): sin datos en la OMC.");
  parts.push(p
    ? `Preferencial para productos españoles: ${pct(p.average)} (año ${p.year}), si cumplen las reglas de origen del acuerdo UE–${marketName}.`
    : `Preferencial para productos españoles: la OMC no publica un tipo para este producto; puede existir igualmente un acuerdo UE–${marketName}.`);
  const years = [m?.year, p?.year].filter((y): y is number => typeof y === "number");
  return { ...base, value: parts.join(" "), status: "partial", source: `${WTO_SOURCE}, año ${Math.max(...years)}`, note: `Medias simples a 6 dígitos de las líneas arancelarias nacionales. ${checkOrigin}` };
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
        : "Fuera de la UE, SmarTrade consulta solo los aranceles a 6 dígitos en la API de la OMC (general y preferencial para España); origen, impuestos y requisitos no se consultan. Nada de esta sección está verificado para tu producto.",
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
