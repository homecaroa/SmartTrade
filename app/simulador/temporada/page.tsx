import { Simulator } from "@/components/sim/simulator";

export const metadata = { title: "Business Simulator · Temporada · SmarTrade" };

/**
 * Temporada de 26 semanas (docs/simulador.md). Hasta el 23/11/2026 estaba en /simulador, que ahora es el menú de los
 * modos. Lee la MISMA partida guardada de siempre (SAVE_KEY), así que nadie pierde su temporada en curso.
 */
export default function SeasonPage() {
  return <Simulator />;
}
