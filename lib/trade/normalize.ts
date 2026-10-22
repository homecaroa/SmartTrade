import { observationSchema, type TradeObservation } from "@/lib/schemas/trade";

/** Versión HS vigente en un año (revisiones 2012, 2017, 2022). Series que cruzan revisiones no se combinan. */
export function hsVersionForYear(year: number): string {
  if (year >= 2022) return "HS2022";
  if (year >= 2017) return "HS2017";
  if (year >= 2012) return "HS2012";
  return "HS2007";
}

export const obsKey = (o: TradeObservation) =>
  [o.period, o.reporterCode, o.partnerCode, o.productCode, o.flow, o.productClassification, o.currency].join("|");

/** Elimina duplicados conservando la observación más reciente. */
export function dedupeObservations(obs: TradeObservation[]): { unique: TradeObservation[]; duplicates: number } {
  const map = new Map<string, TradeObservation>();
  let duplicates = 0;
  for (const o of obs) {
    const k = obsKey(o);
    const prev = map.get(k);
    if (prev) {
      duplicates++;
      if (o.retrievedAt > prev.retrievedAt) map.set(k, o);
    } else map.set(k, o);
  }
  return { unique: [...map.values()], duplicates };
}

export type Compat = { ok: true } | { ok: false; reason: string };

/** Comprueba que un conjunto de observaciones es comparable: mismo producto, clasificación, moneda y datos reales/sintéticos. */
export function checkCompatible(obs: TradeObservation[]): Compat {
  if (obs.length === 0) return { ok: true };
  const first = obs[0];
  const set = (f: (o: TradeObservation) => string) => new Set(obs.map(f));
  if (set((o) => o.productCode).size > 1) return { ok: false, reason: "Códigos de producto distintos" };
  const cls = set((o) => o.productClassification);
  if (cls.size > 1) return { ok: false, reason: `Clasificaciones incompatibles en la ventana (${[...cls].join(" vs ")})` };
  const cur = set((o) => o.currency);
  if (cur.size > 1) return { ok: false, reason: `Monedas distintas (${[...cur].join(", ")})` };
  if (set((o) => String(o.synthetic)).size > 1) return { ok: false, reason: "Mezcla de datos sintéticos y reales" };
  void first;
  return { ok: true };
}

/** Valida observaciones externas; las inválidas se descartan y se cuentan (no se reparan). */
export function parseObservations(raw: unknown[]): { valid: TradeObservation[]; invalid: number } {
  const valid: TradeObservation[] = [];
  let invalid = 0;
  for (const r of raw) {
    const p = observationSchema.safeParse(r);
    if (p.success) valid.push(p.data);
    else invalid++;
  }
  return { valid, invalid };
}

/** Valida el resultado de una fuente: descarta observaciones inválidas (p. ej. valores negativos) y lo advierte. */
export function validateSourceObservations<R extends { observations: unknown[]; warnings: string[] }>(
  r: R,
): Omit<R, "observations"> & { observations: TradeObservation[] } {
  const { valid, invalid } = parseObservations(r.observations);
  return {
    ...r,
    observations: valid,
    warnings: invalid ? [...r.warnings, `${invalid} observaciones inválidas descartadas por la validación de esquema.`] : r.warnings,
  };
}

/** Códigos solicitados que no aparecen en ninguna observación (sin datos para ese periodo/nomenclatura). */
export function missingProductCodes(requested: string[] | null, obs: { productCode: string }[]): string[] {
  if (!requested) return [];
  const present = new Set(obs.map((o) => o.productCode));
  return requested.filter((c) => !present.has(c));
}
