import type { Opportunity } from "./opportunities";

export interface RankFilters {
  q?: string;
  market?: string;
  minSizeM?: number; // millones de la moneda de la fuente
  minGrowth?: number; // %
  sort: "score" | "size" | "growth";
  order: "asc" | "desc";
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function matchesQuery(o: Opportunity, q?: string): boolean {
  if (!q) return true;
  const tokens = q.split(/[,\s;]+/).filter(Boolean);
  if (tokens.every((t) => /^\d+$/.test(t))) return tokens.some((t) => o.productCode.startsWith(t));
  return fold(o.productName).includes(fold(q)) || o.productCode.startsWith(q.trim());
}

/** Filtra y ordena. Solo las oportunidades completas con puntuación entran en el ranking. Desempate por id: reproducible. */
export function rankOpportunities(all: Opportunity[], f: RankFilters): Opportunity[] {
  const rows = all.filter((o) => {
    if (!o.complete || !o.score) return false;
    if (!matchesQuery(o, f.q)) return false;
    if (f.market && o.marketCode !== f.market) return false;
    if (f.minSizeM && (o.marketSize ?? 0) < f.minSizeM * 1e6) return false;
    if (f.minGrowth !== undefined && (o.cagr ?? -Infinity) < f.minGrowth) return false;
    return true;
  });
  const val = (o: Opportunity) => (f.sort === "score" ? o.score!.total : f.sort === "size" ? o.marketSize! : o.cagr!);
  const dir = f.order === "asc" ? 1 : -1;
  return rows.sort((a, b) => dir * (val(a) - val(b)) || a.id.localeCompare(b.id));
}

export function filterIncomplete(all: Opportunity[], f: Pick<RankFilters, "q" | "market">): Opportunity[] {
  return all.filter((o) => !o.complete && matchesQuery(o, f.q) && (!f.market || o.marketCode === f.market));
}
