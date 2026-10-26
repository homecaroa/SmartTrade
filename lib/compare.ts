import { productLabel } from "@/lib/config/hs-catalog";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { buildMarketAccess } from "@/lib/market-access";
import { describeOpportunity } from "@/lib/scoring/labels";
import { idSchema } from "@/lib/schemas/query";
import type { Opportunity } from "@/lib/trade/opportunities";

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 5;

export type CompareIds = { ok: true; ids: string[] } | { ok: false; error: string };

/** Valida la selección: 2-5 identificadores únicos con formato válido y el mismo año final. */
export function parseCompareIds(raw: string | string[] | undefined): CompareIds {
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((s) => s.split(","));
  const ids = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  if (ids.some((i) => !idSchema.safeParse(i).success)) return { ok: false, error: "La selección contiene identificadores no válidos." };
  if (ids.length < MIN_COMPARE) return { ok: false, error: `Marca al menos ${MIN_COMPARE} resultados del ranking para compararlos.` };
  if (ids.length > MAX_COMPARE) return { ok: false, error: `Se pueden comparar como máximo ${MAX_COMPARE} resultados a la vez.` };
  if (new Set(ids.map((i) => i.slice(-4))).size > 1) return { ok: false, error: "Los resultados deben tener el mismo año final para ser comparables." };
  return { ok: true, ids };
}

export interface CompareRow { key: string; label: string; cells: string[] }

const pct = (o: Opportunity, k: string) => {
  const c = o.score?.components.find((x) => x.key === k);
  return c ? `${Math.round(c.normalized)}` : "n.d.";
};

/** Filas de la tabla comparativa. Los datos ausentes se muestran como «n.d.», nunca como cero. */
export function buildComparison(items: { opp: Opportunity; rank: number | null }[]): CompareRow[] {
  const row = (key: string, label: string, f: (o: Opportunity, rank: number | null) => string): CompareRow => ({ key, label, cells: items.map((i) => f(i.opp, i.rank)) });
  return [
    row("producto", "Producto", (o) => `${productLabel(o.productCode, o.productName).title} (HS ${o.productCode})`),
    row("mercado", "Mercado de destino", (o) => o.marketName),
    row("posicion", "Posición en el ranking", (_o, r) => (r ? `${r}` : "fuera del ranking")),
    row("puntuacion", "Puntuación (0-100)", (o) => (o.score ? fmtNum(o.score.total, 1) : "n.d. (incompleta)")),
    row("importaciones", "Importaciones del mercado", (o) => `${fmtMoney(o.marketSize, o.currency)} (${o.endYear})`),
    row("cagr", "Crecimiento anual compuesto (en valor)", (o) => fmtPct(o.cagr)),
    row("cagr_vol", "Crecimiento anual en volumen (peso neto)", (o) => fmtPct(o.cagrVolume ?? null)),
    row("cuota", "Cuota española", (o) => fmtPct(o.spanishShare)),
    row("exportaciones", "Exportaciones españolas del producto al mundo", (o) => fmtMoney(o.spainExportsWorld, o.currency)),
    row("p_tamano", "Percentil de tamaño", (o) => pct(o, "size")),
    row("p_crecimiento", "Percentil de crecimiento", (o) => pct(o, "growth")),
    row("p_expansion", "Percentil de expansión de cuota", (o) => pct(o, "expansion")),
    row("p_exportacion", "Percentil de posición exportadora", (o) => pct(o, "export")),
    row("etiquetas", "Etiquetas", (o) => describeOpportunity(o).tags.map((t) => t.label).join(", ") || "—"),
    row("calidad", "Calidad de los datos", (o) => o.quality),
    row("arancel", "Aranceles de importación", (o) => {
      const a = buildMarketAccess({ marketCode: o.marketCode, marketName: o.marketName, productCode: o.productCode, synthetic: o.synthetic }).items[0];
      return a.status === "pending" ? "Pendiente de consulta" : "Parcial: regla general UE, confirmar";
    }),
  ];
}
