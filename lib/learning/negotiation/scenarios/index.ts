import type { NegotiationScenario } from "../types";
import { ACEITE_MEXICO } from "./aceite-mexico";
import { CALZADO_REINO_UNIDO } from "./calzado-reino-unido";

export const NEGOTIATION_SCENARIOS: NegotiationScenario[] = [ACEITE_MEXICO, CALZADO_REINO_UNIDO];
export const negotiationScenario = (id: string) => NEGOTIATION_SCENARIOS.find((s) => s.id === id) ?? null;
