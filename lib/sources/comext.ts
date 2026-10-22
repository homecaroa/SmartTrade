import type { TradeObservation } from "@/lib/schemas/trade";
import { getConfig } from "@/lib/config";
import { MARKETS } from "@/lib/config/catalog";
import { hsVersionForYear } from "@/lib/trade/normalize";
import { iterateCells, parseJsonStat, type JsonStat } from "./jsonstat";
import { SourceError, rawFetchJson, type SourceQuery, type SourceResult, type SupplierQuery, type TradeSource } from "./types";

/**
 * Adaptador Eurostat Comext.
 * CONFIRMADO en la documentación oficial de Eurostat (consultada, no ejecutada contra datos): host
 * `.../eurostat/api/comext/dissemination`, ruta `/statistics/1.0/data/{dataset}`, filtros `DIMENSION=VALOR`
 * (repetidos para varios valores), filtro `time`, respuesta JSON-stat 2.0, error 400/404 "No results found" para
 * consultas vacías, respuesta asíncrona `{"warning":{"status":413,...}}` en extracciones grandes y descarga completa
 * deshabilitada (siempre hay que filtrar). El dataset DS-045409 existe ("EU trade since 1988 by HS2-4-6 and CN8").
 * NO CONFIRMADO: ids de dimensiones, códigos de indicadores y código "mundo" (ver COMEXT). Ejecuta
 * `npm run verify:comext` en una máquina con internet. Cobertura: solo declarantes de la UE.
 */
export const COMEXT_LABEL = "Eurostat Comext";
/** Supuestos NO confirmados: un único sitio donde corregirlos tras `npm run verify:comext`. */
export const COMEXT = {
  dims: { reporter: "reporter", partner: "partner", product: "product", flow: "flow", indicators: "indicators", time: "time" },
  flowImport: "1", // 1 = importación, 2 = exportación (documentado en material de Comext; verificar)
  flowExport: "2",
  indValue: "VALUE_IN_EUROS",
  indWeight: "QUANTITY_IN_100KG",
};
const WORLD = () => process.env.COMEXT_WORLD_CODE ?? "WORLD";
const toComext = (iso2: string) => (iso2 === "GR" ? "EL" : iso2);
const fromComext = (c: string) => (c === "EL" ? "GR" : c);

export function buildComextUrl(base: string, dataset: string, params: Record<string, string[]>): string {
  const u = new URL(`${base.replace(/\/$/, "")}/${encodeURIComponent(dataset)}`);
  u.searchParams.set("format", "JSON");
  u.searchParams.set("lang", "EN");
  u.searchParams.set("freq", "A");
  for (const [k, vs] of Object.entries(params)) for (const v of vs) u.searchParams.append(k, v);
  return u.toString();
}

/** Convierte una respuesta JSON-stat de Comext en observaciones normalizadas. */
export function comextToObservations(js: JsonStat, retrievedAt: string): TradeObservation[] {
  for (const d of Object.values(COMEXT.dims)) {
    if (!js.id.includes(d)) throw new SourceError("parse", `La respuesta de Comext no incluye la dimensión "${d}" (ids recibidos: ${js.id.join(", ")}). Ejecuta npm run verify:comext.`);
  }
  const acc = new Map<string, { value?: number; weight?: number; est: boolean; name: string | null; c: Record<string, string> }>();
  for (const cell of iterateCells(js)) {
    const { reporter, partner, product, flow, indicators, time } = cell.coords;
    if (cell.coords.freq && cell.coords.freq !== "A") continue; // la API real incluye la dimensión freq (A/M): solo anual
    if (cell.status && /c/.test(cell.status)) continue; // confidencial
    const k = [reporter, partner, product, flow, time].join("|");
    const e = acc.get(k) ?? { est: false, name: null, c: cell.coords };
    if (indicators === COMEXT.indValue) e.value = cell.value;
    else if (indicators === COMEXT.indWeight) e.weight = Math.round(cell.value * 100 * 100) / 100; // 100 kg → kg sin error de coma flotante
    if (cell.status && /e/.test(cell.status)) e.est = true;
    e.name = cell.labels.product ?? e.name;
    acc.set(k, e);
  }
  const out: TradeObservation[] = [];
  for (const e of acc.values()) {
    if (e.value === undefined) continue;
    const year = Number(e.c.time.slice(0, 4));
    if (!/^\d{6}$/.test(e.c.product) || !Number.isInteger(year)) continue;
    out.push({
      period: String(year),
      reporterCode: fromComext(e.c.reporter),
      partnerCode: fromComext(e.c.partner),
      productCode: e.c.product,
      productName: e.name,
      productClassification: hsVersionForYear(year),
      flow: e.c.flow === COMEXT.flowImport ? "import" : "export",
      tradeValue: e.value,
      currency: "EUR",
      netWeight: e.weight ?? null,
      quantity: null,
      quantityUnit: null,
      source: COMEXT_LABEL,
      retrievedAt,
      status: e.est ? "estimated" : "observed",
      synthetic: false,
    });
  }
  return out;
}

export type ComextClass =
  | { type: "data"; json: unknown }
  | { type: "empty" }
  | { type: "pending" }
  | { type: "error"; status: number; label: string };

/** Interpreta una respuesta de la API Statistics de Eurostat según sus códigos documentados. */
export function classifyComextResponse(status: number, json: unknown): ComextClass {
  const j = json as { warning?: { status?: number; label?: string }; error?: { status?: string | number; label?: string } } | null;
  if (j?.warning && (Number(j.warning.status) === 413 || /asynchronous/i.test(j.warning.label ?? ""))) return { type: "pending" };
  if (j?.error || status >= 400) {
    const label = String(j?.error?.label ?? "").slice(0, 300);
    if (/no results/i.test(label) || /^100\b/.test(label)) return { type: "empty" };
    return { type: "error", status, label };
  }
  return { type: "data", json };
}

export interface ComextFetchOpts {
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Devuelve el JSON-stat, o null si la consulta no tiene resultados. Reintenta si la respuesta es asíncrona. */
export async function comextFetch(url: string, opts: ComextFetchOpts = {}): Promise<unknown | null> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 5000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 1; i <= attempts; i++) {
    const r = await rawFetchJson(url);
    const c = classifyComextResponse(r.status, r.json);
    if (c.type === "data") return c.json;
    if (c.type === "empty") return null;
    if (c.type === "error") throw new SourceError("http", `Eurostat rechazó la consulta (HTTP ${c.status})${c.label ? `: ${c.label}` : ""}`, c.status);
    if (i < attempts) await sleep(delayMs * i);
  }
  throw new SourceError("pending", "Eurostat está preparando la consulta de forma asíncrona. Inténtalo de nuevo en unos minutos.");
}

const AGG = /^[A-Z]{2}$/;

export const comextSource: TradeSource = {
  mode: "comext",
  label: COMEXT_LABEL,
  async fetchData(q: SourceQuery): Promise<SourceResult> {
    if (!q.productCodes?.length) throw new SourceError("config", "En modo Comext introduce uno o más códigos HS de 6 dígitos (p. ej. 220421).");
    const cfg = getConfig();
    const years = q.years.map(String);
    const reporters = q.markets.filter((m) => MARKETS.find((x) => x.code === m)?.eu).map(toComext);
    const D = COMEXT.dims;
    const imports = buildComextUrl(cfg.comextBase, cfg.comextDataset, {
      [D.reporter]: reporters, [D.partner]: [WORLD(), "ES"], [D.product]: q.productCodes, [D.flow]: [COMEXT.flowImport],
      [D.indicators]: [COMEXT.indValue, COMEXT.indWeight], [D.time]: years,
    });
    const exports_ = buildComextUrl(cfg.comextBase, cfg.comextDataset, {
      [D.reporter]: ["ES"], [D.partner]: [WORLD()], [D.product]: q.productCodes, [D.flow]: [COMEXT.flowExport],
      [D.indicators]: [COMEXT.indValue], [D.time]: years,
    });
    const [a, b] = await Promise.all([comextFetch(imports), comextFetch(exports_)]);
    const retrievedAt = new Date().toISOString();
    const warnings = ["Comext solo cubre como mercados de destino a los Estados miembros de la UE."];
    const observations: TradeObservation[] = [];
    for (const [raw, what] of [[a, "importaciones"], [b, "exportaciones españolas"]] as const) {
      if (raw === null) warnings.push(`Eurostat no devolvió datos de ${what} para esta consulta (puede ser ausencia de datos, no necesariamente de comercio).`);
      else observations.push(...comextToObservations(parseJsonStat(raw), retrievedAt));
    }
    return {
      observations: observations.map((o) => (o.partnerCode === WORLD() ? { ...o, partnerCode: "WORLD" } : o)),
      retrievedAt, sourceLabel: COMEXT_LABEL, synthetic: false, warnings,
    };
  },
  async fetchSuppliers(q: SupplierQuery): Promise<TradeObservation[]> {
    const cfg = getConfig();
    const D = COMEXT.dims;
    const url = buildComextUrl(cfg.comextBase, cfg.comextDataset, {
      [D.reporter]: [toComext(q.market)], [D.product]: [q.productCode], [D.flow]: [COMEXT.flowImport],
      [D.indicators]: [COMEXT.indValue], [D.time]: q.years.map(String),
    });
    const raw = await comextFetch(url);
    if (raw === null) return [];
    const obs = comextToObservations(parseJsonStat(raw), new Date().toISOString());
    return obs.filter((o) => AGG.test(o.partnerCode) && o.partnerCode !== q.market);
  },
};
