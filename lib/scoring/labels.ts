import type { Opportunity } from "@/lib/trade/opportunities";
import type { ComponentKey, ScoreResult } from "./score";
import { LENSES, LOW_EXPORT_PERCENTILE } from "./score";

/**
 * Etiquetas en lenguaje llano para cada oportunidad. Son un RESUMEN de reglas simples sobre los indicadores y
 * percentiles ya calculados: no añaden información nueva ni cambian los rankings. Los umbrales son fijos y documentados.
 * Las etiquetas «relativas» comparan con las oportunidades de la búsqueda actual, no con el mercado mundial.
 */
export const HIGH_PERCENTILE = 75;
export const FAST_GROWTH_MIN_CAGR = 5; // % anual compuesto mínimo para decir que «crece rápido», además de estar entre los mejores de la búsqueda
export const EXCEPTIONAL_GROWTH_CAGR = 30; // % anual compuesto a partir del cual se avisa de crecimiento excepcional
export const PRICE_EFFECT_GAP_PP = 15; // puntos por año de diferencia entre crecimiento en valor y en peso
export const SPANISH_PRESENCE_SHARE = 10; // % de cuota a partir del cual se dice que España ya vende en el mercado

export type TagTone = "positive" | "neutral" | "caution";
export interface Tag { key: string; label: string; tone: TagTone; hint: string }

export const TAG_LEGEND: Tag[] = [
  { key: "hueco", label: "Hueco de cuota", tone: "positive", hint: `Cuota española muy inferior a la que España tiene de media en este producto en los mercados de esta búsqueda (percentil de expansión ≥ ${HIGH_PERCENTILE}), y España ya exporta el producto. Es una señal para investigar, no demanda insatisfecha demostrada.` },
  { key: "grande", label: "Mercado grande", tone: "positive", hint: `Entre el ${100 - HIGH_PERCENTILE} % de mayores importaciones de esta búsqueda.` },
  { key: "crece", label: "Crece rápido", tone: "positive", hint: `Crecimiento anual compuesto de al menos ${FAST_GROWTH_MIN_CAGR} % y entre el ${100 - HIGH_PERCENTILE} % más alto de esta búsqueda.` },
  { key: "exporta", label: "España exporta mucho", tone: "positive", hint: `Exportaciones españolas del producto entre el ${100 - HIGH_PERCENTILE} % más altas de esta búsqueda.` },
  { key: "presencia", label: "España ya vende aquí", tone: "neutral", hint: `Cuota española de al menos ${SPANISH_PRESENCE_SHARE} % en este mercado.` },
  { key: "excepcional", label: "Crecimiento excepcional", tone: "caution", hint: `Crecimiento anual compuesto de al menos ${EXCEPTIONAL_GROWTH_CAGR} %: suele deberse a efectos puntuales (precios, cambios de clasificación, reexportaciones o de quién declara). Revisa la serie antes de fiarte.` },
  { key: "precio", label: "Posible efecto precio", tone: "caution", hint: `El valor importado crece al menos ${PRICE_EFFECT_GAP_PP} puntos al año más que el peso neto: parte del crecimiento puede deberse a precios o a un cambio en la composición del producto, no a más volumen.` },
  { key: "irregular", label: "Crecimiento irregular", tone: "caution", hint: "El crecimiento total es positivo, pero alguna variación anual fue negativa: puede depender de un año excepcional." },
  { key: "retroceso", label: "En retroceso", tone: "caution", hint: "Las importaciones del mercado han caído en la ventana analizada." },
  { key: "pocaexpo", label: "Poca exportación española", tone: "caution", hint: `Exportaciones españolas del producto por debajo del percentil ${LOW_EXPORT_PERCENTILE} de esta búsqueda: no hay capacidad exportadora observable que respalde la oportunidad, y su «Potencial de cuota» se limita a ${LOW_EXPORT_PERCENTILE}.` },
  { key: "reservas", label: "Datos con reservas", tone: "caution", hint: "Calidad de datos media o baja: revisa los avisos de la ficha." },
];
const TAG = Object.fromEntries(TAG_LEGEND.map((t) => [t.key, t])) as Record<string, Tag>;


export interface Description { tags: Tag[]; why: string }

export function describeOpportunity(o: Opportunity): Description {
  const sc: ScoreResult | null = o.score;
  if (!o.complete || !sc) return { tags: [], why: "" };
  const pct = (k: ComponentKey) => sc.components.find((c) => c.key === k)?.normalized;
  const has = (k: ComponentKey, min: number) => (pct(k) ?? -1) >= min;

  const tags: Tag[] = [];
  if (has("expansion", HIGH_PERCENTILE) && o.spanishShare !== null) tags.push(TAG.hueco);
  if (has("size", HIGH_PERCENTILE)) tags.push(TAG.grande);
  if (o.cagr !== null && o.cagr >= FAST_GROWTH_MIN_CAGR && has("growth", HIGH_PERCENTILE)) tags.push(TAG.crece);
  if (has("export", HIGH_PERCENTILE)) tags.push(TAG.exporta);
  if (o.spanishShare !== null && o.spanishShare >= SPANISH_PRESENCE_SHARE) tags.push(TAG.presencia);
  if (o.cagr !== null && o.cagr < 0) tags.push(TAG.retroceso);
  else if (o.cagr !== null && o.cagr > 0) {
    if (o.cagr >= EXCEPTIONAL_GROWTH_CAGR) tags.push(TAG.excepcional);
    if (o.cagrVolume != null && o.cagr - o.cagrVolume >= PRICE_EFFECT_GAP_PP) tags.push(TAG.precio);
    if (o.annualChanges.some((c) => c !== null && c < 0)) tags.push(TAG.irregular);
  }
  const ex = pct("export");
  // Estricto (<), igual que el tope del «Potencial de cuota» en score.ts. Hasta el 03/11/2026 era ≤: con 2 productos el
  // percentil vale 25 o 75, y el menos exportado salía con esta etiqueta y a la vez con potencial 99, sin tope.
  if (ex !== undefined && ex < LOW_EXPORT_PERCENTILE) tags.push(TAG.pocaexpo);
  if (o.quality !== "alta") tags.push(TAG.reservas);

  // Hasta el 03/11/2026 decía «Sube en el ranking por…» con los componentes que más aportaban a la puntuación única.
  // Con dos rankings de un solo componente, lo útil es decir en cuál destaca (índice ≥ HIGH_PERCENTILE).
  const strong = (["volumen", "potencial"] as const).filter((l) => sc[l] >= HIGH_PERCENTILE).map((l) => `«${LENSES[l].label}»`);
  const lead = strong.length ? `Destaca en ${strong.join(" y ")}.` : "No destaca en ninguno de los dos rankings de esta búsqueda.";
  const cautions = tags.filter((t) => t.tone === "caution").map((t) => t.label.toLowerCase());
  const why = `${lead}${cautions.length ? ` Ten en cuenta: ${cautions.join(", ")}.` : ""}`;
  return { tags, why };
}

/** Selección para la tabla: hasta 2 positivas, 1 de precaución y el resto neutras, máximo 3 etiquetas. */
export function shortTags(tags: Tag[]): Tag[] {
  const by = (tone: TagTone) => tags.filter((t) => t.tone === tone);
  const out = [...by("positive").slice(0, 2), ...by("caution").slice(0, 1)];
  return [...out, ...by("neutral")].slice(0, 3);
}
