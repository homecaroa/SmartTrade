import { MARKETS, ORIGIN } from "@/lib/config/catalog";
import { rawFetchJson, SourceError } from "./types";

/**
 * Aranceles de un país de destino para un código HS6, según la API Timeseries de la OMC («WTO Tariff and Trade Data»).
 * Solo informativo: no entra en los rankings. La clave (WTO_API_KEY) va en una cabecera, nunca en la URL.
 *
 * Sustituye a WITS (03/11/2026): el cortafuegos de Cloudflare de WITS bloqueaba el fetch de Node (403) y su API no daba
 * el preferencial para la UE. Comprobado en vivo con la API de la OMC el 03/11/2026:
 * - NMF a 6 dígitos: HS_A_0010 (media simple SOLO de las líneas ad valorem), HS_A_0040 (líneas nacionales) y
 *   HS_A_0050 (líneas no ad valorem: derechos por unidad). Vino en Japón, EE. UU., Reino Unido y Suiza: todas las líneas
 *   son por unidad y HS_A_0010 viene vacío (no 0). Calzado (640399) en Japón: media 28,5 % sobre 2 de 7 líneas.
 * - Preferencial: HS_P_0070 con socio España (724), «arancel preferencial más bajo». Aparece donde hay acuerdo
 *   (Canadá, Japón, Marruecos, Suiza, Noruega); calzado en Japón: 8,4 %. Para Reino Unido y México NO aparece aunque
 *   hay acuerdos UE: que falte no significa que no haya preferencia.
 * - Una sola indicador por petición; sin datos = 204 con cuerpo vacío. Emiratos Árabes Unidos no tiene datos; Marruecos
 *   llega a 2023 y el resto a 2025.
 * Condiciones (WTO Tariff and Trade Data): reproducir citando la fuente; descargas masivas o redistribución mediante
 * bases de datos requieren permiso (idb@wto.org). Por eso se consulta ficha a ficha, con caché, y no se guarda en
 * data/snapshots ni va en el CSV.
 */
/**
 * Códigos de economía de la OMC (numéricos ISO 3166), comprobados con /reporters el 03/11/2026. NO se reutiliza el
 * campo m49 del catálogo: es el de UN Comtrade, que usa códigos propios para EE. UU. (842), Suiza (757) y Noruega
 * (579); con ellos la OMC respondía 400 (visto en vivo). España es 724 en las dos.
 */
export const WTO_ECONOMY: Record<string, number> = { US: 840, GB: 826, CH: 756, NO: 578, JP: 392, MX: 484, CA: 124, MA: 504, AE: 784, ES: 724 };

export const WTO_SOURCE = "WTO Tariff and Trade Data (API Timeseries de la OMC)";
/** Años que se consultan: los datos de cada país se publican con distinto retraso; se toma el último disponible. */
export const WTO_YEARS_BACK = 4;
/**
 * Límite por consulta: la ficha espera a los aranceles, y la OMC a veces tarda más de 25 s (visto en vivo). Con 8 s,
 * si no responde, la ficha muestra «pendiente» sin hacer esperar. Decisión documentada, no estimada.
 */
export const WTO_TIMEOUT_MS = 8000;

export interface WtoMfn {
  year: number;
  /** Media simple de las líneas ad valorem, en %. null si todas las líneas son derechos por unidad. */
  average: number | null;
  lines: number;
  /** Líneas con derechos no ad valorem (por unidad, peso, volumen…): no entran en la media. */
  nonAdValoremLines: number;
}
export interface WtoPreference { year: number; average: number }
export interface WtoTariff { mfn: WtoMfn | null; preference: WtoPreference | null }

interface WtoRow { IndicatorCode?: string; Year?: number; Value?: number | null; PartnerEconomyCode?: string | null }

/** Filas de una respuesta de /data (o [] si no hay datos). */
export function wtoRows(json: unknown): WtoRow[] {
  const ds = (json as { Dataset?: unknown } | null)?.Dataset;
  return Array.isArray(ds) ? (ds as WtoRow[]) : [];
}

const lastYear = (rows: WtoRow[]) => rows.reduce<number | null>((m, r) => (typeof r.Year === "number" && (m === null || r.Year > m) ? r.Year : m), null);
const valueIn = (rows: WtoRow[], year: number) => {
  const v = rows.find((r) => r.Year === year)?.Value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** Combina las tres series NMF del último año con número de líneas. Sin líneas → null (ausente ≠ cero). */
export function combineMfn(avg: WtoRow[], lines: WtoRow[], nav: WtoRow[]): WtoMfn | null {
  const year = lastYear(lines);
  if (year === null) return null;
  const n = valueIn(lines, year);
  if (n === null || n <= 0) return null;
  const k = valueIn(nav, year) ?? 0;
  // Si todas las líneas son por unidad, la OMC no da media ad valorem: se deja en null aunque llegara un número.
  return { year, average: k >= n ? null : valueIn(avg, year), lines: n, nonAdValoremLines: k };
}

export function latestPreference(rows: WtoRow[]): WtoPreference | null {
  const year = lastYear(rows);
  if (year === null) return null;
  const v = valueIn(rows, year);
  return v === null ? null : { year, average: v };
}

export function wtoUrl(base: string, indicator: string, economy: number, hs6: string, fromYear: number, toYear: number, partner?: number): string {
  const p = partner === undefined ? "" : `&p=${partner}`;
  return `${base.replace(/\/$/, "")}/data?i=${indicator}&r=${economy}${p}&pc=${hs6}&ps=${fromYear}-${toYear}&fmt=json&mode=codes&lang=1`;
}

/**
 * Arancel NMF y preferencial para España del último año disponible. null si el mercado es de la UE o desconocido.
 * Lanza SourceError si la API responde con error (no si simplemente no hay datos).
 */
export async function fetchWtoTariff(base: string, key: string, marketCode: string, hs6: string, now = new Date()): Promise<WtoTariff | null> {
  const market = MARKETS.find((m) => m.code === marketCode);
  const code = WTO_ECONOMY[marketCode];
  if (!market || market.eu || code === undefined) return null;
  const to = now.getUTCFullYear();
  const from = to - WTO_YEARS_BACK;
  const get = async (indicator: string, partner?: number) => {
    const r = await rawFetchJson(wtoUrl(base, indicator, code, hs6, from, to, partner), { headers: { "Ocp-Apim-Subscription-Key": key } }, WTO_TIMEOUT_MS);
    if (r.status === 204 || r.status === 404) return [];
    if (r.status === 401 || r.status === 403) throw new SourceError("config", `La API de la OMC rechazó la clave (HTTP ${r.status})`, r.status);
    if (r.status < 200 || r.status >= 300) throw new SourceError("http", `La API de la OMC respondió con error HTTP ${r.status}`, r.status);
    return wtoRows(r.json);
  };
  const [avg, lines, nav, pref] = await Promise.all([get("HS_A_0010"), get("HS_A_0040"), get("HS_A_0050"), get("HS_P_0070", WTO_ECONOMY[ORIGIN.code])]);
  return { mfn: combineMfn(avg, lines, nav), preference: latestPreference(pref) };
}
