/** Extracción de señales de una página HTML. Pura: no hace red. Solo señales verificables, nunca correos inferidos. */
export interface PageSignals {
  title: string | null;
  productTerm: boolean;
  importTerm: boolean;
  /** Correos públicos de la página que parecen genéricos (info@, ventas@…), nunca personales. */
  genericEmails: string[];
  phones: string[];
  contactLinks: string[];
}

const IMPORT_TERMS = [/\bimport(er|ers|ador|adores|ing|s)?\b/i, /\bdistribut(or|ors|eur|ion)\b/i, /\bdistribuidor(es)?\b/i, /\bwholesal(er|e)\b/i, /\bmayorista\b/i, /輸入/, /インポーター/, /総代理店/, /卸売/];
export const GENERIC_LOCALPARTS = ["info", "contact", "contacto", "contacts", "sales", "ventas", "export", "import", "imports", "hello", "office", "enquiries", "inquiries", "eigyo", "customer", "support", "service", "mail", "admin", "purchasing", "buyer", "trade"];

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function htmlToText(html: string): string {
  return decode(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function extractSignals(html: string, baseUrl: string, productTerms: string[]): PageSignals {
  const text = htmlToText(html);
  const lower = text.toLowerCase();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const emails = new Set<string>();
  for (const m of html.matchAll(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) emails.add(m[1].toLowerCase());
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) emails.add(m[0].toLowerCase());
  const genericEmails = [...emails].filter((e) => GENERIC_LOCALPARTS.includes(e.split("@")[0])).slice(0, 3);
  const phones = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([+\d][\d\s\-().]{6,20}\d)["']/gi)) phones.add(m[1].trim());
  for (const m of text.matchAll(/(?:TEL|Tel\.?|電話|Phone|Teléfono)[:：\s]*([+\d][\d\s\-().]{6,18}\d)/g)) phones.add(m[1].trim());
  const links = new Set<string>();
  let host: string | null = null;
  try { host = new URL(baseUrl).hostname; } catch { /* sin base */ }
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!/(contact|inquir|お問い?合わせ|contacto|kontakt)/i.test(m[1] + " " + m[2])) continue;
    try {
      const u = new URL(m[1], baseUrl);
      if (/^https?:$/.test(u.protocol) && (!host || u.hostname === host)) links.add(u.toString());
    } catch { /* enlace no válido */ }
  }
  return {
    title: title ? htmlToText(title).slice(0, 160) : null,
    productTerm: productTerms.some((t) => t && lower.includes(t.toLowerCase())),
    importTerm: IMPORT_TERMS.some((r) => r.test(text)),
    genericEmails,
    phones: [...phones].slice(0, 3),
    contactLinks: [...links].slice(0, 3),
  };
}
