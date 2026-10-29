import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { marketName } from "@/lib/config/catalog";
import { fmtEur } from "../../money";
import { incotermOf } from "../costs";
import type { DecisionCtx, Option } from "../types";

/** Ayudas comunes a los escenarios de exportación. */
export const productName = (hs6: string) => HS_CATALOG.find((e) => e.code === hs6)?.name ?? `HS ${hs6}`;
export const countryOf = (code: string) => marketName(code);
export const sellerCarries = (ctx: DecisionCtx) => !!ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).carriage === "vendedor";
export const sellerClearsExport = (ctx: DecisionCtx) => !!ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).exportClearance === "vendedor";
export const eur = fmtEur;

/** Opción con nota fija. */
export const opt = (id: string, label: string, grade: Option["grade"], feedback: Option["feedback"], cost?: Option["cost"]): Option => ({ id, label, grade, feedback, cost });
