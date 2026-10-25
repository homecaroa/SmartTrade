import { z } from "zod";
import type { TradeObservation } from "@/lib/schemas/trade";
import { getConfig } from "@/lib/config";
import { MARKETS, ORIGIN } from "@/lib/config/catalog";
import { hsVersionForYear } from "@/lib/trade/normalize";
import { SourceError, safeFetchJson, type SourceQuery, type SourceResult, type SupplierQuery, type TradeSource } from "./types";

/**
 * Adaptador UN Comtrade (OPCIONAL: la app funciona sin él). Requiere COMTRADE_API_KEY.
 * CONFIRMADO en la documentación oficial: endpoint `data/v1/get/C/A/HS` con `cmdCode, period, reporterCode,
 * partnerCode, flowCode, maxrecords`; la clave gratuita permite `get` para "pequeñas cantidades de datos"; existe una
 * API de vista previa sin clave (`public/v1/preview/...`, muy limitada) que usa `npm run verify:comtrade`.
 * NO CONFIRMADO: nombres exactos de campos de respuesta, límite de registros de la clave gratuita y envío de la clave
 * por cabecera (la documentación muestra el parámetro `subscription-key` en la URL; con COMTRADE_KEY_IN_QUERY=true se usa).
 * Valores en USD: nunca se mezclan con EUR. Solo se aceptan filas cuyo ISO3 coincide con el país solicitado.
 */
export const COMTRADE_LABEL = "UN Comtrade";
const BASE = "https://comtradeapi.un.org/data/v1/get/C/A/HS";

const rowSchema = z.object({
  period: z.union([z.string(), z.number()]),
  reporterISO: z.string().nullish(),
  partnerISO: z.string().nullish(),
  partnerCode: z.number().nullish(),
  reporterCode: z.number().nullish(),
  partnerDesc: z.string().nullish(),
  // Desgloses: la API devuelve por defecto una fila por segundo socio / régimen aduanero / modo de transporte
  partner2Code: z.number().nullish(),
  customsCode: z.string().nullish(),
  motCode: z.number().nullish(),
  cmdCode: z.string(),
  cmdDesc: z.string().nullish(),
  flowCode: z.string(),
  classificationCode: z.string().nullish(),
  primaryValue: z.number().nullable().optional(),
  netWgt: z.number().nullable().optional(),
  qty: z.number().nullable().optional(),
  qtyUnitAbbr: z.string().nullish(),
});
const responseSchema = z.object({ data: z.array(rowSchema), error: z.string().nullish() });

const iso3ToIso2 = new Map([...MARKETS.map((m) => [m.iso3, m.code] as const), [ORIGIN.iso3, ORIGIN.code]]);
// Verificado con la API real: reporterISO/partnerISO pueden llegar a null, así que se mapea primero por el código numérico.
const m49ToIso2 = new Map([...MARKETS.map((m) => [m.m49, m.code] as const), [ORIGIN.m49, ORIGIN.code]]);

export function comtradeToObservations(raw: unknown, retrievedAt: string, allowedReporters: Set<string>): TradeObservation[] {
  const p = responseSchema.safeParse(raw);
  if (!p.success) throw new SourceError("parse", "La respuesta de Comtrade no tiene el formato esperado");
  if (p.data.error) throw new SourceError("http", "Comtrade devolvió un error");
  const out: TradeObservation[] = [];
  for (const r of p.data.data) {
    // Solo totales: se descartan los desgloses (segundo socio, régimen aduanero, transporte) para no duplicar valores
    if ((r.partner2Code ?? 0) !== 0 || (r.customsCode ?? "C00") !== "C00" || (r.motCode ?? 0) !== 0) continue;
    const reporter = (r.reporterCode != null ? m49ToIso2.get(r.reporterCode) : undefined) ?? (r.reporterISO ? iso3ToIso2.get(r.reporterISO) : undefined);
    if (!reporter || !allowedReporters.has(reporter)) continue;
    const isWorld = r.partnerCode === 0 || r.partnerISO === "W00";
    let partner: string | undefined;
    let partnerName: string | null = null;
    if (isWorld) partner = "WORLD";
    else {
      partner = (r.partnerCode != null ? m49ToIso2.get(r.partnerCode) : undefined) ?? (r.partnerISO ? iso3ToIso2.get(r.partnerISO) : undefined);
      if (!partner && r.partnerCode != null) { partner = `M49-${r.partnerCode}`; partnerName = r.partnerDesc ?? null; }
    }
    if (!partner || !/^\d{6}$/.test(r.cmdCode) || (r.flowCode !== "M" && r.flowCode !== "X")) continue;
    if (r.primaryValue === null || r.primaryValue === undefined) continue; // ausente ≠ 0
    const year = Number(r.period);
    out.push({
      period: String(year), reporterCode: reporter, partnerCode: partner, partnerName, productCode: r.cmdCode,
      productName: r.cmdDesc ?? null, productClassification: r.classificationCode ?? hsVersionForYear(year),
      flow: r.flowCode === "M" ? "import" : "export", tradeValue: r.primaryValue, currency: "USD",
      netWeight: r.netWgt ?? null, quantity: r.qty ?? null, quantityUnit: r.qtyUnitAbbr ?? null,
      source: COMTRADE_LABEL, retrievedAt, status: "observed", synthetic: false,
    });
  }
  return out;
}

/** Tamaño máximo por llamada (registros). Si una respuesta lo alcanza se considera truncada y se rechaza. */
export const COMTRADE_MAX_RECORDS = 500;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Reporteros por llamada para que (reporteros × productos × socios × años) no supere el máximo de registros. */
export function reportersPerCall(products: number, partners: number, years: number): number {
  return Math.max(1, Math.floor((COMTRADE_MAX_RECORDS - 1) / Math.max(1, products * partners * years)));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// Límites observados en la clave gratuita: 1 llamada por segundo (HTTP 429 si se supera) y un cupo de operaciones (cabecera x-ratelimit-operation-limit: 60).
const minGapMs = () => Number(process.env.COMTRADE_MIN_GAP_MS ?? 1100);
const backoffMs = () => Number(process.env.COMTRADE_BACKOFF_MS ?? 1500);
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/** Ejecuta las llamadas de una en una, separadas por el intervalo mínimo. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + minGapMs() - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await fn(); } finally { lastCallAt = Date.now(); }
  });
  chain = run.catch(() => undefined);
  return run;
}

async function call(params: Record<string, string>): Promise<unknown> {
  const key = getConfig().comtradeKey;
  if (!key) throw new SourceError("config", "UN Comtrade requiere COMTRADE_API_KEY (variable de entorno del servidor). Consulta docs/data-sources.md.");
  const u = new URL(BASE);
  // Verificado con la API real: sin estas restricciones una consulta de 1 país/1 producto/1 año devuelve 500+ filas de desglose
  for (const [k, v] of Object.entries({ partner2Code: "0", customsCode: "C00", motCode: "0", ...params })) u.searchParams.set(k, v);
  u.searchParams.set("includeDesc", "true");
  u.searchParams.set("maxrecords", String(COMTRADE_MAX_RECORDS));
  const inQuery = process.env.COMTRADE_KEY_IN_QUERY === "true";
  if (inQuery) u.searchParams.set("subscription-key", key);
  let raw: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await throttled(() => safeFetchJson(u.toString(), inQuery ? {} : { headers: { "Ocp-Apim-Subscription-Key": key } }));
      break;
    } catch (e) {
      if (e instanceof SourceError && e.kind === "rate_limit" && attempt < 2) { await sleep(backoffMs() * (attempt + 1)); continue; }
      throw e;
    }
  }
  const n = (raw as { data?: unknown[] } | null)?.data?.length ?? 0;
  if (n >= COMTRADE_MAX_RECORDS) {
    throw new SourceError("too_large", `Comtrade devolvió ${n} registros (límite por llamada ${COMTRADE_MAX_RECORDS}): resultado posiblemente truncado. Reduce los productos o años.`);
  }
  return raw;
}

const m49 = (iso2: string) => MARKETS.find((m) => m.code === iso2)!.m49;

export const comtradeSource: TradeSource = {
  mode: "comtrade",
  label: COMTRADE_LABEL,
  async fetchData(q: SourceQuery): Promise<SourceResult> {
    if (!q.productCodes?.length) throw new SourceError("config", "En modo Comtrade introduce uno o más códigos HS de 6 dígitos.");
    const period = q.years.join(",");
    const cmdCode = q.productCodes.join(",");
    const size = reportersPerCall(q.productCodes.length, 2, q.years.length);
    const retrievedAt = new Date().toISOString();
    const observations: TradeObservation[] = [];
    for (const group of chunk(q.markets, size)) {
      const raw = await call({ reporterCode: group.map(m49).join(","), partnerCode: `0,${ORIGIN.m49}`, cmdCode, flowCode: "M", period });
      observations.push(...comtradeToObservations(raw, retrievedAt, new Set(group)));
    }
    const exp = await call({ reporterCode: String(ORIGIN.m49), partnerCode: "0", cmdCode, flowCode: "X", period });
    observations.push(...comtradeToObservations(exp, retrievedAt, new Set([ORIGIN.code])));
    return { observations, retrievedAt, sourceLabel: COMTRADE_LABEL, synthetic: false, warnings: ["Valores en USD (UN Comtrade)."] };
  },
  async fetchSuppliers(q: SupplierQuery): Promise<TradeObservation[]> {
    const raw = await call({ reporterCode: String(m49(q.market)), cmdCode: q.productCode, flowCode: "M", period: q.years.join(",") });
    const all = new Set(MARKETS.map((m) => m.code));
    return comtradeToObservations(raw, new Date().toISOString(), all).filter((o) => o.partnerCode !== "WORLD" && o.reporterCode === q.market);
  },
};
