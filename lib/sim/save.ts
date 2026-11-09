import type { Action, SaveFile, SimState } from "./model";
import { ENGINE_VERSION, SUPPORTED_VERSIONS } from "./params";
import { apply, newGame } from "./engine";

/**
 * Guardado (docs/simulador.md §14): se guarda la semilla y las acciones, nunca el estado. El estado se reconstruye
 * reproduciéndolas, así que una partida guardada siempre se puede rehacer y comprobar.
 */
export const SAVE_KEY = "smartrade:simulador:partida";

export const toSave = (seed: number, actions: Action[], version: number = ENGINE_VERSION, now = new Date()): SaveFile => ({ app: "smartrade-simulador", version, seed, actions, savedAt: now.toISOString() });

const isAction = (a: unknown): a is Action => {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  if (x.t === "cerrar") return true;
  // «docs» y «retorno» son opcionales (no existían en partidas anteriores); si vienen, con su tipo.
  if (x.t === "aceptar") return typeof x.oferta === "string" && (x.docs === undefined || (Array.isArray(x.docs) && x.docs.every((d) => typeof d === "string"))) && (x.retorno === undefined || typeof x.retorno === "boolean");
  // Hasta el 09/11/2026 faltaba esta línea: una partida en la que se había negociado no se podía cargar.
  if (x.t === "proponer") return typeof x.oferta === "string" && [x.tarifa, x.semanas, x.plazo].every((n) => typeof n === "number" && Number.isFinite(n));
  if (x.t === "responder") return typeof x.incidencia === "string" && typeof x.opcion === "string";
  if (x.t === "pregunta") return typeof x.pregunta === "string" && typeof x.opcion === "string";
  return false;
};

export function parseSave(raw: unknown): { ok: true; save: SaveFile; warning: string | null } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "El archivo no es una partida del simulador." };
  const x = raw as Partial<SaveFile>;
  if (x.app !== "smartrade-simulador" || typeof x.seed !== "number" || !Number.isInteger(x.seed) || !Array.isArray(x.actions) || !x.actions.every(isAction)) return { ok: false, error: "El archivo no es una partida del simulador." };
  // Una versión conocida se reproduce con sus propias reglas; una desconocida (más nueva), con las actuales y aviso.
  const known = (SUPPORTED_VERSIONS as readonly number[]).includes(x.version ?? -1);
  const version = known ? x.version! : ENGINE_VERSION;
  const warning = known ? null : `La partida se guardó con la versión ${x.version} del motor, que esta aplicación no conoce: se reproduce con la versión ${ENGINE_VERSION} y el resultado puede variar.`;
  return { ok: true, save: { app: "smartrade-simulador", version, seed: x.seed, actions: x.actions, savedAt: typeof x.savedAt === "string" ? x.savedAt : "" }, warning };
}

/** Reconstruye el estado; si una acción ya no es válida con las reglas actuales, se detiene ahí y lo indica. */
export function restore(save: SaveFile): { state: SimState; actions: Action[]; dropped: number } {
  let state = newGame(save.seed, save.version);
  const ok: Action[] = [];
  for (const a of save.actions) {
    try { state = apply(state, a); ok.push(a); } catch { break; }
  }
  return { state, actions: ok, dropped: save.actions.length - ok.length };
}
