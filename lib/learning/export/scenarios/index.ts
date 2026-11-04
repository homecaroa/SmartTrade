import type { ExportScenario } from "../types";
import { ACEITE_ALEMANIA } from "./aceite-alemania";
import { ACEITUNAS_NUEVA_YORK } from "./aceitunas-nueva-york";
import { RECAMBIOS_MARRUECOS } from "./recambios-marruecos";
import { PERFUMES_DUBAI } from "./perfumes-dubai";
import { VINO_JAPON } from "./vino-japon";

export const EXPORT_SCENARIOS: ExportScenario[] = [ACEITE_ALEMANIA, RECAMBIOS_MARRUECOS, VINO_JAPON, ACEITUNAS_NUEVA_YORK, PERFUMES_DUBAI];
export const exportScenario = (id: string) => EXPORT_SCENARIOS.find((s) => s.id === id) ?? null;
