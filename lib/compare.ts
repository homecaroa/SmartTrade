import { codeLabel, productLabel } from "@/lib/config/hs-catalog";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { buildMarketAccess } from "@/lib/market-access";
import { readMarket } from "@/lib/trade/diagnosis";
import { idSchema } from "@/lib/schemas/query";
import type { Opportunity } from "@/lib/trade/opportunities";
import { METRICS, type Position, type RankMetric } from "@/lib/trade/ranking";

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 5;

export type CompareIds = { ok: true; ids: string[] } | { ok: false; error: string };

/** Valida la selección: 2-5 identificadores únicos con formato válido y el mismo año final. */
export function parseCompareIds(raw: string | string[] | undefined): CompareIds {
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((s) => s.split(","));
  const ids = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  if (ids.some((i) => !idSchema.safeParse(i).success)) return { ok: false, error: "La selección contiene identificadores no válidos." };
  if (ids.length < MIN_COMPARE) return { ok: false, error: `Marca al menos ${MIN_COMPARE} mercados de la lista para compararlos.` };
  if (ids.length > MAX_COMPARE) return { ok: false, error: `Se pueden comparar como máximo ${MAX_COMPARE} resultados a la vez.` };
  if (new Set(ids.map((i) => i.slice(-4))).size > 1) return { ok: false, error: "Los resultados deben tener el mismo año final para ser comparables." };
  return { ok: true, ids };
}

export interface CompareRow { key: string; label: string; cells: string[] }

type Positions = Record<RankMetric, Position | null>;
const signed = (v: number | null, unit: string) => (v === null ? "n.d." : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), 1)} ${unit}`);
const pos = (p: Position | null) => (p ? `${p.position} de ${p.of}` : "sin dato");

/**
 * Filas de la tabla comparativa: solo indicadores descriptivos en su unidad (desde el 06/11/2026 no hay índices).
 * Los datos ausentes se muestran como «n.d.», nunca como cero. Los puestos son entre los mercados de cada producto.
 */
export function buildComparison(items: { opp: Opportunity; positions: Positions }[]): CompareRow[] {
  const row = (key: string, label: string, f: (o: Opportunity, p: Positions) => string): CompareRow => ({ key, label, cells: items.map((i) => f(i.opp, i.positions)) });
  return [
    row("producto", "Producto", (o) => `${productLabel(o.productCode, o.productName).title} (${codeLabel(o.productCode)})`),
    row("mercado", "Mercado de destino", (o) => o.marketName),
    row("importaciones", "Importaciones del mercado", (o) => `${fmtMoney(o.marketSize, o.currency)} (${o.endYear})`),
    row("interanual", "Variación respecto al año anterior", (o) => signed(o.yoyChange, "%")),
    row("cagr", "Crecimiento anual compuesto (en valor)", (o) => (o.complete ? fmtPct(o.cagr) : "n.d. (serie incompleta)")),
    row("cagr_vol", "Crecimiento anual en volumen (peso neto)", (o) => fmtPct(o.cagrVolume ?? null)),
    row("espana", "Importaciones con socio España", (o) => `${fmtMoney(o.spainValue, o.currency)}${o.partnerBasis === "expedicion" ? " (expedido desde España)" : ""}`),
    row("cuota", "Participación de España", (o) => fmtPct(o.spanishShare)),
    row("cuota_var", "Variación de esa participación en la ventana", (o) => signed(o.spanishShareChangePp, "puntos")),
    row("pos_valor", `Puesto por ${METRICS.valor.label.toLowerCase()} (entre los mercados del producto)`, (_o, p) => pos(p.valor)),
    row("exportaciones", "Exportaciones españolas del producto al mundo", (o) => fmtMoney(o.spainExportsWorld, o.currency)),
    row("avisos", "Avisos", (o) => readMarket(o).cautions.map((c) => c.label).join(", ") || "—"),
    row("calidad", "Calidad de los datos", (o) => o.quality),
    row("arancel", "Aranceles de importación", (o) => {
      const a = buildMarketAccess({ marketCode: o.marketCode, marketName: o.marketName, productCode: o.productCode, synthetic: o.synthetic }).items[0];
      return a.status === "pending" ? "Pendiente de consulta" : "Parcial: regla general UE, confirmar";
    }),
  ];
}
