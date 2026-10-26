import { allowedMarkets, getConfig, type AppConfig } from "@/lib/config";
import { countryName, MARKETS } from "@/lib/config/catalog";
import { getOrLoad } from "@/lib/cache/ttl-cache";
import type { OpportunityQuery } from "@/lib/schemas/query";
import type { DataMode } from "@/lib/schemas/trade";
import { topSuppliersShare, unitValuePerKg } from "@/lib/scoring/indicators";
import { getSource } from "@/lib/sources";
import { SourceError, type SourceResult } from "@/lib/sources/types";
import { buildOpportunities, type Opportunity } from "@/lib/trade/opportunities";
import { dedupeObservations, missingProductCodes, validateSourceObservations } from "@/lib/trade/normalize";
import { filterIncomplete, rankOpportunities } from "@/lib/trade/ranking";
import { MAX_CODES, resolveProductQuery } from "@/lib/trade/product-search";

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
}

export interface RankingResponse {
  info: DataInfo;
  endYear: number;
  years: number[];
  universeSize: number;
  validCount: number;
  incompleteCount: number;
  pairsWithoutData: number;
  total: number;
  page: number;
  pageSize: number;
  rows: Opportunity[]; // página actual (posición = offset + índice + 1)
  offset: number;
  incomplete: Opportunity[];
}

export const MIN_UNIVERSE = 10;

/** Avisos sobre el universo de percentiles: con pocas oportunidades completas la puntuación es poco informativa. */
export function universeWarnings(completeCount: number): string[] {
  return completeCount < MIN_UNIVERSE
    ? [`Universo pequeño: los percentiles se calculan sobre solo ${completeCount} oportunidades completas (mínimo recomendado ${MIN_UNIVERSE}); la puntuación es poco informativa. Añade más códigos HS para ampliarlo.`]
    : [];
}

export const MIN_PRODUCTS = 10;

/** La posición exportadora se normaliza por percentiles entre PRODUCTOS: con pocos productos solo toma unos pocos valores. */
export function productUniverseWarnings(productCount: number): string[] {
  return productCount > 0 && productCount < MIN_PRODUCTS
    ? [`La posición exportadora (15 % de la puntuación) se normaliza sobre solo ${productCount} producto(s) (mínimo recomendado ${MIN_PRODUCTS}): toma pocos valores distintos y favorece sistemáticamente a los productos más exportados. Añade más códigos HS para compararla con sentido.`]
    : [];
}

export function parseHsCodes(q?: string): string[] {
  const r = resolveProductQuery(q);
  if (r.codes.length === 0) {
    const why = r.unmatched.length ? `No he encontrado «${r.unmatched.join("», «")}» en el catálogo. ` : "";
    throw new SourceError("config", `${why}Escribe un código HS de 6 dígitos (p. ej. 220421) o el nombre de un producto (p. ej. vino, aceite de oliva, cerámica). Consulta la guía de uso para buscar otros códigos.`);
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
  const source = getSource(cfg.mode);
  const markets = allowedMarkets(cfg.mode);
  const codes = cfg.mode === "demo" ? null : parseHsCodes(query.q);
  const resolution = cfg.mode === "demo" ? null : resolveProductQuery(query.q);
  const key = JSON.stringify([cfg.mode, years, codes]);
  const loaded = await getOrLoad<SourceResult>(key, cfg.cacheTtlMs, () =>
    source.fetchData({ years, productCodes: codes, markets: markets.map((m) => m.code) }).then(validateSourceObservations),
  );
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
  };
  if (resolution?.notes.length) info.warnings.push(`Interpretación de tu búsqueda: ${resolution.notes.join(" | ")}.`);
  if (resolution?.unmatched.length) info.warnings.push(`No se ha podido interpretar: ${resolution.unmatched.join(", ")} (se han ignorado).`);
  const completeOpps = built.opportunities.filter((o) => o.complete);
  info.warnings.push(...universeWarnings(completeOpps.length));
  info.warnings.push(...productUniverseWarnings(new Set(completeOpps.map((o) => o.productCode)).size));
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

const toFilters = (q: OpportunityQuery, demo: boolean) => ({
  q: demo ? q.q : undefined, // en modo real el universo ya se limita a los códigos resueltos
  market: q.market, minSizeM: q.minSize, minGrowth: q.minGrowth, sort: q.sort, order: q.order,
});

export async function getFullRanking(query: OpportunityQuery, cfg = getConfig()) {
  const u = await loadUniverse(query, cfg);
  const ranked = rankOpportunities(u.built.opportunities, toFilters(query, cfg.mode === "demo"));
  return { ...u, ranked, incomplete: filterIncomplete(u.built.opportunities, { q: cfg.mode === "demo" ? query.q : undefined, market: query.market }) };
}

export async function getRanking(query: OpportunityQuery, cfg = getConfig()): Promise<RankingResponse> {
  const u = await getFullRanking(query, cfg);
  const offset = (query.page - 1) * query.pageSize;
  const all = u.built.opportunities;
  return {
    info: u.info,
    endYear: u.year,
    years: u.years,
    universeSize: all.filter((o) => o.complete).length,
    validCount: u.ranked.length,
    incompleteCount: u.incomplete.length,
    pairsWithoutData: u.built.pairsWithoutData,
    total: u.ranked.length,
    page: query.page,
    pageSize: query.pageSize,
    offset,
    rows: u.ranked.slice(offset, offset + query.pageSize),
    incomplete: u.incomplete.slice(0, 50),
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
  /** Posición en el ranking por puntuación (null si incompleta). */
  rank: number | null;
  suppliers: Supplier[];
  top3Concentration: number | null;
  supplierWarning?: string;
  unitValue: number | null;
  sameProduct: Opportunity[]; // mismo producto en otros mercados (completos)
}

export async function getOpportunityDetail(id: string, q: string | undefined, cfg = getConfig()): Promise<DetailResponse | null> {
  const year = Number(id.slice(-4));
  const [productCode, marketCode] = id.split("-");
  const u = await loadUniverse({ q: cfg.mode === "demo" ? undefined : q ?? productCode, year }, cfg);
  const opp = u.built.opportunities.find((o) => o.id === id);
  if (!opp) return null;
  const ranked = rankOpportunities(u.built.opportunities, { sort: "score", order: "desc" });
  const rank = ranked.findIndex((o) => o.id === id);

  let suppliers: Supplier[] = [];
  let supplierWarning: string | undefined;
  try {
    const loaded = await getOrLoad(JSON.stringify(["sup", cfg.mode, productCode, marketCode, year]), cfg.cacheTtlMs, async () =>
      getSource(cfg.mode).fetchSuppliers({ market: marketCode, productCode, years: [year] }),
    );
    const { unique } = dedupeObservations(loaded.value);
    const names = new Map(MARKETS.map((m) => [m.code, m.name]));
    suppliers = unique
      .filter((o) => o.period === String(year) && o.tradeValue !== null && o.tradeValue > 0 && o.currency === opp.currency)
      .map((o) => ({ code: o.partnerCode, name: names.get(o.partnerCode) ?? o.partnerName ?? countryName(o.partnerCode), value: o.tradeValue!, sharePct: opp.marketSize ? (o.tradeValue! / opp.marketSize) * 100 : null }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    if (loaded.stale) supplierWarning = "Proveedores obtenidos de caché antigua (la fuente no respondió).";
  } catch (e) {
    supplierWarning = e instanceof SourceError ? `No se pudieron obtener los proveedores: ${e.message}` : "No se pudieron obtener los proveedores.";
  }

  return {
    info: u.info,
    opportunity: opp,
    rank: rank >= 0 ? rank + 1 : null,
    suppliers,
    top3Concentration: topSuppliersShare(suppliers, opp.marketSize, 3),
    supplierWarning,
    unitValue: unitValuePerKg(opp.marketSize, opp.netWeightEndYear),
    sameProduct: u.built.opportunities.filter((o) => o.productCode === productCode && o.complete).sort((a, b) => b.marketSize! - a.marketSize!).slice(0, 10),
  };
}

export interface ComparisonResponse {
  info: DataInfo;
  universeSize: number;
  items: { opp: Opportunity; rank: number | null }[];
  missing: string[];
}

/** Carga los resultados seleccionados para compararlos, con el mismo universo de percentiles que el ranking. */
export async function getComparison(ids: string[], q: string | undefined, cfg = getConfig()): Promise<ComparisonResponse> {
  const year = Number(ids[0].slice(-4));
  const codes = [...new Set(ids.map((i) => i.split("-")[0]))];
  const u = await loadUniverse({ q: cfg.mode === "demo" ? undefined : q ?? codes.join(","), year }, cfg);
  const ranked = rankOpportunities(u.built.opportunities, { sort: "score", order: "desc" });
  const items: ComparisonResponse["items"] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const opp = u.built.opportunities.find((o) => o.id === id);
    if (!opp) { missing.push(id); continue; }
    const i = ranked.findIndex((o) => o.id === id);
    items.push({ opp, rank: i >= 0 ? i + 1 : null });
  }
  return { info: u.info, universeSize: u.built.opportunities.filter((o) => o.complete).length, items, missing };
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
