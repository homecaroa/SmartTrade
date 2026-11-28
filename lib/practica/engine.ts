/**
 * Lógica pura de los tests de estudio: sin red, sin hora y sin Math.random. El azar usa una semilla (misma semilla →
 * mismo orden), igual que el resto del Modo Aprendizaje; la semilla la pone el número de intento guardado en el navegador.
 */
import type { Pregunta } from "./schema";

export const TAM_FINAL = 60;

/** Generador mulberry32: pequeño, determinista y suficiente para barajar. */
export function rng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla estable a partir de un texto (clave del test) y del número de intento. */
export function semillaDe(clave: string, intento: number): number {
  let h = 2166136261;
  for (let i = 0; i < clave.length; i++) { h ^= clave.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h ^ Math.imul(intento + 1, 0x9e3779b1)) >>> 0;
}

export function barajar<T>(xs: readonly T[], azar: () => number): T[] {
  const r = [...xs];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** Una pregunta lista para mostrar: opciones barajadas, recordando cuál era la correcta. */
export interface PreguntaVista { q: Pregunta; opciones: { texto: string; idx: number }[] }
export function prepararPregunta(q: Pregunta, azar: () => number): PreguntaVista {
  return { q, opciones: barajar(q.opciones.map((texto, idx) => ({ texto, idx })), azar) };
}

/**
 * Reparto proporcional (método del resto mayor) de `total` preguntas entre grupos de tamaños `cuentas`, con al menos una
 * por grupo no vacío y sin pasar del tamaño de cada grupo. Devuelve un número por grupo; la suma es `total` si cabe.
 */
export function repartoFinal(cuentas: readonly number[], total: number): number[] {
  const suma = cuentas.reduce((s, c) => s + c, 0);
  if (suma === 0) return cuentas.map(() => 0);
  const objetivo = Math.min(total, suma);
  const exacto = cuentas.map((c) => (c / suma) * objetivo);
  const base = cuentas.map((c, i) => (c === 0 ? 0 : Math.min(c, Math.max(1, Math.floor(exacto[i])))));
  let resto = objetivo - base.reduce((s, c) => s + c, 0);
  const orden = cuentas.map((_, i) => i).sort((a, b) => (exacto[b] - Math.floor(exacto[b])) - (exacto[a] - Math.floor(exacto[a])) || a - b);
  while (resto > 0) {
    let movido = false;
    for (const i of orden) if (resto > 0 && base[i] < cuentas[i]) { base[i]++; resto--; movido = true; }
    if (!movido) break;
  }
  while (resto < 0) { // los mínimos de 1 pueden pasarse: se quita de donde más hay
    const i = base.indexOf(Math.max(...base)); base[i]--; resto++;
  }
  return base;
}

/** Test final: reparte `TAM_FINAL` preguntas entre las unidades según su peso y toma al azar (con semilla) de cada una. */
export function muestraFinal(porUnidad: readonly (readonly Pregunta[])[], azar: () => number, total = TAM_FINAL): Pregunta[] {
  const reparto = repartoFinal(porUnidad.map((g) => g.length), total);
  return porUnidad.flatMap((g, i) => barajar(g, azar).slice(0, reparto[i]));
}

/**
 * Nota estilo examen de Madrid (penalización de medio acierto por fallo, en blanco no puntúa). Es una convención
 * didáctica del proyecto, no la norma de ningún examen concreto. Nunca baja de 0.
 */
export interface Resultado { aciertos: number; fallos: number; blancos: number; total: number; sobre10: number; sobre10SinPenalizar: number }
export function calificar(correctas: readonly boolean[], contestadas: readonly boolean[]): Resultado {
  const total = correctas.length;
  let aciertos = 0, fallos = 0, blancos = 0;
  correctas.forEach((ok, i) => { if (!contestadas[i]) blancos++; else if (ok) aciertos++; else fallos++; });
  const penalizado = Math.max(0, aciertos - 0.5 * fallos);
  return {
    aciertos, fallos, blancos, total,
    sobre10: total ? (penalizado / total) * 10 : 0,
    sobre10SinPenalizar: total ? (aciertos / total) * 10 : 0,
  };
}
