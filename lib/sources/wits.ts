import { MARKETS } from "@/lib/config/catalog";
import { rawFetchJson, SourceError } from "./types";

/**
 * Arancel GENERAL (NMF, nación más favorecida) que aplica un país de destino a un código HS6, según UNCTAD TRAINS
 * servido por la API de WITS (Banco Mundial). Solo informativo: no entra en los rankings.
 *
 * Comprobado en vivo el 03/11/2026:
 * - Se usa `aveestimated` (equivalentes ad valorem estimados), NO `reported`: con derechos específicos (p. ej. yenes por
 *   litro) `reported` devuelve 0 % y marca las líneas como «sin dato» (Japón, vino 220421, 2023: reported 0 % con 2 de 2
 *   líneas sin dato; aveestimated 14,85 %). Mostrar el 0 sería un arancel falso.
 * - Solo hay socio «mundo» (000 = arancel NMF). El preferencial para la UE (918), España (724) o «EUN» devuelve 404:
 *   la API no lo ofrece, así que se avisa de que con un acuerdo UE–país puede ser menor.
 * - Los datos llevan unos dos años de retraso (Japón: 2023 sí, 2024 no). Se prueba el año final y hasta dos anteriores.
 * - Un año sin datos responde 404 con el cuerpo «NoRecordsFound» (no JSON): eso es «sin dato», no un error ni un 0.
 * - Puede tardar mucho (una consulta agotó 60 s): se usa el límite general de 25 s y la ficha no depende de la respuesta.
 * Licencia: acceso «gratuito e ilimitado» según WITS; remite a la política de difusión de UNCTAD TRAINS, que no se ha
 * podido leer. Por eso solo se consulta y se muestra con su fuente; no se guarda en data/snapshots ni va en el CSV.
 */
export interface WitsTariff {
  year: number;
  /** Media simple de las líneas arancelarias nacionales del HS6, en %. */
  average: number;
  min: number | null;
  max: number | null;
  lines: number;
  /** Líneas sin equivalente ad valorem calculable (no entran en la media). */
  naLines: number;
  tariffType: string;
}

export const WITS_SOURCE = "UNCTAD TRAINS vía WITS (Banco Mundial)";
export const WITS_YEARS_BACK = 2;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

interface SdmxAttr { id: string; values?: { id: string }[] }
interface SdmxJson {
  dataSets?: { series?: Record<string, { observations?: Record<string, unknown[]> }> }[];
  structure?: { attributes?: { observation?: SdmxAttr[] } };
}

/**
 * Lee una respuesta SDMX-JSON de WITS para un único país, socio y producto. Devuelve null si no hay observación o si
 * ninguna línea tiene equivalente ad valorem (ausente ≠ cero).
 */
export function parseWitsTariff(json: unknown, year: number): WitsTariff | null {
  const j = json as SdmxJson;
  const attrs = j?.structure?.attributes?.observation ?? [];
  const series = Object.values(j?.dataSets?.[0]?.series ?? {});
  const obs = series.length ? Object.values(series[0].observations ?? {})[0] : undefined;
  if (!Array.isArray(obs)) return null;
  const attr = (id: string): unknown => {
    const i = attrs.findIndex((a) => a.id === id);
    if (i < 0) return null;
    const raw = obs[i + 1];
    const vals = attrs[i].values;
    return typeof raw === "number" && vals && vals[raw] ? vals[raw].id : raw;
  };
  const average = num(obs[0]);
  const lines = num(attr("TOTALNOOFLINES")) ?? 0;
  const naLines = num(attr("NBR_NA_LINES")) ?? 0;
  if (average === null || lines <= 0 || naLines >= lines) return null;
  return { year, average, min: num(attr("MIN_RATE")), max: num(attr("MAX_RATE")), lines, naLines, tariffType: String(attr("TARIFFTYPE") ?? "MFN") };
}

export function witsUrl(base: string, m49: number, hs6: string, year: number): string {
  return `${base.replace(/\/$/, "")}/datasource/TRN/reporter/${m49}/partner/000/product/${hs6}/year/${year}/datatype/aveestimated?format=JSON`;
}

/** Último arancel NMF disponible entre `endYear` y `endYear − WITS_YEARS_BACK`; null si no hay ninguno. */
export async function fetchWitsTariff(base: string, marketCode: string, hs6: string, endYear: number): Promise<WitsTariff | null> {
  const market = MARKETS.find((m) => m.code === marketCode);
  if (!market || market.eu) return null;
  for (let y = endYear; y >= endYear - WITS_YEARS_BACK; y--) {
    const r = await rawFetchJson(witsUrl(base, market.m49, hs6, y));
    if (r.status === 404) continue;
    if (r.status < 200 || r.status >= 300) throw new SourceError("http", `WITS respondió con error HTTP ${r.status}`, r.status);
    const t = parseWitsTariff(r.json, y);
    if (t) return t;
  }
  return null;
}
