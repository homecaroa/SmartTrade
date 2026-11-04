import { HS_CATALOG, hs6Of, isNc8, NC8_CATALOG, type HsEntry } from "@/lib/config/hs-catalog";
import { sectorById } from "@/lib/config/sectors";

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
/** Palabras vacías de 3+ letras: sin esto «Ribera del Duero» exigía encontrar «del» en el producto y no daba nada. */
const STOP = new Set(["del", "las", "los", "con", "para", "the", "and"]);
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

const INDEX = [...HS_CATALOG, ...NC8_CATALOG].map((e) => ({ e, ws: words(`${e.name} ${e.keywords}`).map(stem) }));

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const maxTypos = (w: string) => (w.length >= 8 ? 2 : w.length >= 5 ? 1 : 0);

/** Búsqueda aproximada: cada palabra puede diferir en 1-2 letras de alguna palabra del producto (solo palabras de 5+ letras). */
export function searchCatalogFuzzy(text: string): HsEntry[] {
  const qs = words(text).map(stem);
  if (qs.length === 0 || qs.some((q) => maxTypos(q) === 0)) return [];
  return INDEX.filter(({ ws }) => qs.every((q) => ws.some((w) => distance(q, w.slice(0, q.length)) <= maxTypos(q) || distance(q, w) <= maxTypos(q)))).map(({ e }) => e);
}

/** Todas las palabras de la búsqueda deben aparecer (singular/plural tolerado) en el nombre o las palabras clave. */
export function searchCatalog(text: string): HsEntry[] {
  const qs = words(text).map(stem);
  if (qs.length === 0) return [];
  return INDEX.filter(({ ws }) => qs.every((q) => ws.some((w) => w.startsWith(q) || (q.length >= 4 && q.startsWith(w) && w.length >= 4)))).map(({ e }) => e);
}

/**
 * Interpreta la consulta: códigos HS6 o NC8, prefijos numéricos (2-5 dígitos) y nombres de producto, separados por comas.
 * `nc8`: si se admiten subcategorías NC8 (8 dígitos). Solo Eurostat Comext (mercados de la UE) las publica; con
 * `nc8: false` (UN Comtrade, fuera de la UE) cada NC8 se sustituye por su partida HS6 y se dice en la nota.
 * Una búsqueda por nombre que encuentra una partida HS6 Y subcategorías suyas se queda con la partida (sumar ambas
 * contaría dos veces el mismo comercio) y avisa de que hay subcategorías.
 */
export function resolveProductQuery(q?: string, opts: { nc8: boolean } = { nc8: true }): ProductResolution {
  const out: ProductResolution = { codes: [], notes: [], unmatched: [], tooMany: false };
  const seen = new Set<string>();
  const add = (c: string) => { if (!seen.has(c)) { seen.add(c); out.codes.push(c); } };
  for (const piece of (q ?? "").split(/[,;]+/).map((p) => p.trim()).filter(Boolean)) {
    const sec = /^sector:([a-z0-9-]+)$/i.exec(piece);
    if (sec) {
      const sector = sectorById(sec[1].toLowerCase());
      if (sector) { sector.codes.forEach(add); out.notes.push(`Sector «${sector.name}» → ${sector.codes.length} productos`); }
      else out.unmatched.push(piece);
      continue;
    }
    const tokens = piece.split(/\s+/);
    if (tokens.every((t) => /^\d+$/.test(t))) {
      for (const t of tokens) {
        if (t.length === 6) add(t);
        else if (t.length === 8) {
          if (opts.nc8) add(t);
          else { add(hs6Of(t)); out.notes.push(`«${t}» → ${hs6Of(t)} (fuera de la UE solo hay datos a 6 dígitos: se usa la partida general)`); }
        } else if (t.length >= 2 && t.length < 6) {
          const hits = HS_CATALOG.filter((e) => e.code.startsWith(t)); // solo HS6: con las NC8 se solaparían con su partida
          if (hits.length) { hits.forEach((h) => add(h.code)); out.notes.push(`«${t}» → ${hits.map((h) => h.code).join(", ")}`); }
          else out.unmatched.push(t);
        } else out.unmatched.push(t);
      }
      continue;
    }
    let hits = searchCatalog(piece);
    let approx = false;
    if (hits.length === 0) { hits = searchCatalogFuzzy(piece); approx = hits.length > 0; }
    if (hits.length) {
      const hs6Hits = new Set(hits.filter((h) => !isNc8(h.code)).map((h) => h.code));
      const covered = hits.filter((h) => isNc8(h.code) && hs6Hits.has(hs6Of(h.code)));
      const kept = hits.filter((h) => !covered.includes(h));
      const extra: string[] = [];
      if (covered.length && opts.nc8) extra.push(`hay subcategorías más precisas (solo UE), p. ej. «${covered[0].name}»: búscalas por su nombre`);
      let shown = kept.map((h) => `${h.code} ${h.name}`);
      if (!opts.nc8 && kept.some((h) => isNc8(h.code))) {
        const parents = [...new Set(kept.map((h) => hs6Of(h.code)))];
        parents.forEach(add);
        shown = parents.map((c) => `${c} ${HS_CATALOG.find((e) => e.code === c)?.name ?? ""}`.trim());
        extra.push("fuera de la UE solo hay datos a 6 dígitos: se usa la partida general, que incluye más que lo buscado");
      } else kept.forEach((h) => add(h.code));
      out.notes.push(`«${piece}»${approx ? " (coincidencia aproximada: comprueba que es lo que buscabas)" : ""} → ${shown.join("; ")}${extra.length ? ` (${extra.join("; ")})` : ""}`);
    } else out.unmatched.push(piece);
  }
  const overlap = out.codes.filter((c) => isNc8(c) && out.codes.includes(hs6Of(c)));
  if (overlap.length) out.notes.push(`${overlap.join(", ")} ${overlap.length > 1 ? "están incluidos" : "está incluido"} en su partida HS6, también pedida: no sumes sus cifras`);
  out.tooMany = out.codes.length > MAX_CODES;
  return out;
}
