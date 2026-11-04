import { MARKETS } from "@/lib/config/catalog";
import { iterateCells, parseJsonStat } from "./jsonstat";
import { rawFetchJson, SourceError } from "./types";

/**
 * Contexto económico del país de destino (crecimiento del PIB real, PIB por habitante y población). Solo informativo:
 * no entra en los rankings. Decisión del dueño (04/11/2026): Eurostat para la UE y la OCDE fuera de ella.
 *
 * Comprobado en vivo el 04/11/2026:
 * - El Banco Mundial (y WITS) responden 403 de Cloudflare al fetch de Node; el FMI fue intermitente. Eurostat y la API
 *   SDMX de la OCDE (sdmx.oecd.org, no su web) responden al fetch de Node.
 * - Eurostat: en las cuentas nacionales Grecia es «EL»; con «GR» la respuesta llega VACÍA y sin error. Los últimos años
 *   vienen marcados «p» (provisional).
 * - OCDE: Economic Outlook (OECD.ECO.MAD, DSD_EO@DF_EO) sin versión = última edición (hoy la 119). En CSV responde; en
 *   SDMX-JSON con cabecera de versión daba 500; también con `Accept: text/csv`: se pide con `Accept: *\/*`. Incluye previsiones: los años desde el actual son «previsión OCDE».
 *   Marruecos y Emiratos no son miembros: no hay datos (no se consulta).
 * - Unidades distintas: PIB por habitante en EUR corrientes (Eurostat) o en USD a paridad de poder adquisitivo
 *   constante (OCDE). No se mezclan ni se convierten; cada cifra lleva su unidad.
 * Condiciones: Eurostat permite reutilizar citando la fuente; la OCDE permite usar sus datos para cualquier fin citándola.
 */
export interface ContextValue { year: number; value: number; provisional?: boolean }
export interface CountryContext {
  source: "eurostat" | "oecd";
  growth: ContextValue | null;
  /** Previsiones de crecimiento (solo OCDE): años a partir del actual. */
  growthForecasts: ContextValue[];
  gdpPerCapita: (ContextValue & { unit: "EUR" | "USD_PPA" }) | null;
  population: ContextValue | null;
}

export const EUROSTAT_SOURCE = "Eurostat (cuentas nacionales y población)";
export const OECD_SOURCE = "OCDE, Economic Outlook";
export const CONTEXT_TIMEOUT_MS = 8000;

/** Miembros de la OCDE entre los mercados de fuera de la UE del catálogo (Marruecos y Emiratos no lo son). */
export const OECD_NON_EU: Record<string, string> = { US: "USA", GB: "GBR", CH: "CHE", NO: "NOR", JP: "JPN", MX: "MEX", CA: "CAN" };
/** Código de Eurostat para las cuentas nacionales cuando difiere del ISO2 del catálogo. */
const EUROSTAT_GEO: Record<string, string> = { GR: "EL" };

const latest = (vals: ContextValue[]) => vals.reduce<ContextValue | null>((m, v) => (m === null || v.year > m.year ? v : m), null);

/** Valores por año de una respuesta JSON-stat de Eurostat (un país, un indicador). */
export function eurostatValues(raw: unknown): ContextValue[] {
  const out: ContextValue[] = [];
  for (const c of iterateCells(parseJsonStat(raw))) {
    const year = Number(c.coords.time);
    if (Number.isFinite(year)) out.push({ year, value: c.value, ...(c.status === "p" ? { provisional: true } : {}) });
  }
  return out;
}

/** Filas del CSV de la OCDE (formato «csvfile»): medida, año y valor. Las celdas vacías se ignoran (ausente ≠ cero). */
export function oecdRows(csv: string): { measure: string; year: number; value: number }[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(",");
  const iM = cols.indexOf("MEASURE"), iT = cols.indexOf("TIME_PERIOD"), iV = cols.indexOf("OBS_VALUE");
  if (iM < 0 || iT < 0 || iV < 0) throw new SourceError("parse", "La OCDE devolvió un CSV sin las columnas esperadas");
  return lines.map((l) => l.split(",")).filter((c) => c[iV] !== "" && c[iV] !== undefined)
    .map((c) => ({ measure: c[iM], year: Number(c[iT]), value: Number(c[iV]) }))
    .filter((r) => Number.isFinite(r.year) && Number.isFinite(r.value));
}

/** Contexto a partir de las filas de la OCDE: lo observado es anterior al año actual; desde el actual, previsión. */
export function oecdContext(rows: ReturnType<typeof oecdRows>, now = new Date()): CountryContext | null {
  const current = now.getUTCFullYear();
  const of = (m: string) => rows.filter((r) => r.measure === m).map((r) => ({ year: r.year, value: r.value }));
  const observed = (m: string) => latest(of(m).filter((v) => v.year < current));
  const growth = observed("GDPV_ANNPCT");
  const pc = observed("GDPVD_CAP");
  const ctx: CountryContext = {
    source: "oecd", growth,
    growthForecasts: of("GDPV_ANNPCT").filter((v) => v.year >= current).sort((a, b) => a.year - b.year),
    gdpPerCapita: pc ? { ...pc, unit: "USD_PPA" } : null,
    population: observed("POP"),
  };
  return ctx.growth || ctx.gdpPerCapita || ctx.population || ctx.growthForecasts.length ? ctx : null;
}

async function getJson(url: string): Promise<unknown | null> {
  const r = await rawFetchJson(url, {}, CONTEXT_TIMEOUT_MS);
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300) throw new SourceError("http", `La fuente respondió con error HTTP ${r.status}`, r.status);
  return r.json;
}

export async function fetchEurostatContext(base: string, marketCode: string): Promise<CountryContext | null> {
  const geo = EUROSTAT_GEO[marketCode] ?? marketCode;
  const b = base.replace(/\/$/, "");
  const [g, pc, pop] = await Promise.all([
    getJson(`${b}/nama_10_gdp?format=JSON&lang=EN&geo=${geo}&na_item=B1GQ&unit=CLV_PCH_PRE&lastTimePeriod=3`),
    getJson(`${b}/nama_10_pc?format=JSON&lang=EN&geo=${geo}&na_item=B1GQ&unit=CP_EUR_HAB&lastTimePeriod=2`),
    getJson(`${b}/demo_pjan?format=JSON&lang=EN&geo=${geo}&age=TOTAL&sex=T&lastTimePeriod=2`),
  ]);
  const growth = g ? latest(eurostatValues(g)) : null;
  const perCap = pc ? latest(eurostatValues(pc)) : null;
  const population = pop ? latest(eurostatValues(pop)) : null;
  if (!growth && !perCap && !population) return null;
  return { source: "eurostat", growth, growthForecasts: [], gdpPerCapita: perCap ? { ...perCap, unit: "EUR" } : null, population };
}

export async function fetchOecdContext(base: string, marketCode: string, now = new Date()): Promise<CountryContext | null> {
  const iso3 = OECD_NON_EU[marketCode];
  if (!iso3) return null;
  const url = `${base.replace(/\/$/, "")}/data/OECD.ECO.MAD,DSD_EO@DF_EO/${iso3}.POP+GDPVD_CAP+GDPV_ANNPCT.A?startPeriod=${now.getUTCFullYear() - 3}&format=csvfile`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONTEXT_TIMEOUT_MS);
  let res: Response;
  try {
    // Cabeceras comprobadas en vivo (04/11/2026): la OCDE responde 500 con `Accept: text/csv` (o SDMX-CSV) y también con
    // el `Accept-Language: *` que Node envía por defecto; con `Accept: */*` y `Accept-Language: en` responde. El formato va
    // en la URL. (Desde curl no se veía porque curl no envía Accept-Language.)
    res = await fetch(url, { headers: { accept: "*/*", "accept-language": "en", "user-agent": "SmarTrade/0.1 (proyecto académico de comercio internacional)" }, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    throw new SourceError("network", e instanceof Error && e.name === "AbortError" ? "La fuente no respondió a tiempo" : "No se pudo contactar con la fuente");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new SourceError("http", `La OCDE respondió con error HTTP ${res.status}`, res.status);
  return oecdContext(oecdRows(await res.text()), now);
}

/** Contexto del país según dónde esté: Eurostat (UE), OCDE (miembros fuera de la UE) o null (sin fuente). */
export async function fetchCountryContext(bases: { eurostat: string; oecd: string }, marketCode: string, now = new Date()): Promise<CountryContext | null> {
  const market = MARKETS.find((m) => m.code === marketCode);
  if (!market) return null;
  return market.eu ? fetchEurostatContext(bases.eurostat, marketCode) : fetchOecdContext(bases.oecd, marketCode, now);
}
