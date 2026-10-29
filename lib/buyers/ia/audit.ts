import { extractSignals, htmlToText } from "../extract";
import { isBlockedHost, type FetchPageResult } from "../fetch-page";
import { guessSourceType, hostOf, isBrokerHost } from "../rules";
import type { CompanyInput, Evidence, IaMeta } from "../types";
import type { Candidate } from "./prompt";

/**
 * Auditoría de las pistas de IA. NADA de lo que sugiere el modelo se da por bueno:
 * - La web sugerida solo se enlaza si se pudo LEER (con robots.txt y límites de fetchPageSafe) y la página nombra a la empresa.
 * - «Verificada» = la web responde, nombra a la empresa y menciona el producto. No prueba que nos vaya a comprar.
 * - Si no se puede comprobar, la empresa queda «sin verificar»: se muestra como pista, sin enlace, y con el motivo.
 * Caso que motiva la regla: una lista de IA atribuía el mismo dominio a cuatro empresas distintas; la comprobación del
 * nombre en la página lo descarta.
 */

export interface AuditDeps { fetchPage: (url: string) => Promise<FetchPageResult>; now: () => Date; onProgress?: (msg: string) => void }
export interface AuditContext { hs6: string; country: string; terms: string[]; model: string }

const GENERIC = new Set([
  "gmbh", "kg", "ag", "co", "ltd", "llc", "inc", "sl", "sa", "srl", "spa", "bv", "nv", "ab", "as", "oy", "kk", "kabushiki", "kaisha", "company", "the", "und", "and", "et", "de", "di", "der", "die", "das",
  "wein", "weine", "wine", "wines", "vino", "vinos", "vin", "vins", "import", "imports", "export", "handel", "trading", "group", "gruppe", "holding", "international", "distribution", "vertrieb",
  "grosshandel", "importer", "distributor", "feinkost", "mbh", "ohg",
]);

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").toLowerCase();

const LEGAL = new Set(["gmbh", "kg", "ag", "ltd", "llc", "inc", "mbh", "ohg", "co", "sl", "sa", "srl", "spa", "bv", "nv", "ab", "as", "oy", "kk"]);
const words = (name: string) => fold(name.replace(/\([^)]*\)/g, " ")).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);

/** Palabras distintivas del nombre (sin formas legales ni palabras genéricas del sector). Vacío si el nombre es solo genérico. */
export function nameTokens(name: string): string[] {
  return words(name).filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/**
 * ¿La página nombra a la empresa? Con palabras distintivas, deben estar TODAS (en el texto o en el dominio). Si el nombre es solo
 * genérico («Wein & Vinos GmbH»), cualquier web de vino lo contendría: se exige la frase completa y contigua.
 */
export function nameMatchesPage(name: string, pageText: string, host: string): boolean {
  const tokens = nameTokens(name);
  const hay = fold(pageText);
  if (tokens.length) {
    const hostFlat = fold(host).replace(/[^a-z0-9]/g, "");
    return tokens.every((t) => hay.includes(t) || hostFlat.includes(t));
  }
  const phrase = words(name).filter((t) => !LEGAL.has(t)).join(" ");
  if (phrase.split(" ").length < 2) return false;
  return words(hay).join(" ").includes(phrase);
}

/** Convierte lo que escribió el modelo en la portada https://dominio/ o null si no es un dominio público utilizable. */
export function normalizeWeb(raw: string | null): { ok: true; url: string } | { ok: false; reason: string } {
  const t = (raw ?? "").trim();
  if (!t) return { ok: false, reason: "El modelo no indicó una web." };
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`); } catch { return { ok: false, reason: "La web sugerida no es una dirección válida." }; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || isBlockedHost(u.hostname)) return { ok: false, reason: "La web sugerida no es un dominio público válido." };
  if (isBrokerHost(u.toString()) || ["empleo", "directorio"].includes(guessSourceType(u.toString()))) return { ok: false, reason: "La web sugerida es un directorio, un broker de datos o un portal de empleo, no la web de la empresa." };
  return { ok: true, url: `https://${u.hostname.toLowerCase()}/` };
}

const SPAIN = /\b(espana|spain|spanien|espagne|spagna|espanha|spanish|spanisch|espagnol|spagnolo|espanol)\b/;
const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "empresa";

export async function auditCandidates(cands: Candidate[], ctx: AuditContext, deps: AuditDeps): Promise<{ companies: CompanyInput[]; discarded: string[] }> {
  const day = deps.now().toISOString().slice(0, 10);
  const discarded: string[] = [];
  const pages = new Map<string, FetchPageResult>();
  const seenIds = new Set<string>();
  const hostUse = new Map<string, number>();
  for (const c of cands) { const w = normalizeWeb(c.web); if (w.ok) { const h = hostOf(w.url) ?? ""; hostUse.set(h, (hostUse.get(h) ?? 0) + 1); } }

  const out: CompanyInput[] = [];
  for (const [i, c] of cands.entries()) {
    deps.onProgress?.(`  (${i + 1}/${cands.length}) ${c.nombre}`);
    const id = `ia-${ctx.hs6}-${ctx.country}-${slug(c.nombre)}`.toLowerCase();
    if (seenIds.has(id)) { discarded.push(`${c.nombre}: duplicada`); continue; }
    seenIds.add(id);
    const notes: string[] = [];
    let verified = false;
    let website: string | null = null;
    let signals: ReturnType<typeof extractSignals> | null = null;
    let finalUrl: string | null = null;
    let spainOnPage = false;

    const w = normalizeWeb(c.web);
    if (!w.ok) notes.push(w.reason);
    else {
      const host = hostOf(w.url) ?? "";
      if ((hostUse.get(host) ?? 0) > 1) notes.push(`El modelo atribuyó el mismo dominio (${host}) a ${hostUse.get(host)} empresas distintas: solo cabe una.`);
      let page = pages.get(host);
      if (!page) { page = await deps.fetchPage(w.url); pages.set(host, page); }
      if (!page.ok) notes.push(`No se pudo leer la web sugerida (${host}): ${REASON[page.reason] ?? page.reason}. Dominio sugerido por la IA, no comprobado.`);
      else {
        const text = htmlToText(page.html);
        const pageHost = hostOf(page.finalUrl) ?? host;
        const nameOk = nameMatchesPage(c.nombre, text, pageHost);
        signals = extractSignals(page.html, page.finalUrl, ctx.terms);
        if (!nameOk) notes.push(`La web ${pageHost} responde, pero no nombra a «${c.nombre}»: probablemente no es su web.`);
        else if (!signals.productTerm) notes.push(`La web ${pageHost} nombra a la empresa, pero no menciona el producto.`);
        else {
          verified = true;
          website = new URL(page.finalUrl).origin + "/";
          finalUrl = page.finalUrl;
          spainOnPage = SPAIN.test(fold(text));
          notes.push(`Web leída (${pageHost}): nombra a la empresa y menciona el producto${signals.importTerm ? " y términos de importación o distribución" : ""}.`);
          if (spainOnPage) notes.push("La web menciona España.");
        }
        if (!verified) signals = null;
      }
    }

    const evidence: Evidence[] = verified && finalUrl ? [{
      url: finalUrl, title: (signals?.title ?? c.nombre).slice(0, 120), sourceType: "corporativa", howConsulted: "pagina_leida", consultedAt: day, claims: ["categoria"],
      summary: `Página leída automáticamente: nombra a la empresa y menciona el producto${signals?.importTerm ? " y términos de importación o distribución" : ""}. Comprobación automática, no revisada por una persona.`,
    }] : [];

    const ia: IaMeta = {
      verificacion: verified ? "verificada" : "sin_verificar", modelo: ctx.model, generadoEn: day, confianza: c.confianza,
      senalEspana: spainOnPage ? "en_web" : c.senalEspana === "si" ? "segun_ia" : "desconocida", auditoria: notes,
    };
    out.push({
      id, name: c.nombre.trim(), nameLocal: null, country: ctx.country, city: c.ciudad?.trim() || null,
      website, websiteStatus: verified ? "verificada" : "sin_verificar", type: c.tipo, brands: [],
      evidence,
      contact: verified && finalUrl ? {
        contactPageUrl: signals?.contactLinks[0] ?? null,
        phone: signals?.phones[0] ?? null, phoneSourceUrl: signals?.phones[0] ? finalUrl : null,
        email: signals?.genericEmails[0] ?? null, emailSourceUrl: signals?.genericEmails[0] ? finalUrl : null, emailScope: signals?.genericEmails[0] ? "general" : null,
      } : {},
      people: [], reason: `Sugerencia de IA: ${c.motivo.trim()}`,
      pending: verified ? ["Confirmar manualmente la actividad y el contacto", "Persona responsable: no recogida"] : ["Comprobar que la empresa existe y localizar su web oficial", "Confirmar manualmente su actividad con este producto"],
      notes: [], origin: "ia", ia,
    });
  }
  return { companies: out, discarded };
}

const REASON: Record<string, string> = {
  blocked_host: "dirección no permitida", robots: "su robots.txt no permite la lectura", http_error: "no respondió correctamente", not_html: "no es una página web",
  too_large: "página demasiado grande", timeout: "tiempo de espera agotado", network: "no se pudo conectar", bad_url: "dirección no válida",
};
