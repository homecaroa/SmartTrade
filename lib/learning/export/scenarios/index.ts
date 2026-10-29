import type { ExportScenario } from "../types";
import { ACEITE_ALEMANIA } from "./aceite-alemania";
import { VINO_JAPON } from "./vino-japon";

export const EXPORT_SCENARIOS: ExportScenario[] = [ACEITE_ALEMANIA, VINO_JAPON];
export const exportScenario = (id: string) => EXPORT_SCENARIOS.find((s) => s.id === id) ?? null;
