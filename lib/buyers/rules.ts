import { COMPANY_TYPES, EVIDENCE_LEVELS, type BuyerOrigin, type Company, type CompanyInput, type CompanyType, type Evidence, type EvidenceLevel } from "./types";

/** Webs de brokers de datos: contienen datos personales y correos inferidos. Sus resultados se descartan siempre. */
export const BROKER_HOSTS = ["zoominfo.com", "prospeo.io", "importgenius.com", "panjiva.com", "apollo.io", "rocketreach.co", "lusha.com", "signalhire.com", "hunter.io", "contactout.com"];
export const EMPLOYMENT_HOSTS = ["careercross.com", "townwork.net", "mynavi-agent.jp", "careerconnection.jp", "en-ambi.com", "mid-tenshoku.com", "indeed.com", "doda.jp", "glassdoor.com", "jp.linkedin.com", "linkedin.com"];
export const DIRECTORY_HOSTS = ["inshokuten.com", "compalyze.co.jp", "wineguide.jp", "salesnow.jp", "europages.com", "kompass.com", "yellowpages.com", "alibaba.com"];

export function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}
const inList = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith("." + h));
export const isBrokerHost = (url: string) => { const h = hostOf(url); return !!h && inList(h, BROKER_HOSTS); };

export function guessSourceType(url: string): Evidence["sourceType"] {
  const h = hostOf(url);
  if (!h) return "otra";
  if (inList(h, EMPLOYMENT_HOSTS)) return "empleo";
  if (inList(h, DIRECTORY_HOSTS)) return "directorio";
  if (/(^|\.)(gov|gob|gouv|go\.jp|admin\.ch)(\.|$)/.test(h) || h.endsWith(".europa.eu") || h === "icex.es" || h.endsWith("jetro.go.jp")) return "gobierno";
  return "otra";
}

/**
 * Nivel de evidencia deducido SOLO de las pruebas:
 * - confirmado: una página de la propia empresa, leída, afirma que importa/distribuye la categoría de producto.
 *   Solo para datos curados a mano: lo automático (búsqueda en vivo o IA) nunca pasa de «probable».
 * - probable: otra fuente (oficial, directorio, feria, asociación, prensa o extracto de su web) lo afirma.
 * - insuficiente: sin afirmación de la categoría, o solo ofertas de empleo u otras fuentes débiles.
 * Los resultados de búsqueda en vivo nunca superan «probable» (extracción automática sin revisión humana).
 */
export function classifyEvidence(evidence: Evidence[], origin: BuyerOrigin = "curado"): { level: EvidenceLevel; spainOriginVerified: boolean; reason: string } {
  const cat = evidence.filter((e) => e.claims.includes("categoria"));
  const strong = cat.some((e) => e.sourceType === "corporativa" && e.howConsulted === "pagina_leida");
  const spainOriginVerified = evidence.some((e) => e.claims.includes("origen_espana") && ["corporativa", "gobierno", "feria", "asociacion"].includes(e.sourceType));
  if (strong && origin === "curado") return { level: "confirmado", spainOriginVerified, reason: "Una página leída de la propia empresa afirma que importa o distribuye el producto." };
  if (strong) return { level: "probable", spainOriginVerified, reason: "Extracción automática de la web de la empresa: pendiente de revisión humana." };
  if (cat.some((e) => !["empleo", "otra"].includes(e.sourceType))) return { level: "probable", spainOriginVerified, reason: "Fuentes secundarias (directorio, listado oficial o prensa) indican actividad con el producto; falta confirmarlo en su web." };
  return { level: "insuficiente", spainOriginVerified, reason: "Ninguna fuente fiable afirma que trate con el producto." };
}

export function enrich(c: CompanyInput): Company {
  const r = classifyEvidence(c.evidence, c.origin);
  const contactVerified = !!(c.contact.contactPageUrl || (c.contact.phone && c.contact.phoneSourceUrl) || (c.contact.email && c.contact.emailSourceUrl));
  return { ...c, evidenceLevel: r.level, spainOriginVerified: r.spainOriginVerified, levelReason: r.reason, contactVerified };
}

const LEVEL_RANK: Record<EvidenceLevel, number> = { confirmado: 0, probable: 1, insuficiente: 2 };
/** Una pista de IA sin verificar no tiene pruebas, así que su nivel es «insuficiente» y ya queda detrás de las demás. */
export const sortCompanies = (list: Company[]) => [...list].sort((a, b) => LEVEL_RANK[a.evidenceLevel] - LEVEL_RANK[b.evidenceLevel] || Number(b.contactVerified) - Number(a.contactVerified) || a.name.localeCompare(b.name));

/** Fusiona duplicados por dominio (o nombre+país): une pruebas por URL y conserva el nivel más alto. */
export function dedupeCompanies(list: Company[]): Company[] {
  const byKey = new Map<string, Company>();
  for (const c of list) {
    const key = (c.website && hostOf(c.website)) || `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}:${c.country}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, c); continue; }
    const base = (c.origin === "curado" && prev.origin !== "curado") || LEVEL_RANK[c.evidenceLevel] < LEVEL_RANK[prev.evidenceLevel] ? c : prev;
    const other = base === c ? prev : c;
    const urls = new Set(base.evidence.map((e) => e.url));
    byKey.set(key, enrich({ ...base, evidence: [...base.evidence, ...other.evidence.filter((e) => !urls.has(e.url))] }));
  }
  return [...byKey.values()];
}

export interface BuyerFilters { tipo?: string; nivel?: string }
export function filterCompanies(list: Company[], f: BuyerFilters): Company[] {
  const tipo = (COMPANY_TYPES as readonly string[]).includes(f.tipo ?? "") ? f.tipo : undefined;
  const nivel = (EVIDENCE_LEVELS as readonly string[]).includes(f.nivel ?? "") ? f.nivel : undefined;
  return list.filter((c) => (!tipo || c.type === (tipo as CompanyType)) && (!nivel || c.evidenceLevel === nivel));
}
