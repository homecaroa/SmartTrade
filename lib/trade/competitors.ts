import type { TradeObservation } from "@/lib/schemas/trade";
import { unitValuePerKg } from "@/lib/scoring/indicators";
import type { YearValue } from "./opportunities";

/**
 * España frente a sus competidores en un mercado: cuota, variación de cuota y valor unitario de cada país proveedor.
 * Función pura sobre las importaciones bilaterales del mercado (reporter = mercado, partner = país proveedor).
 *
 * - Cuota = importaciones desde el país / importaciones totales del mercado ese año (la misma serie que el ranking).
 * - Variación de cuota = cuota del último año − cuota del primero de la ventana, en puntos porcentuales.
 * - Valor unitario = valor / peso neto del último año. Es un INDICIO, no un precio: dentro de un mismo código HS6 se
 *   mezclan calidades, formatos y envases. Diferencia con España = (valor unitario del país / el de España − 1) × 100.
 * Ausente ≠ cero: si falta un dato, el indicador es null y se muestra «n.d.».
 */
export interface CompetitorRow {
  code: string;
  name: string;
  isSpain: boolean;
  /** Puesto entre todos los proveedores del último año, por valor. */
  rank: number;
  value: number;
  sharePct: number | null;
  shareChangePp: number | null;
  netWeightKg: number | null;
  unitValue: number | null;
  /** Diferencia de valor unitario frente a España, en %. null para España o si falta alguno de los dos. */
  unitValueVsSpainPct: number | null;
  weightEstimated: boolean;
}

export interface CompetitorAnalysis {
  startYear: number;
  endYear: number;
  rows: CompetitorRow[];
  spain: CompetitorRow | null;
  suppliersCount: number;
  /** Cuota de los tres mayores proveedores del último año (concentración). */
  top3SharePct: number | null;
}

export interface CompetitorInput {
  observations: TradeObservation[];
  /** Importaciones totales del mercado por año (Opportunity.importsSeries). */
  totals: YearValue[];
  names: (code: string, fallback?: string | null) => string;
  currency: "EUR" | "USD" | null;
  origin?: string;
  /** Número de proveedores principales que se muestran (España se añade aparte si no está entre ellos). */
  top?: number;
}

const valid = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

export function buildCompetitors(input: CompetitorInput): CompetitorAnalysis | null {
  const origin = input.origin ?? "ES";
  const years = input.totals.map((t) => t.year);
  if (!years.length) return null;
  const startYear = years[0];
  const endYear = years[years.length - 1];
  const totalOf = (y: number) => input.totals.find((t) => t.year === y)?.value ?? null;

  // Índice partner → año → observación. Solo importaciones del mercado, misma moneda, valores positivos.
  const byPartner = new Map<string, Map<number, TradeObservation>>();
  for (const o of input.observations) {
    if (o.flow !== "import" || !valid(o.tradeValue) || o.tradeValue <= 0) continue;
    if (input.currency && o.currency !== input.currency) continue;
    const y = Number(o.period);
    if (!years.includes(y)) continue;
    if (!byPartner.has(o.partnerCode)) byPartner.set(o.partnerCode, new Map());
    byPartner.get(o.partnerCode)!.set(y, o);
  }
  const share = (v: number | null | undefined, y: number) => {
    const t = totalOf(y);
    return valid(v) && valid(t) && t > 0 && v <= t * 1.0000001 ? (v / t) * 100 : null;
  };

  const endRows = [...byPartner.entries()]
    .map(([code, ys]) => ({ code, end: ys.get(endYear), start: ys.get(startYear) }))
    .filter((r): r is { code: string; end: TradeObservation; start: TradeObservation | undefined } => !!r.end)
    .sort((a, b) => b.end.tradeValue! - a.end.tradeValue!);
  if (!endRows.length) return null;

  const rows: CompetitorRow[] = endRows.map((r, i) => {
    const s = share(r.end.tradeValue, endYear);
    const s0 = r.start ? share(r.start.tradeValue, startYear) : null;
    return {
      code: r.code,
      name: input.names(r.code, r.end.partnerName),
      isSpain: r.code === origin,
      rank: i + 1,
      value: r.end.tradeValue!,
      sharePct: s,
      shareChangePp: valid(s) && valid(s0) && startYear !== endYear ? s - s0 : null,
      netWeightKg: r.end.netWeight ?? null,
      unitValue: unitValuePerKg(r.end.tradeValue, r.end.netWeight ?? null),
      unitValueVsSpainPct: null,
      weightEstimated: r.end.netWeightEstimated === true,
    };
  });
  const spain = rows.find((r) => r.isSpain) ?? null;
  for (const r of rows) {
    if (!r.isSpain && spain && valid(r.unitValue) && valid(spain.unitValue) && spain.unitValue > 0) r.unitValueVsSpainPct = (r.unitValue / spain.unitValue - 1) * 100;
  }
  const top = input.top ?? 6;
  const shown = rows.slice(0, top);
  if (spain && !shown.includes(spain)) shown.push(spain);
  const t = totalOf(endYear);
  const top3 = rows.slice(0, 3).reduce((a, r) => a + r.value, 0);
  return {
    startYear, endYear, rows: shown, spain, suppliersCount: rows.length,
    top3SharePct: valid(t) && t > 0 && top3 <= t * 1.0000001 ? (top3 / t) * 100 : null,
  };
}
