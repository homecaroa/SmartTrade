/**
 * Continuidad de códigos HS6 entre HS2017 y HS2022 (decisión del 06/11/2026).
 *
 * Problema: una ventana de 3 años que cruza el cambio de nomenclatura (años finales 2022 y 2023) mezcla datos rotulados
 * HS2017 y HS2022, y la app la declaraba incomparable para TODOS los códigos, aunque la mayoría no cambió (220421, por
 * ejemplo). Resultado medido: con año final 2022 o 2023, 0 oportunidades válidas.
 *
 * Regla: se admite unir HS2017 y HS2022 solo para los códigos del catálogo que NO cambiaron. Cambiaron (y por eso siguen
 * sin unirse), según la tabla oficial de correlación de la OMA (WCO, «Table II — Correlating the 2017 version to the
 * 2022 version of the Harmonized System», noviembre de 2020):
 *   - nuevos en HS2022: 150920, 150930 (antes 1509.10), 851713 (de 8517.12), 854143 (de 8541.40);
 *   - con alcance modificado: 180690 (parte pasa a 1602.90), 841810 (absorbe parte de 8418.50), 870829 (parte pasa a
 *     8708.22).
 * Comprobado además con Eurostat Comext (Alemania, 2017–2025): los cuatro códigos nuevos no tienen datos antes de 2022 y
 * los demás códigos del catálogo tienen serie continua en 2021 y 2022.
 * Los códigos fuera del catálogo y las subcategorías NC8 NO se unen: no se han comprobado uno a uno.
 */
export const CHANGED_HS2017_HS2022 = new Set(["150920", "150930", "851713", "854143", "180690", "841810", "870829"]);

/** Códigos HS6 del catálogo comprobados sin cambios entre HS2017 y HS2022 (se rellena desde el catálogo). */
export function canBridgeHs2017To2022(code: string, catalogCodes: Iterable<string>): boolean {
  if (code.length !== 6 || CHANGED_HS2017_HS2022.has(code)) return false;
  for (const c of catalogCodes) if (c === code) return true;
  return false;
}
