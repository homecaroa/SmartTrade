import { getOrLoad } from "@/lib/cache/ttl-cache";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { MARKETS } from "@/lib/config/catalog";
import { SourceError } from "@/lib/sources/types";
import { WINE_JP } from "./curated/wine-jp";
import { extractSignals } from "./extract";
import { fetchPageSafe, type FetchPageResult } from "./fetch-page";
import { getSearchProvider } from "./providers";
import { dedupeCompanies, enrich, guessSourceType, hostOf, isBrokerHost, sortCompanies } from "./rules";
import { type BuyerQuery, type BuyerResult, type Company, type CompanyInput, type CompanyType, type SearchHit, type SearchProvider } from "./types";

/** Conjuntos curados a mano (datos reales con fuente). Clave: códigos HS6 a los que aplican + país. */
export const CURATED_SETS: { hs6: string[]; country: string; companies: CompanyInput[]; asOf: string; scope: string }[] = [
  { hs6: ["220421"], country: "JP", companies: WINE_JP, asOf: "2026-10-28", scope: "vino embotellado de hasta 2 l (HS 220421)" },
];

export const MAX_LIVE_QUERIES = 3;
export const MAX_LIVE_FETCHES = 6;
const MAX_LIVE_HITS = 8;

export function validateBuyerQuery(q: { hs6?: string; country?: string; keywords?: string }): { ok: true; query: BuyerQuery } | { ok: false; error: string } {
  const hs6 = (q.hs6 ?? "").trim();
  if (!/^\d{6}$/.test(hs6)) return { ok: false, error: "Indica un código HS de 6 dígitos (por ejemplo 220421)." };
  const country = (q.country ?? "").trim().toUpperCase();
  if (!MARKETS.some((m) => m.code === country)) return { ok: false, error: "Elige un país de destino de la lista." };
  const keywords = (q.keywords ?? "").split(/[,;]/).map((k) => k.trim().slice(0, 40)).filter(Boolean).slice(0, 5);
  return { ok: true, query: { hs6, country, keywords } };
}

/** Términos de producto en inglés: los de la consulta, o las dos últimas palabras clave del catálogo (que son inglesas). */
export function productTerms(q: BuyerQuery): string[] {
  if (q.keywords?.length) return q.keywords;
  const entry = HS_CATALOG.find((e) => e.code === q.hs6);
  return entry ? entry.keywords.split(/\s+/).slice(-2) : [];
}

export function buildQueries(q: BuyerQuery): string[] {
  const terms = productTerms(q);
  const country = MARKETS.find((m) => m.code === q.country)?.name ?? q.country;
  const phrase = terms.join(" ");
  if (!phrase) return [];
  return [`${phrase} importer distributor ${country}`, `${phrase} wholesaler ${country} company`, `${phrase} importers ${country} trade fair exhibitors directory`].slice(0, MAX_LIVE_QUERIES);
}

const cleanName = (t: string) => t.split(/\s[-|–—·]\s/)[0].trim().slice(0, 80) || t.slice(0, 80);
function guessType(text: string): CompanyType {
  if (/import(er|ador)|輸入|インポーター/i.test(text)) return "importador";
  if (/distribut|distribuidor|総代理店/i.test(text)) return "distribuidor";
  if (/wholesal|mayorista|卸/i.test(text)) return "mayorista";
  return "otro";
}

export interface LiveDeps { provider: SearchProvider; fetchPage: (url: string) => Promise<FetchPageResult>; now: () => Date }

/** Descubrimiento en vivo: busca, descarta brokers de datos, lee un número limitado de páginas y extrae señales. */
export async function discoverLive(q: BuyerQuery, deps: LiveDeps): Promise<{ companies: Company[]; warnings: string[] }> {
  const warnings: string[] = [];
  const terms = productTerms(q);
  const day = deps.now().toISOString().slice(0, 10);
  const hits = new Map<string, SearchHit>();
  for (const query of buildQueries(q)) {
    const found = await deps.provider.search({ query, maxResults: MAX_LIVE_HITS });
    for (const h of found) {
      const host = hostOf(h.url);
      if (!host || isBrokerHost(h.url) || guessSourceType(h.url) === "empleo" || hits.has(host)) continue;
      hits.set(host, h);
    }
  }
  const out: Company[] = [];
  let fetched = 0;
  for (const [host, hit] of hits) {
    const type = guessSourceType(hit.url);
    const snippetOk = terms.some((t) => hit.snippet.toLowerCase().includes(t.toLowerCase())) && /import|distribut|wholesal|mayorista|輸入|卸/i.test(hit.snippet);
    let signals: ReturnType<typeof extractSignals> | null = null;
    let read = false;
    if (type === "otra" && fetched < MAX_LIVE_FETCHES) {
      fetched++;
      const page = await deps.fetchPage(hit.url);
      if (page.ok) { signals = extractSignals(page.html, page.finalUrl, terms); read = true; }
      else warnings.push(`No se leyó ${host} (${page.reason}).`);
    }
    const pageOk = !!signals && signals.productTerm && signals.importTerm;
    if (!pageOk && !snippetOk) continue;
    const sourceType = pageOk && type === "otra" ? "corporativa" : type;
    out.push(enrich({
      id: `live-${host}`, name: cleanName(hit.title), country: q.country, city: null,
      website: sourceType === "corporativa" ? new URL(hit.url).origin : null, websiteStatus: "sin_verificar",
      type: guessType(hit.snippet + " " + (signals?.title ?? "")), brands: [],
      evidence: [{ url: hit.url, title: hit.title.slice(0, 120), sourceType, howConsulted: read ? "pagina_leida" : "extracto_buscador", consultedAt: day, claims: ["categoria"],
        summary: (read ? "Página leída automáticamente: menciona el producto y términos de importación o distribución." : "Extracto del buscador: menciona el producto y términos de importación o distribución.") }],
      contact: {
        contactPageUrl: signals?.contactLinks[0] ?? null,
        phone: signals?.phones[0] ?? null, phoneSourceUrl: signals?.phones[0] ? hit.url : null,
        email: signals?.genericEmails[0] ?? null, emailSourceUrl: signals?.genericEmails[0] ? hit.url : null, emailScope: signals?.genericEmails[0] ? "general" : null,
      },
      people: [], reason: "Resultado de una búsqueda web automática: candidato pendiente de revisión humana.",
      pending: ["Confirmar manualmente la actividad y el contacto", "Persona responsable: no recogida"], notes: [], origin: "busqueda_en_vivo",
    }));
  }
  return { companies: out, warnings };
}

export interface ServiceDeps { provider?: SearchProvider | null; fetchPage?: LiveDeps["fetchPage"]; now?: () => Date; ttlMs?: number }

export async function searchBuyers(query: BuyerQuery, deps: ServiceDeps = {}): Promise<BuyerResult> {
  const now = deps.now ?? (() => new Date());
  const provider = deps.provider === undefined ? getSearchProvider() : deps.provider;
  const warnings: string[] = [];
  const origins: BuyerResult["info"]["origins"] = [];
  let companies: Company[] = [];

  const set = CURATED_SETS.find((s) => s.country === query.country && s.hs6.includes(query.hs6));
  if (set) {
    companies.push(...set.companies.map(enrich));
    origins.push("curado");
    warnings.push(`Datos curados a mano el ${set.asOf} para ${set.scope}: la información de las webs puede haber cambiado.`);
  }
  if (provider) {
    try {
      const key = `buyers:${provider.id}:${query.hs6}:${query.country}:${(query.keywords ?? []).join(",")}`;
      const live = await getOrLoad(key, deps.ttlMs ?? Number(process.env.CACHE_TTL_SECONDS ?? 3600) * 1000, () => discoverLive(query, { provider, fetchPage: deps.fetchPage ?? fetchPageSafe, now }));
      companies.push(...live.value.companies);
      warnings.push(...live.value.warnings);
      if (live.value.companies.length) origins.push("busqueda_en_vivo");
      if (live.stale) warnings.push("La búsqueda en vivo falló; se muestran resultados anteriores en caché.");
    } catch (e) {
      warnings.push(e instanceof SourceError ? `Búsqueda en vivo no disponible: ${e.message}` : "Búsqueda en vivo no disponible por un error inesperado.");
    }
  } else {
    warnings.push("Búsqueda en vivo no configurada (falta TAVILY_API_KEY): solo se muestran datos curados, si existen para este producto y país.");
  }
  if (!set && !provider) warnings.push("No hay datos curados para esta combinación de producto y país.");

  companies = sortCompanies(dedupeCompanies(companies));
  return {
    query, companies,
    summary: {
      total: companies.length,
      confirmado: companies.filter((c) => c.evidenceLevel === "confirmado").length,
      probable: companies.filter((c) => c.evidenceLevel === "probable").length,
      insuficiente: companies.filter((c) => c.evidenceLevel === "insuficiente").length,
      withVerifiedContact: companies.filter((c) => c.contactVerified).length,
    },
    info: { origins, providerConfigured: !!provider, consultedAt: now().toISOString(), warnings },
    noData: companies.length === 0,
  };
}
