import { apply, balanceGap, gradeOffer, newGame, serviceLevelToDate } from "./engine";
import type { Action, SimState } from "./model";

/**
 * Estrategias automáticas para las pruebas de equilibrio (docs/simulador.md §15). Juegan partidas completas con una
 * regla fija y devuelven las acciones, para que el resultado se pueda reproducir.
 */
export type Strategy = "nada" | "codiciosa" | "prudente";

const incidentChoice: Record<Strategy, Record<string, string>> = {
  nada: { averia: "callar", mora: "esperar" },
  codiciosa: { averia: "callar", mora: "esperar" },
  prudente: { averia: "subcontratar", mora: "reclamar" },
};

export function play(seed: number, strategy: Strategy): { state: SimState; actions: Action[]; maxGap: number } {
  let s = newGame(seed);
  const actions: Action[] = [];
  let maxGap = 0;
  const run = (a: Action) => { actions.push(a); s = apply(s, a); maxGap = Math.max(maxGap, Math.abs(balanceGap(s))); };
  for (let guard = 0; guard < 100 && (s.status === "jugando" || s.status === "incidencia"); guard++) {
    if (s.status === "incidencia" && s.pending) { run({ t: "responder", incidencia: s.pending.id, opcion: incidentChoice[strategy][s.pending.kind] }); continue; }
    if (strategy !== "nada") for (const o of [...s.offers]) if (strategy === "codiciosa" || gradeOffer(s, o).grade !== "grave") run({ t: "aceptar", oferta: o.id });
    run({ t: "cerrar" });
  }
  return { state: s, actions, maxGap };
}

export const summary = (s: SimState) => ({ status: s.status, result: s.result, cash: s.cash, service: serviceLevelToDate(s) });
