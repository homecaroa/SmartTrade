import { readFileSync } from "node:fs";
import path from "node:path";
import { parseObservations } from "@/lib/trade/normalize";
import type { TradeObservation } from "@/lib/schemas/trade";
import { snapshotFileSchema, STALE_AFTER_DAYS, type SnapshotFile, type SnapshotMode } from "./schema";

/**
 * Lectura de los datos guardados (solo servidor). Un código sin fichero, con fichero inválido o que no cubre los años
 * pedidos se considera «no guardado» y se consulta en vivo como antes: los datos guardados nunca bloquean la web.
 */
export const snapshotDir = () => process.env.SMARTRADE_SNAPSHOT_DIR || path.join(process.cwd(), "data", "snapshots");

const memo = new Map<string, SnapshotFile | null>();
export const clearSnapshotMemo = () => memo.clear();

export function readSnapshot(mode: SnapshotMode, code: string, dir = snapshotDir()): SnapshotFile | null {
  const key = `${dir}|${mode}|${code}`;
  if (memo.has(key)) return memo.get(key)!;
  let out: SnapshotFile | null = null;
  try {
    const parsed = snapshotFileSchema.safeParse(JSON.parse(readFileSync(path.join(dir, mode, `${code}.json`), "utf8")));
    out = parsed.success && parsed.data.mode === mode && parsed.data.code === code ? parsed.data : null;
  } catch { out = null; }
  memo.set(key, out);
  return out;
}

export interface SnapshotLookup {
  observations: TradeObservation[];
  covered: string[];
  missing: string[];
  /** Fecha del fichero MÁS ANTIGUO usado: es la que se muestra, para no aparentar más actualidad de la real. */
  generatedAt: string | null;
  sourceLabel: string | null;
  warnings: string[];
}

export function lookupSnapshot(mode: SnapshotMode, years: number[], codes: string[], dir = snapshotDir()): SnapshotLookup {
  const covered: string[] = [];
  const missing: string[] = [];
  const raw: unknown[] = [];
  const warnings = new Set<string>();
  let oldest: string | null = null;
  let label: string | null = null;
  for (const code of codes) {
    const s = readSnapshot(mode, code, dir);
    if (!s || !years.every((y) => s.years.includes(y))) { missing.push(code); continue; }
    covered.push(code);
    label ??= s.sourceLabel;
    if (!oldest || s.generatedAt < oldest) oldest = s.generatedAt;
    s.warnings.forEach((w) => warnings.add(w));
    const wanted = new Set(years.map(String));
    raw.push(...s.observations.filter((o) => typeof o === "object" && o !== null && wanted.has(String((o as { period?: unknown }).period))));
  }
  const { valid, invalid } = parseObservations(raw);
  if (invalid) warnings.add(`${invalid} observaciones guardadas no superaron la validación de esquema y se descartaron.`);
  return { observations: valid, covered, missing, generatedAt: oldest, sourceLabel: label, warnings: [...warnings] };
}

export function snapshotAgeDays(generatedAt: string, now = Date.now()): number {
  return Math.floor((now - Date.parse(generatedAt)) / 86_400_000);
}
export const isSnapshotStale = (generatedAt: string, now = Date.now()) => snapshotAgeDays(generatedAt, now) > STALE_AFTER_DAYS;
