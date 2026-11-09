import { apply, balanceGap, gradeOffer, newGame, serviceLevelToDate } from "./engine";
import type { Action, Offer, SimState } from "./model";
import { bestDocs, roundRate, termsOf } from "./deal";
import { P } from "./params";

/**
 * Estrategias automáticas para las pruebas de equilibrio (docs/simulador.md §15). Juegan partidas completas con una
 * regla fija y devuelven las acciones, para que el resultado se pueda reproducir.
 * - nada: no acepta nada.
 * - codiciosa: acepta todo lo que llega.
 * - prudente: acepta lo que no es un error grave, en el orden en que llega.
 * - selectiva: primero las ofertas de mejor margen que cubren el coste completo; las demás, solo si sobra capacidad.
 * - negociadora: como la selectiva, pero antes de aceptar pide un 8 % más y acepta la contraoferta si la hay.
 * Todas documentan bien sus operaciones salvo la codiciosa, que no prepara ningún documento.
 */
export type Strategy = "nada" | "codiciosa" | "prudente" | "selectiva" | "negociadora";

const incidentChoice: Record<Strategy, Record<string, string>> = {
  nada: { averia: "callar", mora: "esperar" },
  codiciosa: { averia: "callar", mora: "esperar" },
  prudente: { averia: "subcontratar", mora: "reclamar" },
  selectiva: { averia: "subcontratar", mora: "reclamar" },
  negociadora: { averia: "subcontratar", mora: "reclamar" },
};

/** Margen por unidad de capacidad: €/km recorrido sobre el coste variable, o €/palé/semana. */
const unitMargin = (o: Offer) => (o.kind === "distribucion" ? o.ratePerKm! - P.variablePerKm : o.kind === "puntual" ? o.price! / (2 * o.kmOneWay!) - P.variablePerKm : o.palletRate!);

export function play(seed: number, strategy: Strategy): { state: SimState; actions: Action[]; maxGap: number } {
  let s = newGame(seed);
  const actions: Action[] = [];
  let maxGap = 0;
  const run = (a: Action) => { actions.push(a); s = apply(s, a); maxGap = Math.max(maxGap, Math.abs(balanceGap(s))); };
  for (let guard = 0; guard < 400 && (s.status === "jugando" || s.status === "incidencia"); guard++) {
    if (s.status === "incidencia" && s.pending) { run({ t: "responder", incidencia: s.pending.id, opcion: incidentChoice[strategy][s.pending.kind] }); continue; }
    const accept = (o: Offer) => run({ t: "aceptar", oferta: o.id, docs: strategy === "codiciosa" ? [] : bestDocs(o.kind) });
    if (strategy === "selectiva" || strategy === "negociadora") {
      const byMargin = () => [...s.offers].sort((a, b) => unitMargin(b) - unitMargin(a));
      for (const want of ["correcta", "razonable"] as const) for (const o0 of byMargin()) {
        if (gradeOffer(s, o0).grade !== want) continue;
        let o: Offer | undefined = o0;
        if (strategy === "negociadora") {
          const t = termsOf(o0);
          run({ t: "proponer", oferta: o0.id, tarifa: roundRate(o0.kind, t.rate * 1.08), semanas: t.weeks, plazo: t.payWeeks });
          o = s.offers.find((x) => x.id === o0.id);
          if (!o || gradeOffer(s, o).grade === "grave") continue;
        }
        accept(o);
      }
    } else if (strategy !== "nada") {
      for (const o of [...s.offers]) if (strategy === "codiciosa" || gradeOffer(s, o).grade !== "grave") accept(o);
    }
    run({ t: "cerrar" });
  }
  return { state: s, actions, maxGap };
}

export const summary = (s: SimState) => ({ status: s.status, result: s.result, cash: s.cash, service: serviceLevelToDate(s) });
