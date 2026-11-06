import { nc8Entry } from "@/lib/config/hs-catalog";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import type { Opportunity } from "./opportunities";

/**
 * Lectura descriptiva de un mercado (desde el 06/11/2026; sustituye a las etiquetas por percentiles de
 * lib/scoring/labels.ts). Plantillas DETERMINISTAS alimentadas solo por los indicadores calculados: no hay IA ni
 * juicios comerciales («buena oportunidad», «potencial»…). Cada frase dice qué dato la sostiene.
 *
 * Umbrales (decisiones documentadas, no estimadas; ya existían en la versión anterior salvo el de estabilidad):
 * - «estable»: |CAGR| < 1 % anual.
 * - Crecimiento excepcional: CAGR ≥ 30 % anual.
 * - Posible efecto precio: CAGR en valor − CAGR en peso ≥ 15 puntos.
 */
export const STABLE_CAGR = 1;
export const EXCEPTIONAL_GROWTH_CAGR = 30;
export const PRICE_EFFECT_GAP_PP = 15;
/** Grandes puertos de entrada a la UE: parte de sus importaciones se reexpide a otros países. */
export const TRANSIT_HUBS = ["NL", "BE"];

export interface Caution { key: string; label: string; detail: string }
export interface MarketReading { sentences: string[]; cautions: Caution[] }

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), 1)} %`;
const signedPp = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v), 1)} puntos`;

/** Frase sobre la forma de la serie a partir de las variaciones anuales (solo describe; no extrapola). */
function shape(o: Opportunity): string | null {
  const ch = o.annualChanges;
  const ys = o.importsSeries.map((p) => p.year);
  if (ch.length !== 2 || ch.some((c) => c === null)) return null;
  const [a, b] = ch as number[];
  if (a < 0 && b > 0) return `Las importaciones cayeron en ${ys[1]} (${signedPct(a)}) y se recuperaron en ${ys[2]} (${signedPct(b)}).`;
  if (a > 0 && b < 0) return `Las importaciones subieron en ${ys[1]} (${signedPct(a)}) y bajaron en ${ys[2]} (${signedPct(b)}).`;
  if (a < 0 && b < 0) return `Las importaciones bajaron los dos años (${signedPct(a)} y ${signedPct(b)}).`;
  if (a > 0 && b > 0) return `Las importaciones subieron los dos años (${signedPct(a)} y ${signedPct(b)}).`;
  return null;
}

export function readMarket(o: Opportunity): MarketReading {
  const cur = o.currency;
  const y0 = o.importsSeries[0].year;
  const sentences: string[] = [];
  const cautions: Caution[] = [];

  if (o.marketSize !== null) {
    sentences.push(`${o.marketName} importó ${fmtMoney(o.marketSize, cur)} de este producto en ${o.endYear}${o.yoyChange !== null ? ` (${signedPct(o.yoyChange)} respecto a ${o.endYear - 1})` : ""}.`);
  } else {
    sentences.push(`No hay dato de importaciones de ${o.marketName} en ${o.endYear}.`);
  }

  if (o.cagr !== null && o.complete) {
    const verb = Math.abs(o.cagr) < STABLE_CAGR ? "se mantuvieron prácticamente estables" : o.cagr > 0 ? "crecieron" : "cayeron";
    sentences.push(`Entre ${y0} y ${o.endYear} ${verb}, con una variación media del ${signedPct(o.cagr)} anual en valor. Es una evolución pasada, no una previsión.`);
    const s = shape(o);
    if (s) sentences.push(s);
    if (o.cagrVolume !== null) sentences.push(`En volumen (peso neto) la variación media fue del ${signedPct(o.cagrVolume)} anual${o.weightEstimated ? " (peso estimado por la fuente en algún año)" : ""}.`);
  }

  if (o.spainValue !== null && o.spanishShare !== null) {
    const change = o.spanishShareChangePp !== null ? `, ${signedPp(o.spanishShareChangePp)} respecto a ${y0}` : "";
    sentences.push(o.partnerBasis === "expedicion"
      ? `Con socio España constan ${fmtMoney(o.spainValue, cur)}: el ${fmtPct(o.spanishShare)} de lo importado${change}. Es mercancía EXPEDIDA desde España; el dato no permite identificar por sí solo el origen de toda la mercancía (la española que llega a través de otros países cuenta como de esos países).`
      : `Con origen España constan ${fmtMoney(o.spainValue, cur)}: el ${fmtPct(o.spanishShare)} de lo importado${change}.`);
  } else if (o.spainValue === null) {
    sentences.push(`No constan importaciones con socio España en ${o.endYear}: puede ser comercio nulo, confidencial o no publicado.`);
  }

  if (o.cagr !== null && o.cagr >= EXCEPTIONAL_GROWTH_CAGR) cautions.push({ key: "excepcional", label: "Crecimiento excepcional", detail: `CAGR de ${fmtPct(o.cagr)}: suele deberse a efectos puntuales (precios, cambios de clasificación, reexportaciones o de quién declara). Revisa la serie año a año.` });
  if (o.cagr !== null && o.cagrVolume !== null && o.cagr - o.cagrVolume >= PRICE_EFFECT_GAP_PP) cautions.push({ key: "precio", label: "Posible efecto precio", detail: `El valor crece ${fmtNum(o.cagr - o.cagrVolume, 1)} puntos al año más que el peso: parte del aumento puede deberse a precios o a un cambio en la composición del producto.` });
  if (TRANSIT_HUBS.includes(o.marketCode) && o.partnerBasis === "expedicion") cautions.push({ key: "transito", label: "Puerto de entrada a la UE", detail: "Parte de lo que importa este país se reexpide a otros (el llamado «efecto Róterdam»): su tamaño puede sobrestimar el consumo del propio país." });
  if (nc8Entry(o.productCode)?.spanishOrigin) cautions.push({ key: "dop", label: "Denominación exclusivamente española", detail: "Solo se produce en España: la participación española es casi el 100 % por definición y no mide competencia." });
  if (o.quality === "media") cautions.push({ key: "estimados", label: "Datos estimados", detail: "La fuente marca como estimado algún dato de la ventana." });
  if (!o.complete) cautions.push({ key: "incompleta", label: "Serie incompleta", detail: o.missing.join("; ") || "Faltan datos de la ventana." });
  return { sentences, cautions };
}
