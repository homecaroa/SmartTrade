import { z } from "zod";

const empty = (v: unknown) => (v === "" || v === null ? undefined : v);

export const querySchema = z.object({
  q: z.preprocess(empty, z.string().trim().max(80).optional()),
  market: z.preprocess(empty, z.string().regex(/^[A-Z]{2}$/).optional()),
  year: z.preprocess(empty, z.coerce.number().int().min(2018).max(2025).optional()),
  minSize: z.preprocess(empty, z.coerce.number().min(0).max(1e9).default(0)), // millones
  minGrowth: z.preprocess(empty, z.coerce.number().min(-100).max(10000).optional()), // %
  fuente: z.preprocess(empty, z.enum(["ue", "fuera"]).optional()), // "fuera" = mercados fuera de la UE (UN Comtrade)
  sort: z.preprocess(empty, z.enum(["score", "size", "growth"]).default("score")),
  order: z.preprocess(empty, z.enum(["asc", "desc"]).default("desc")),
  page: z.preprocess(empty, z.coerce.number().int().min(1).max(10000).default(1)),
  pageSize: z.preprocess(empty, z.coerce.number().int().min(5).max(50).default(20)),
});
export type OpportunityQuery = z.infer<typeof querySchema>;

type Raw = Record<string, string | string[] | undefined>;

export function parseQuery(raw: Raw) {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) flat[k] = Array.isArray(v) ? v[0] : v;
  return querySchema.safeParse(flat);
}

export const idSchema = z.string().regex(/^\d{6}-[A-Z]{2}-\d{4}$/);
