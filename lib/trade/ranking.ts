import { resolveProductQuery } from "./product-search";
import type { RankingLens } from "@/lib/scoring/score";
import type { Opportunity } from "./opportunities";

export interface RankFilters {
  q?: string;
  market?: string;
  minSizeM?: number; // millones de la moneda de la fuente
  minGrowth?: number; // %
  /** Uno de los dos rankings, o el crecimiento pasado como orden informativo (no validado como señal). */
  sort: RankingLens | "growth";
  order: "asc" | "desc";
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function matchesQuery(o: Opportunity, q?: string): boolean {
  if (!q) return true;
  if (/sector:/i.test(q)) return resolveProductQuery(q).codes.includes(o.productCode);
  const tokens = q.split(/[,\s;]+/).filter(Boolean);
  if (tokens.every((t) => /^\d+$/.test(t))) return tokens.some((t) => o.productCode.startsWith(t));
  return fold(o.productName).includes(fold(q)) || o.productCode.startsWith(q.trim());
}

/** Filtra y ordena. Solo las oportunidades completas (con sus índices) entran en el ranking. Desempate por id: reproducible. */
export function rankOpportunities(all: Opportunity[], f: RankFilters): Opportunity[] {
  const rows = all.filter((o) => {
    if (!o.complete || !o.score) return false;
    if (!matchesQuery(o, f.q)) return false;
    if (f.market && o.marketCode !== f.market) return false;
    if (f.minSizeM && (o.marketSize ?? 0) < f.minSizeM * 1e6) return false;
    if (f.minGrowth !== undefined && (o.cagr ?? -Infinity) < f.minGrowth) return false;
    return true;
  });
  // «volumen» ordena por tamaño real (no por su percentil) para desempatar mejor; el orden es el mismo.
  const val = (o: Opportunity) => (f.sort === "volumen" ? o.marketSize! : f.sort === "potencial" ? o.score!.potencial : o.cagr!);
  const dir = f.order === "asc" ? 1 : -1;
  return rows.sort((a, b) => dir * (val(a) - val(b)) || a.id.localeCompare(b.id));
}

export function filterIncomplete(all: Opportunity[], f: Pick<RankFilters, "q" | "market">): Opportunity[] {
  return all.filter((o) => !o.complete && matchesQuery(o, f.q) && (!f.market || o.marketCode === f.market));
}

export type LensRanks = Record<RankingLens, number | null>;

/** Puesto de una oportunidad en cada ranking, dentro de las oportunidades completas de la carga de datos. */
export function lensRanks(all: Opportunity[], id: string): LensRanks {
  const pos = (lens: RankingLens) => { const i = rankOpportunities(all, { sort: lens, order: "desc" }).findIndex((o) => o.id === id); return i >= 0 ? i + 1 : null; };
  return { volumen: pos("volumen"), potencial: pos("potencial") };
}
