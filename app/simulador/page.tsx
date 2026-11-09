import { Simulator } from "@/components/sim/simulator";

export const metadata = { title: "Business Simulator · SmarTrade" };

/** Business Simulator, fase 1 (docs/simulador.md). Todo el juego corre en el navegador: sin red ni servidor. */
export default function SimulatorPage() {
  return <Simulator />;
}
