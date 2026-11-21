import { Simulator } from "@/components/sim/simulator";

export const metadata = { title: "Business Simulator · Carrera · SmarTrade" };

/** Carrera de 5 años (fase A, 21/11/2026; docs/simulador-carrera.md). Como la Temporada, todo corre en el navegador. */
export default function CareerPage() {
  return <Simulator mode="carrera" />;
}
