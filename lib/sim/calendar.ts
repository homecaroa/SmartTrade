import { fnv1a } from "../learning/order";
import type { SimState } from "./model";
import { SEASON_WEEKS, WEEKS_PER_MONTH } from "./params";

/**
 * Calendario del simulador (Carrera, fase A, 21/11/2026; docs/simulador-carrera.md).
 *
 * Dos modos con el mismo motor:
 * - Temporada (sin `mode`): 26 semanas, como siempre.
 * - Carrera (`mode: "carrera"`): 5 años de 52 semanas = 260 semanas.
 *
 * Año de juego = 52 semanas = 13 «meses» de 4 semanas (el mes de 4 semanas ya existía: alquiler, nóminas e informe).
 * Es un calendario de 13 periodos, una simplificación declarada; el trimestre son 13 semanas.
 *
 * Lo que en la temporada pasa «una vez» (averías por tramos, reclamaciones, incidencias del almacén y de reparto, el aviso
 * de mora de cada cliente, la estacionalidad de las ofertas) en la Carrera se repite cada SEMESTRE de 26 semanas, con
 * otra semilla y otra clave de respuesta. En el semestre 1 la semilla y las claves son las de siempre: una Temporada es
 * exactamente el primer semestre, y las partidas guardadas (v1-v9) se reproducen igual. Decisión documentada, no medida:
 * repetir el semestre es lo mínimo para que una partida de años no se quede sin sucesos; la fase B traerá operaciones
 * distintas.
 */
export const CAREER_YEARS = 5;
export const WEEKS_PER_YEAR = 52;
export const CAREER_WEEKS = CAREER_YEARS * WEEKS_PER_YEAR;
export const SEMESTER_WEEKS = SEASON_WEEKS;
export const MONTHS_PER_YEAR = WEEKS_PER_YEAR / WEEKS_PER_MONTH;
export const WEEKS_PER_QUARTER = WEEKS_PER_YEAR / 4;

export type Mode = "temporada" | "carrera";
export const modeOf = (s: Pick<SimState, "mode">): Mode => s.mode ?? "temporada";
/** Última semana de la partida. */
export const lastWeekOf = (s: Pick<SimState, "mode">) => (modeOf(s) === "carrera" ? CAREER_WEEKS : SEASON_WEEKS);

/** Semestre (0, 1, 2…) y semana dentro de él (1-26). */
export const semesterOf = (w: number) => Math.floor((w - 1) / SEMESTER_WEEKS);
export const localWeek = (w: number) => ((w - 1) % SEMESTER_WEEKS) + 1;
/** Semilla de los sucesos de un semestre: la de la partida en el primero. */
export const semesterSeed = (seed: number, k: number) => (k === 0 ? seed : fnv1a(`${seed}|semestre|${k}`));
/** Clave de una respuesta que se repite cada semestre: la de siempre en el primero, «id@2», «id@3»… después. */
export const semesterKey = (id: string, w: number) => { const k = semesterOf(w); return k === 0 ? id : `${id}@${k + 1}`; };

/** Año (1-5) y semana dentro del año (1-52). */
export const yearOf = (w: number) => Math.floor((w - 1) / WEEKS_PER_YEAR) + 1;
export const weekOfYear = (w: number) => ((w - 1) % WEEKS_PER_YEAR) + 1;
/** Mes de juego (1, 2…) contando desde el principio, y el año al que pertenece. */
export const yearOfMonth = (month: number) => Math.floor((month - 1) / MONTHS_PER_YEAR) + 1;

/** Cómo se dice la semana en pantalla. */
export const weekLabel = (s: Pick<SimState, "mode">, w: number) => (modeOf(s) === "carrera" ? `Año ${yearOf(w)}, semana ${weekOfYear(w)}` : `Semana ${w}`);
/** La semana dentro de una frase: «la semana 6» o, en la Carrera, «la semana 8 del año 2». */
export const weekPhrase = (s: Pick<SimState, "mode">, w: number) => (modeOf(s) === "carrera" ? `la semana ${weekOfYear(w)} del año ${yearOf(w)}` : `la semana ${w}`);
