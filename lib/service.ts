import { allowedMarkets, getConfig, type AppConfig } from "@/lib/config";
import { countryName, MARKETS } from "@/lib/config/catalog";
import { getOrLoad } from "@/lib/cache/ttl-cache";
import type { OpportunityQuery } from "@/lib/schemas/query";
import type { DataMode } from "@/lib/schemas/trade";
import { topSuppliersShare, unitValuePerKg } from "@/lib/scoring/indicators";
import { buildCompetitors, type CompetitorAnalysis } from "@/lib/trade/competitors";
import { getSource } from "@/lib/sources";
import { isSnapshotStale, lookupSnapshot, snapshotAgeDays } from "@/lib/snapshots/store";
import { STALE_AFTER_DAYS } from "@/lib/snapshots/schema";
import type { Loaded } from "@/lib/cache/ttl-cache";
import type { TradeObservation } from "@/lib/schemas/trade";
import { SourceError, type SourceResult } from "@/lib/sources/types";
import { fetchWtoTariff } from "@/lib/sources/wto";
import { fetchCountryContext, type CountryContext } from "@/lib/sources/country-context";
import type { TariffLookup } from "@/lib/market-access";
import { buildOpportunities, type Opportunity } from "@/lib/trade/opportunities";
import { dedupeObservations, missingProductCodes, validateSourceObservations } from "@/lib/trade/normalize";
import { positionsFor, rankMarkets, type Position, type RankMetric } from "@/lib/trade/ranking";
import { MAX_CODES, resolveProductQuery } from "@/lib/trade/product-search";
import { hs6Of, nc8Entry } from "@/lib/config/hs-catalog";

export interface DataInfo {
  mode: DataMode;
  synthetic: boolean;
  sourceLabel: string;
  retrievedAt: string;
  ageMs: number;
  fromCache: boolean;
  stale: boolean;
  staleReason?: string;
  warnings: string[];
  /** Datos guardados usados (actualización bimensual); null si todo se consultó en vivo o es demo. */
  snapshot: { generatedAt: string; ageDays: number; stale: boolean; liveCodes: string[] } | null;
}

export interface ProductSummary { code: string; name: string; marketsWithData: number; completeSeries: number }

/**
 * Clasificación descriptiva de los mercados de UN producto (lib/trade/ranking.ts). Si la búsqueda incluye varios
 * productos, se elige uno (`producto`) y los demás se ofrecen para cambiar: nunca se ordenan productos entre sí.
 */
export interface RankingResponse {
  info: DataInfo;
  endYear: number;
  years: number[];
  products: ProductSummary[];
  product: ProductSummary | null;
  sort: RankMetric;
  order: "asc" | "desc";
  /** Mercados del producto con la métrica disponible, tras los filtros. */
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** true si se pidió una página que no existe: rows vacío, pero sí hay resultados en otras páginas. */
  pageOutOfRange: boolean;
  rows: Opportunity[]; // página actual (posición = offset + índice + 1)
  offset: number;
  /** Mercados del producto (tras los filtros) sin dato para la métrica elegida, con el motivo en `missing`. */
  withoutMetric: Opportunity[];
  pairsWithoutData: number;
}

/** Denominaciones que solo produce España: su participación española es casi el 100 % por definición (ver NC8_CATALOG). */
export function spanishOriginWarning(names: string[]): string {
  return `${names.join(", ")}: solo se produce${names.length > 1 ? "n" : ""} en España, así que la participación española es casi el 100 % por definición y no mide competencia. Sirve para ver dónde se vende y cómo evoluciona.`;
}

export function parseHsCodes(q?: string, opts: { nc8: boolean } = { nc8: true }): string[] {
  const r = resolveProductQuery(q, opts);
  if (r.codes.length === 0) {
    const why = r.unmatched.length ? `No he encontrado «${r.unmatched.join("», «")}» en el catálogo. ` : "";
    throw new SourceError("config", `${why}Escribe un código HS de 6 dígitos (p. ej. 220421; en la UE también NC de 8, p. ej. 22042176) o el nombre de un producto (p. ej. vino, aceite de oliva, cerámica). Consulta la guía de uso para buscar otros códigos.`);
  }
  if (r.tooMany) throw new SourceError("config", `La búsqueda produce ${r.codes.length} códigos; el máximo es ${MAX_CODES}. Hazla más específica.`);
  return r.codes;
}

async function loadUniverse(query: Pick<OpportunityQuery, "q" | "year">, cfg: AppConfig) {
  const year = query.year ?? cfg.defaultYear;
  const lastFullYear = new Date().getFullYear() - 1;
  if (year > lastFullYear) {
    throw new SourceError("config", `El año ${year} puede tener datos incompletos o provisionales: el último año completo es ${lastFullYear}.`);
  }
  const years = [year - 2, year - 1, year];
  const markets = allowedMarkets(cfg.mode);
  // Subcategorías NC8 solo con Eurostat Comext (UE): UN Comtrade no las tiene y se usa su partida HS6.
  const nc8 = { nc8: cfg.mode === "comext" };
  const codes = cfg.mode === "demo" ? null : parseHsCodes(query.q, nc8);
  const resolution = cfg.mode === "demo" ? null : resolveProductQuery(query.q, nc8);
  const { loaded, snapshot } = await loadSourceData(cfg, years, codes, markets.map((m) => m.code));
  const built = buildOpportunities({ observations: loaded.value.observations, markets, endYear: year, mode: cfg.mode });
  const info: DataInfo = {
    mode: cfg.mode,
    synthetic: loaded.value.synthetic,
    sourceLabel: loaded.value.sourceLabel,
    retrievedAt: loaded.value.retrievedAt,
    ageMs: loaded.ageMs,
    fromCache: loaded.fromCache,
    stale: loaded.stale,
    staleReason: loaded.staleReason,
    warnings: [...loaded.value.warnings],
    snapshot,
  };
  if (snapshot?.stale) info.warnings.push(`Los datos guardados tienen ${snapshot.ageDays} días (se actualizan cada dos meses; aviso a partir de ${STALE_AFTER_DAYS}): puede que la última actualización no se haya completado.`);
  if (resolution?.notes.length) info.warnings.push(`Interpretación de tu búsqueda: ${resolution.notes.join(" | ")}.`);
  const ownDo = (codes ?? []).map(nc8Entry).filter((e) => e?.spanishOrigin).map((e) => e!.name);
  if (ownDo.length) info.warnings.push(spanishOriginWarning(ownDo));
  if (resolution?.unmatched.length) info.warnings.push(`No se ha podido interpretar: ${resolution.unmatched.join(", ")} (se han ignorado).`);
  if (loaded.stale) info.warnings.push("La fuente no respondió: se muestran datos en caché que pueden no estar actualizados.");
  const noData = missingProductCodes(codes, loaded.value.observations);
  if (noData.length) {
    info.warnings.push(
      `Sin datos para ${noData.join(", ")} en ${years[0]}–${year}. Comprueba que el código HS6 existe en la nomenclatura vigente en esos años (p. ej. el 150910 se sustituyó en HS2022 por 150920/150930/150940/150990) y que la fuente publica ese periodo.`,
    );
  }
  if (built.duplicatesRemoved) info.warnings.push(`${built.duplicatesRemoved} observaciones duplicadas descartadas.`);
  if (built.pairsWithoutData) {
    const extra = built.pairsWithoutData > built.pairsWithoutDataList.length ? " …" : "";
    info.warnings.push(`${built.pairsWithoutData} combinaciones producto-mercado sin datos: ${built.pairsWithoutDataList.join(", ")}${extra} (ausencia de datos no implica ausencia de comercio).`);
  }
  return { year, years, built, info };
}

/**
 * Datos de la fuente para unos años y códigos. En modos reales usa primero los datos guardados (data/snapshots,
 * actualizados cada dos meses) y solo consulta en vivo los códigos que no estén guardados. Motivo: la caché en memoria
 * se pierde en Vercel y el cupo de UN Comtrade lo comparten todos los visitantes. Si la consulta en vivo de los códigos
 * restantes falla, se muestran los guardados con un aviso en vez de un error.
 */
async function loadSourceData(cfg: AppConfig, years: number[], codes: string[] | null, marketCodes: string[]): Promise<{ loaded: Loaded<SourceResult>; snapshot: DataInfo["snapshot"] }> {
  const source = getSource(cfg.mode);
  const live = (cs: string[] | null) => getOrLoad<SourceResult>(JSON.stringify([cfg.mode, years, cs]), cfg.cacheTtlMs, () =>
    source.fetchData({ years, productCodes: cs, markets: marketCodes }).then(validateSourceObservations));
  if (cfg.mode === "demo" || !codes) return { loaded: await live(codes), snapshot: null };
  const snap = lookupSnapshot(cfg.mode, years, codes);
  if (!snap.covered.length || !snap.generatedAt) return { loaded: await live(codes), snapshot: null };
  const warnings = [...snap.warnings];
  let liveObs: TradeObservation[] = [];
  let stale = false;
  let staleReason: string | undefined;
  let liveCodes = snap.missing;
  if (snap.missing.length) {
    try {
      const l = await live(snap.missing);
      liveObs = l.value.observations;
      warnings.push(...l.value.warnings);
      stale = l.stale;
      staleReason = l.staleReason;
    } catch (e) {
      liveCodes = [];
      warnings.push(`No se pudieron consultar en vivo ${snap.missing.join(", ")} (no están entre los datos guardados): ${e instanceof Error ? e.message : "error desconocido"}.`);
    }
  }
  const fetchedAt = Date.parse(snap.generatedAt);
  return {
    loaded: { value: { observations: [...snap.observations, ...liveObs], retrievedAt: snap.generatedAt, sourceLabel: snap.sourceLabel ?? source.label, warnings, synthetic: false }, fetchedAt, ageMs: Date.now() - fetchedAt, fromCache: false, stale, staleReason },
    snapshot: { generatedAt: snap.generatedAt, ageDays: snapshotAgeDays(snap.generatedAt), stale: isSnapshotStale(snap.generatedAt), liveCodes },
  };
}

function summarize(opps: Opportunity[]): ProductSummary[] {
  const by = new Map<string, ProductSummary>();
  for (const o of opps) {
    const p = by.get(o.productCode) ?? { code: o.productCode, name: o.productName, marketsWithData: 0, completeSeries: 0 };
    p.marketsWithData++;
    if (o.complete) p.completeSeries++;
    by.set(o.productCode, p);
  }
  return [...by.values()];
}

/** En demo no hay consulta por códigos: la búsqueda filtra los productos sintéticos por código o nombre del catálogo. */
function demoProducts(opps: Opportunity[], q?: string): Opportunity[] {
  if (!q) return opps;
  const codes = new Set(resolveProductQuery(q).codes);
  const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return opps.filter((o) => codes.has(o.productCode) || fold(o.productName).includes(fold(q)) || o.productCode.startsWith(q.trim()));
}

export async function getFullRanking(query: OpportunityQuery, cfg = getConfig()) {
  const u = await loadUniverse(query, cfg);
  const opps = cfg.mode === "demo" ? demoProducts(u.built.opportunities, query.q) : u.built.opportunities;
  const products = summarize(opps);
  const product = products.find((p) => p.code === query.producto) ?? products[0] ?? null;
  const { rows, withoutMetric } = product
    ? rankMarkets(opps, product.code, { market: query.market, minSizeM: query.minSize, minGrowth: query.minGrowth, sort: query.sort, order: query.order })
    : { rows: [], withoutMetric: [] };
  return { ...u, opps, products, product, ranked: rows, withoutMetric };
}

export async function getRanking(query: OpportunityQuery, cfg = getConfig()): Promise<RankingResponse> {
  const u = await getFullRanking(query, cfg);
  const pages = Math.max(1, Math.ceil(u.ranked.length / query.pageSize));
  const offset = (query.page - 1) * query.pageSize;
  return {
    info: u.info,
    endYear: u.year,
    years: u.years,
    products: u.products,
    product: u.product,
    sort: query.sort,
    order: query.order,
    total: u.ranked.length,
    page: query.page,
    pageSize: query.pageSize,
    pages,
    pageOutOfRange: u.ranked.length > 0 && query.page > pages,
    offset,
    rows: u.ranked.slice(offset, offset + query.pageSize),
    withoutMetric: u.withoutMetric.slice(0, 50),
    pairsWithoutData: u.built.pairsWithoutData,
  };
}

export interface Supplier {
  code: string;
  name: string;
  value: number;
  sharePct: number | null;
}

export interface DetailResponse {
  info: DataInfo;
  opportunity: Opportunity;
  /** Puesto entre los mercados del mismo producto en cada métrica descriptiva (null si no tiene esa métrica). */
  positions: Record<RankMetric, Position | null>;
  suppliers: Supplier[];
  top3Concentration: number | null;
  supplierWarning?: string;
  /** Contexto económico del país (Eurostat o OCDE), solo con datos reales; undefined si no se consulta. */
  context?: ContextLookup;
  /** Aranceles del destino (API de la OMC), solo fuera de la UE, con datos reales y con clave; undefined si no se consulta. */
  tariff?: TariffLookup;
  /** España frente a sus competidores en el mercado (cuota, variación y valor unitario): lib/trade/competitors.ts. */
  competitors: CompetitorAnalysis | null;
  unitValue: number | null;
  sameProduct: Opportunity[]; // mismo producto: los 10 mayores mercados con dato de importaciones
}

const TARIFF_TTL_MS = 24 * 3600 * 1000;

export interface ContextLookup { context: CountryContext | null; checkedAt: string; error?: string }

/** Contexto del país: nunca en demo ni con datos sintéticos; caché de 24 h (datos anuales); un fallo no rompe la ficha. */
export async function lookupContext(opp: Opportunity, cfg: AppConfig): Promise<ContextLookup | undefined> {
  if (opp.synthetic || cfg.mode === "demo" || !MARKETS.some((m) => m.code === opp.marketCode)) return undefined;
  try {
    const loaded = await getOrLoad(JSON.stringify(["ctx", opp.marketCode]), Math.max(cfg.cacheTtlMs, TARIFF_TTL_MS), () =>
      fetchCountryContext({ eurostat: cfg.eurostatBase, oecd: cfg.oecdBase }, opp.marketCode));
    return { context: loaded.value, checkedAt: new Date(loaded.fetchedAt).toISOString() };
  } catch (e) {
    return { context: null, checkedAt: new Date().toISOString(), error: e instanceof SourceError ? e.message : "No se pudo consultar la fuente" };
  }
}

export async function lookupTariff(opp: Opportunity, cfg: AppConfig): Promise<TariffLookup | undefined> {
  const market = MARKETS.find((m) => m.code === opp.marketCode);
  if (opp.synthetic || cfg.mode === "demo" || !market || market.eu || !cfg.wtoKey) return undefined;
  const key = cfg.wtoKey;
  try {
    // Los aranceles cambian como mucho una vez al año y la clave tiene cupo (comprobado: 429 tras una ráfaga), así que
    // se guardan al menos 24 h en caché, aunque el resto de datos use un TTL menor.
    const loaded = await getOrLoad(JSON.stringify(["wto", opp.marketCode, opp.productCode]), Math.max(cfg.cacheTtlMs, TARIFF_TTL_MS), () =>
      fetchWtoTariff(cfg.wtoBase, key, opp.marketCode, hs6Of(opp.productCode))); // la OMC llega a 6 dígitos
    return { tariff: loaded.value, checkedAt: new Date(loaded.fetchedAt).toISOString() };
  } catch (e) {
    return { tariff: null, checkedAt: new Date().toISOString(), error: e instanceof SourceError ? `No se pudo consultar la OMC: ${e.message}` : "No se pudo consultar la OMC" };
  }
}

export async function getOpportunityDetail(id: string, q: string | undefined, cfg = getConfig()): Promise<DetailResponse | null> {
  const year = Number(id.slice(-4));
  const [productCode, marketCode] = id.split("-");
  // Solo los datos de ESTE producto, sea cual sea la búsqueda de la que se venga (`q` solo sirve para el enlace de
  // vuelta): así la ficha muestra siempre las mismas cifras y puestos para el mismo id. Antes el universo de percentiles
  // dependía de la búsqueda y un enlace sin `q` daba otro índice (segunda auditoría, 05/11/2026).
  void q;
  const u = await loadUniverse({ q: cfg.mode === "demo" ? undefined : productCode, year }, cfg);
  const opp = u.built.opportunities.find((o) => o.id === id);
  if (!opp) return null;
  const positions = positionsFor(u.built.opportunities, id);

  // Aranceles (solo fuera de la UE, con datos reales y clave): en paralelo a los proveedores, y nunca rompe la ficha.
  const tariffPromise = lookupTariff(opp, cfg);
  const contextPromise = lookupContext(opp, cfg);
  let suppliers: Supplier[] = [];
  let competitors: CompetitorAnalysis | null = null;
  let supplierWarning: string | undefined;
  try {
    // Toda la ventana del ranking (no solo el último año): permite ver qué competidores ganan o pierden cuota.
    const years = opp.importsSeries.map((p) => p.year);
    const loaded = await getOrLoad(JSON.stringify(["sup", cfg.mode, productCode, marketCode, years]), cfg.cacheTtlMs, async () =>
      getSource(cfg.mode).fetchSuppliers({ market: marketCode, productCode, years }),
    );
    const { unique } = dedupeObservations(loaded.value);
    const names = new Map(MARKETS.map((m) => [m.code, m.name]));
    const nameOf = (code: string, fallback?: string | null) => names.get(code) ?? fallback ?? countryName(code);
    suppliers = unique
      .filter((o) => o.period === String(year) && o.tradeValue !== null && o.tradeValue > 0 && o.currency === opp.currency)
      .map((o) => ({ code: o.partnerCode, name: nameOf(o.partnerCode, o.partnerName), value: o.tradeValue!, sharePct: opp.marketSize ? (o.tradeValue! / opp.marketSize) * 100 : null }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    competitors = buildCompetitors({ observations: unique, totals: opp.importsSeries, names: nameOf, currency: opp.currency });
    if (loaded.stale) supplierWarning = "Proveedores obtenidos de caché antigua (la fuente no respondió).";
  } catch (e) {
    supplierWarning = e instanceof SourceError ? `No se pudieron obtener los proveedores: ${e.message}` : "No se pudieron obtener los proveedores.";
  }

  return {
    info: u.info,
    opportunity: opp,
    positions,
    suppliers,
    top3Concentration: topSuppliersShare(suppliers, opp.marketSize, 3),
    supplierWarning,
    competitors,
    tariff: await tariffPromise,
    context: await contextPromise,
    unitValue: unitValuePerKg(opp.marketSize, opp.netWeightEndYear),
    sameProduct: u.built.opportunities.filter((o) => o.productCode === productCode && o.marketSize !== null).sort((a, b) => b.marketSize! - a.marketSize! || a.marketCode.localeCompare(b.marketCode)).slice(0, 10),
  };
}

export interface ComparisonResponse {
  info: DataInfo;
  items: { opp: Opportunity; positions: Record<RankMetric, Position | null> }[];
  missing: string[];
}

/** Carga los resultados seleccionados para compararlos (solo los datos de sus productos). */
export async function getComparison(ids: string[], q: string | undefined, cfg = getConfig()): Promise<ComparisonResponse> {
  const year = Number(ids[0].slice(-4));
  const codes = [...new Set(ids.map((i) => i.split("-")[0]))];
  void q; // como en la ficha: solo los productos comparados, para que las cifras no dependan de la búsqueda
  const u = await loadUniverse({ q: cfg.mode === "demo" ? undefined : codes.join(","), year }, cfg);
  const items: ComparisonResponse["items"] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const opp = u.built.opportunities.find((o) => o.id === id);
    if (!opp) { missing.push(id); continue; }
    items.push({ opp, positions: positionsFor(u.built.opportunities, id) });
  }
  return { info: u.info, items, missing };
}

export function getFilters(cfg = getConfig()) {
  return {
    mode: cfg.mode,
    origin: { code: "ES", name: "España" },
    markets: allowedMarkets(cfg.mode).map((m) => ({ code: m.code, name: m.name })),
    years: Array.from({ length: 8 }, (_, i) => 2018 + i).filter((y) => y >= 2020),
    defaultYear: cfg.defaultYear,
    productInput: cfg.mode === "demo" ? "Texto libre o código HS6 (catálogo demo)" : "Nombre o código HS6, separados por comas: vino, aceite de oliva, 220421",
  };
}
