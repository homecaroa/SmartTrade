import { z } from "zod";
import { SourceError } from "./types";

/** Subconjunto de JSON-stat 2.0 necesario para respuestas de la API de Eurostat. */
const dimSchema = z.object({
  category: z.object({
    index: z.union([z.array(z.string()), z.record(z.string(), z.number())]),
    label: z.record(z.string(), z.string()).optional(),
  }),
});

export const jsonStatSchema = z.object({
  id: z.array(z.string()),
  size: z.array(z.number().int().nonnegative()),
  dimension: z.record(z.string(), dimSchema),
  value: z.union([z.array(z.number().nullable()), z.record(z.string(), z.number().nullable())]),
  status: z.union([z.array(z.string().nullable()), z.record(z.string(), z.string())]).optional(),
});
export type JsonStat = z.infer<typeof jsonStatSchema>;

export interface Cell {
  coords: Record<string, string>;
  labels: Record<string, string | undefined>;
  value: number;
  status: string | null;
}

export function parseJsonStat(raw: unknown): JsonStat {
  const p = jsonStatSchema.safeParse(raw);
  if (!p.success) throw new SourceError("parse", "La respuesta no tiene el formato JSON-stat esperado");
  const js = p.data;
  if (js.id.length !== js.size.length) throw new SourceError("parse", "JSON-stat inconsistente: id y size no coinciden");
  for (const id of js.id) if (!js.dimension[id]) throw new SourceError("parse", `JSON-stat sin definición de la dimensión ${id}`);
  return js;
}

function codesOf(js: JsonStat, dim: string): string[] {
  const idx = js.dimension[dim].category.index;
  if (Array.isArray(idx)) return idx;
  const arr: string[] = [];
  for (const [code, pos] of Object.entries(idx)) arr[pos] = code;
  return arr;
}

/** Itera solo las celdas con valor: una celda ausente NO se convierte en cero. */
export function* iterateCells(js: JsonStat): Generator<Cell> {
  const codes = js.id.map((d) => codesOf(js, d));
  const entries: [number, number | null][] = Array.isArray(js.value)
    ? js.value.map((v, i) => [i, v] as [number, number | null])
    : Object.entries(js.value).map(([k, v]) => [Number(k), v] as [number, number | null]);
  for (const [flat, value] of entries) {
    if (value === null || !Number.isFinite(value)) continue;
    let rem = flat;
    const coords: Record<string, string> = {};
    const labels: Record<string, string | undefined> = {};
    for (let i = js.id.length - 1; i >= 0; i--) {
      const pos = rem % js.size[i];
      rem = Math.floor(rem / js.size[i]);
      const code = codes[i][pos];
      coords[js.id[i]] = code;
      labels[js.id[i]] = js.dimension[js.id[i]].category.label?.[code];
    }
    const st = Array.isArray(js.status) ? js.status[flat] : js.status?.[String(flat)];
    yield { coords, labels, value, status: st ?? null };
  }
}
