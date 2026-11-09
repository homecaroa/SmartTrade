import type { ImportScenario } from "../types";
import { bicicletasValencia } from "./bicicletas-valencia";

export const IMPORT_SCENARIOS: ImportScenario[] = [bicicletasValencia];
export const importScenario = (id: string) => IMPORT_SCENARIOS.find((s) => s.id === id);
