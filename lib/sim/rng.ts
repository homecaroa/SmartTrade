import { fnv1a } from "../learning/order";

/**
 * Azar con semilla (docs/simulador.md §13). Todo lo ajeno al jugador (ofertas, averías, pagos) sale de aquí; nunca de
 * Math.random ni de la hora. Cada sistema y semana tiene su propia secuencia, derivada de «semilla|semana|sistema»: así
 * una decisión del jugador no desplaza los sorteos de otro sistema (rechazar una oferta no cambia cuándo se avería el camión).
 */
export type Rng = () => number;

/** Mulberry32: generador pseudoaleatorio de 32 bits, sencillo y reproducible. Devuelve números en [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const stream = (seed: number, week: number, system: string): Rng => mulberry32(fnv1a(`${seed}|${week}|${system}`));

/** Entero en [min, max] con paso `step`. */
export const intIn = (r: Rng, min: number, max: number, step = 1) => min + Math.floor(r() * (Math.floor((max - min) / step) + 1)) * step;
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
