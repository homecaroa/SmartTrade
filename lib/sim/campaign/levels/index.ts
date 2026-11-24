import type { CampaignState, Decision, Grade } from "../model";
import { LEVEL1 } from "./l1";
import { LEVEL2 } from "./l2";
import { LEVEL3 } from "./l3";
import { LEVEL4 } from "./l4";
import { LEVEL5 } from "./l5";
import { LEVEL6 } from "./l6";
import { LEVEL7 } from "./l7";
import { LEVEL8 } from "./l8";
import { LEVEL9 } from "./l9";

/** Pregunta del informe final de un nivel (como mucho 2-3: el aprendizaje va dentro de las decisiones). */
export interface DebriefQ { id: string; topic: string; prompt: string; options: { id: string; label: string; grade: Grade; feedback: string }[]; competences: string[] }

/**
 * Definición de un nivel de la campaña (docs/simulador-campana.md). Cada nivel es una misión sobre la empresa que
 * viene del anterior: introduce UNA mecánica nueva, tiene un objetivo principal y dos secundarios (estrellas de
 * gestión) y unas pocas preguntas finales (dominio, aparte).
 */
export interface LevelDef {
  n: number;
  act: number;
  actTitle: string;
  type: string;
  title: string;
  weeks: number;
  /** Situación de partida, en dos o tres frases. */
  briefing: string;
  /** La mecánica nueva del nivel. */
  mechanic: string;
  /** Objetivo principal y los dos secundarios (estrellas). */
  objectives: [string, string, string];
  /** Estrategias que valen para superarlo (para el jugador y para las pruebas). */
  strategies: string[];
  /** Conceptos del Manual que se desbloquean al empezar. */
  concepts: string[];
  /** Decisiones importantes: las que se pueden rejugar en «qué habría pasado si». */
  keyDecisions: string[];
  start(s: CampaignState): void;
  decisionsAt(s: CampaignState): Decision[];
  decide(s: CampaignState, d: Decision, opcion: string): void;
  beforeClose?(s: CampaignState, notes: string[]): void;
  afterWeek?(s: CampaignState, notes: string[]): void;
  stars(s: CampaignState): [boolean, boolean, boolean];
  debrief(s: CampaignState): DebriefQ[];
}

export const LEVELS: LevelDef[] = [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6, LEVEL7, LEVEL8, LEVEL9];
export const ACTS = ["Arranque", "Consolidación", "Crecimiento", "Internacional", "Grupo empresarial"];
