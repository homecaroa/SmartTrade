import type { LogisticsCase } from "../types";
import { SEVILLA_CASABLANCA } from "./sevilla-casablanca";
import { SEVILLA_MUNICH } from "./sevilla-munich";
import { SEVILLA_NUEVA_YORK } from "./sevilla-nueva-york";
import { SEVILLA_TOKIO } from "./sevilla-tokio";

/** Orden de dificultad progresiva. */
export const LOGISTICS_CASES: LogisticsCase[] = [SEVILLA_MUNICH, SEVILLA_CASABLANCA, SEVILLA_NUEVA_YORK, SEVILLA_TOKIO];
export const logisticsCase = (id: string) => LOGISTICS_CASES.find((c) => c.id === id) ?? null;
