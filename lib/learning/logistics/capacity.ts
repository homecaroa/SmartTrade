import { CAPACITY, VOLUMETRIC } from "./params";
import type { Cargo, Modality } from "./types";

/**
 * Unidades de cobro según la modalidad. Fórmulas:
 * - Aéreo: peso tasable = máx(peso real, volumen × 166,7 kg/m³).
 * - Grupaje por carretera: peso tasable = máx(peso real, volumen × 333 kg/m³).
 * - Marítimo LCL: toneladas-volumen (W/M) = máx(peso en t, volumen en m³).
 * - FCL: contenedores necesarios = máx(volumen / capacidad útil, peso / carga máxima), redondeando hacia arriba;
 *   se compara 20' y 40' y se elige el equipo más barato.
 * - Camión completo: camiones = máx(palets / 33, peso / 24 t, volumen / 85 m³), hacia arriba.
 */
/** Redondeo hacia arriba sin el error de coma flotante (9 m³ × 166,666… no debe dar 1.501 kg). */
const ceilKg = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6);
export const airChargeableKg = (c: Pick<Cargo, "grossKg" | "volumeM3">) => ceilKg(Math.max(c.grossKg, c.volumeM3 * VOLUMETRIC.aereo));
export const roadChargeableKg = (c: Pick<Cargo, "grossKg" | "volumeM3">) => ceilKg(Math.max(c.grossKg, c.volumeM3 * VOLUMETRIC.carretera));
export const lclRevenueTons = (c: Pick<Cargo, "grossKg" | "volumeM3">) => Math.round(Math.max(c.grossKg / VOLUMETRIC.lclKgPerM3, c.volumeM3) * 100) / 100;

export function containersNeeded(c: Pick<Cargo, "grossKg" | "volumeM3">, size: "20" | "40"): number {
  const cap = size === "20" ? CAPACITY.container20 : CAPACITY.container40;
  return Math.max(1, Math.ceil(Math.max(c.volumeM3 / cap.m3, c.grossKg / cap.kg)));
}

export function trucksNeeded(c: Pick<Cargo, "pallets" | "grossKg" | "volumeM3">): number {
  const t = CAPACITY.truck;
  return Math.max(1, Math.ceil(Math.max(c.pallets / t.pallets, c.grossKg / t.kg, c.volumeM3 / t.m3)));
}

/** Ocupación del equipo (0–1): sirve para explicar si se aprovecha un camión o un contenedor. */
export function fillRate(c: Pick<Cargo, "pallets" | "grossKg" | "volumeM3">, modality: Modality, containerSize: "20" | "40" = "20"): number | null {
  if (modality === "maritimo_fcl") {
    const cap = containerSize === "20" ? CAPACITY.container20 : CAPACITY.container40;
    const n = containersNeeded(c, containerSize);
    return Math.max(c.volumeM3 / (cap.m3 * n), c.grossKg / (cap.kg * n));
  }
  if (modality === "carretera" || modality === "multimodal") {
    const t = CAPACITY.truck;
    const n = trucksNeeded(c);
    return Math.max(c.pallets / (t.pallets * n), c.grossKg / (t.kg * n), c.volumeM3 / (t.m3 * n));
  }
  return null;
}
