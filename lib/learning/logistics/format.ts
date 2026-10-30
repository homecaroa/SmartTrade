import type { Range } from "./types";

/** Formato de rangos: los importes simulados se muestran como «mín – máx», nunca como una cifra exacta. */
const EUR0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUR2 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Importes grandes sin céntimos (son estimaciones); los unitarios con dos decimales. */
export function fmtRangeEur(r: Range, decimals: 0 | 2 = 0): string {
  const f = decimals ? EUR2 : EUR0;
  return r.min === r.max ? f.format(r.min) : `${f.format(r.min)} – ${f.format(r.max)}`;
}
export const fmtDays = (r: Range) => (r.min === r.max ? `${r.min} ${r.min === 1 ? "día" : "días"}` : `${r.min}–${r.max} días`);
export const fmtPctRange = (r: Range) => `${r.min.toLocaleString("es-ES", { maximumFractionDigits: 1 })}–${r.max.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
