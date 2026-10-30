import { z } from "zod";

/**
 * Datos guardados («instantáneas») de las fuentes reales, uno por modo y código HS6, en data/snapshots/<modo>/<HS6>.json.
 * Los genera scripts/actualizar-datos.ts (cada dos meses, con GitHub Actions) y la web los lee sin consultar la fuente.
 * Las observaciones se guardan tal como las devolvió el adaptador: se validan con el esquema de siempre al cargarlas.
 */
export const SNAPSHOT_MODES = ["comext", "comtrade"] as const;
export type SnapshotMode = (typeof SNAPSHOT_MODES)[number];

export const snapshotFileSchema = z.object({
  v: z.literal(1),
  mode: z.enum(SNAPSHOT_MODES),
  code: z.string().regex(/^\d{6}$/),
  years: z.array(z.number().int()).min(1),
  generatedAt: z.string().datetime(),
  sourceLabel: z.string().min(1),
  warnings: z.array(z.string()),
  /** Se validan después con parseObservations (las inválidas se descartan con aviso, como en vivo). */
  observations: z.array(z.unknown()),
});
export type SnapshotFile = z.infer<typeof snapshotFileSchema>;

/**
 * Antigüedad a partir de la cual se avisa de que los datos guardados pueden estar desfasados: la actualización es cada
 * 2 meses (~61 días) y se deja un margen de 2 semanas para revisar y fusionar el PR. DECISIÓN DOCUMENTADA, no estimada.
 */
export const STALE_AFTER_DAYS = 75;
