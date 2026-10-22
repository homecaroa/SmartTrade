import { HS_CATALOG, type HsEntry } from "@/lib/config/hs-catalog";

export const MAX_CODES = 20;

export interface ProductResolution {
  codes: string[];
  /** Cómo se ha interpretado cada término (para mostrarlo al usuario). */
  notes: string[];
  /** Términos que no se han podido interpretar. */
  unmatched: string[];
  /** Término que ha producido más resultados de los admitidos. */
  tooMany: boolean;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const stem = (w: string) => w.replace(/(es|s)$/, "");
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

const INDEX = HS_CATALOG.map((e) => ({ e, ws: words(`${e.name} ${e.keywords}`).map(stem) }));

/** Todas las palabras de la búsqueda deben aparecer (singular/plural tolerado) en el nombre o las palabras clave. */
export function searchCatalog(text: string): HsEntry[] {
  const qs = words(text).map(stem);
  if (qs.length === 0) return [];
  return INDEX.filter(({ ws }) => qs.every((q) => ws.some((w) => w.startsWith(q) || (q.length >= 4 && q.startsWith(w) && w.length >= 4)))).map(({ e }) => e);
}

/** Interpreta la consulta: códigos HS6, prefijos numéricos (2-5 dígitos) y nombres de producto, separados por comas. */
export function resolveProductQuery(q?: string): ProductResolution {
  const out: ProductResolution = { codes: [], notes: [], unmatched: [], tooMany: false };
  const seen = new Set<string>();
  const add = (c: string) => { if (!seen.has(c)) { seen.add(c); out.codes.push(c); } };
  for (const piece of (q ?? "").split(/[,;]+/).map((p) => p.trim()).filter(Boolean)) {
    const tokens = piece.split(/\s+/);
    if (tokens.every((t) => /^\d+$/.test(t))) {
      for (const t of tokens) {
        if (t.length === 6) add(t);
        else if (t.length >= 2 && t.length < 6) {
          const hits = HS_CATALOG.filter((e) => e.code.startsWith(t));
          if (hits.length) { hits.forEach((h) => add(h.code)); out.notes.push(`«${t}» → ${hits.map((h) => h.code).join(", ")}`); }
          else out.unmatched.push(t);
        } else out.unmatched.push(t);
      }
      continue;
    }
    const hits = searchCatalog(piece);
    if (hits.length) {
      hits.forEach((h) => add(h.code));
      out.notes.push(`«${piece}» → ${hits.map((h) => `${h.code} ${h.name}`).join("; ")}`);
    } else out.unmatched.push(piece);
  }
  out.tooMany = out.codes.length > MAX_CODES;
  return out;
}
