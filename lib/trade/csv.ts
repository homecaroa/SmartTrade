import type { Opportunity } from "./opportunities";

/**
 * Columnas del CSV. Desde el 06/11/2026 no hay índices ni percentiles: solo indicadores descriptivos en su unidad.
 * «posicion» es el puesto en la métrica elegida en pantalla, entre los mercados del MISMO producto.
 * «socio_espana_es» dice qué significan las columnas con socio España: «expedicion» (mercados de la UE en Eurostat: lo
 * expedido desde España, no necesariamente de origen español) u «origen».
 */
const HEADER = [
  "posicion", "metrica_orden", "codigo_producto", "producto", "clasificacion", "mercado_codigo", "mercado", "ventana_inicio", "anio_final",
  "importaciones", "moneda", "variacion_interanual_pct", "crecimiento_cagr_pct", "peso_neto_kg", "crecimiento_volumen_cagr_pct",
  "importaciones_socio_espana", "participacion_espana_pct", "variacion_participacion_pp", "socio_espana_es", "exportaciones_espana_mundo",
  "serie_completa", "calidad", "fuente", "fecha_obtencion", "datos_sinteticos",
];

/** Neutraliza inyección de fórmulas en hojas de cálculo y escapa comillas. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const r = (n: number | null, d = 2) => (n === null ? null : Number(n.toFixed(d)));

export function opportunitiesToCsv(rows: Opportunity[], metric = "valor"): string {
  const lines = [HEADER.join(",")];
  rows.forEach((o, i) => {
    lines.push(
      [
        i + 1, metric, o.productCode, o.productName, o.classification, o.marketCode, o.marketName, o.importsSeries[0]?.year ?? null, o.endYear,
        o.marketSize, o.currency, r(o.yoyChange), r(o.cagr), o.netWeightEndYear, r(o.cagrVolume),
        o.spainValue, r(o.spanishShare), r(o.spanishShareChangePp), o.partnerBasis, o.spainExportsWorld,
        o.complete ? "si" : "no", o.quality, o.source, o.retrievedAt,
        o.synthetic ? "SI_DEMO_SINTETICO" : "no",
      ].map(csvCell).join(","),
    );
  });
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
