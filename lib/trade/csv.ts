import type { Opportunity } from "./opportunities";

const HEADER = [
  "posicion", "codigo_producto", "producto", "clasificacion", "mercado_codigo", "mercado", "anio_final",
  "importaciones", "moneda", "crecimiento_cagr_pct", "cuota_espana_pct", "exportaciones_espana_mundo",
  "puntuacion", "calidad", "fuente", "fecha_obtencion", "datos_sinteticos",
  "ventana_inicio", "universo_oportunidades", "universo_productos",
  "percentil_tamano", "percentil_crecimiento", "percentil_expansion", "percentil_exportacion",
];

/** Neutraliza inyección de fórmulas en hojas de cálculo y escapa comillas. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const pct = (o: Opportunity, k: string) => {
  const c = o.score?.components.find((x) => x.key === k);
  return c ? Number(c.normalized.toFixed(1)) : null;
};

const r = (n: number | null, d = 2) => (n === null ? null : Number(n.toFixed(d)));

export function opportunitiesToCsv(rows: Opportunity[]): string {
  const lines = [HEADER.join(",")];
  rows.forEach((o, i) => {
    lines.push(
      [
        i + 1, o.productCode, o.productName, o.classification, o.marketCode, o.marketName, o.endYear,
        o.marketSize, o.currency, r(o.cagr), r(o.spanishShare), o.spainExportsWorld,
        o.score ? r(o.score.total, 1) : null, o.quality, o.source, o.retrievedAt,
        o.synthetic ? "SI_DEMO_SINTETICO" : "no",
        o.importsSeries[0]?.year ?? null, o.score?.universeSize ?? null, o.score?.productUniverseSize ?? null,
        pct(o, "size"), pct(o, "growth"), pct(o, "expansion"), pct(o, "export"),
      ].map(csvCell).join(","),
    );
  });
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
