import { z } from "zod";

export const DATA_MODES = ["demo", "comext", "comtrade"] as const;
export type DataMode = (typeof DATA_MODES)[number];

export const flowSchema = z.enum(["import", "export"]);
export const statusSchema = z.enum(["observed", "estimated", "unavailable"]);

/** Observación comercial normalizada, independiente de la fuente. Datos anuales. */
export const observationSchema = z.object({
  period: z.string().regex(/^\d{4}$/, "Periodo anual AAAA"),
  reporterCode: z.string().min(2).max(8), // ISO2 del declarante
  partnerCode: z.string().min(2).max(8), // ISO2 o "WORLD"
  productCode: z.string().regex(/^\d{6}$/, "HS a 6 dígitos"),
  productName: z.string().nullable(),
  productClassification: z.string().min(1), // p. ej. HS2022
  flow: flowSchema,
  tradeValue: z.number().finite().nonnegative().nullable(),
  currency: z.enum(["EUR", "USD"]),
  netWeight: z.number().finite().nonnegative().nullable(), // kg
  quantity: z.number().finite().nullable(),
  quantityUnit: z.string().nullable(),
  source: z.string().min(1),
  retrievedAt: z.string().min(10),
  status: statusSchema,
  /** true solo en datos de demostración. */
  synthetic: z.boolean(),
});

export type TradeObservation = z.infer<typeof observationSchema>;
export type Flow = z.infer<typeof flowSchema>;
