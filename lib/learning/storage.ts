/**
 * Progreso de la sesión guardado en el navegador (localStorage): es una comodidad por alumno, no un registro fiable.
 * Si el navegador lo bloquea, la simulación funciona igual sin guardar. Cada caso tiene su propia clave versionada, y lo
 * guardado se valida antes de usarse: nunca se mezclan sesiones de casos distintos ni de versiones anteriores.
 */
export const STORAGE_VERSION = 1;
export type LearningModule = "exportacion" | "negociacion" | "logistica";

export const storageKey = (module: LearningModule, caseId: string) => `smartrade:aprendizaje:v${STORAGE_VERSION}:${module}:${caseId}`;

export function loadState<T>(key: string, isValid: (x: unknown) => x is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveState(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: se sigue sin guardar */ }
}

export function clearState(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* nada que borrar */ }
}
