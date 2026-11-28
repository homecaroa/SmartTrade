import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bancoSchema, catalogoSchema, type Catalogo, type ModuloCat, type Pregunta, type TestCat } from "./schema";

/**
 * Carga (en el servidor, con fs) y valida el banco de data/practica. Se cachea en el proceso: son ficheros estáticos
 * del repositorio, no datos de red. Next debe copiarlos a las funciones (outputFileTracingIncludes en next.config.mjs).
 */
const RAIZ = join(process.cwd(), "data", "practica");
let catalogoCache: Catalogo | null = null;
const bancoCache = new Map<string, { titulo: string; preguntas: Pregunta[] }>();

export function catalogo(): Catalogo {
  if (!catalogoCache) catalogoCache = catalogoSchema.parse(JSON.parse(readFileSync(join(RAIZ, "modulos.json"), "utf8")));
  return catalogoCache;
}

export const modulosDisponibles = (): ModuloCat[] => catalogo().modulos.filter((m) => m.disponible);
export const modulo = (codigo: string): ModuloCat | undefined => modulosDisponibles().find((m) => m.codigo === codigo);

export function buscarTest(codigo: string, testId: string): { modulo: ModuloCat; unidadNum: number; test: TestCat } | undefined {
  const m = modulo(codigo);
  if (!m) return undefined;
  for (const u of m.unidades) for (const t of u.tests) if (t.id === testId) return { modulo: m, unidadNum: u.num, test: t };
  return undefined;
}

export function preguntasDe(test: TestCat): Pregunta[] {
  const hit = bancoCache.get(test.archivo);
  if (hit) return hit.preguntas;
  let banco;
  try { banco = bancoSchema.parse(JSON.parse(readFileSync(join(RAIZ, `${test.archivo}.json`), "utf8"))); }
  catch (e) { throw new Error(`Banco de tests no válido (${test.archivo}): ${e instanceof Error ? e.message : String(e)}`); }
  bancoCache.set(test.archivo, { titulo: banco.titulo, preguntas: banco.preguntas });
  return banco.preguntas;
}

export const preguntasDeUnidad = (m: ModuloCat, unidadNum: number): Pregunta[] =>
  (m.unidades.find((u) => u.num === unidadNum)?.tests ?? []).flatMap(preguntasDe);

export const totalPreguntas = (m: ModuloCat): number => m.unidades.reduce((s, u) => s + u.tests.reduce((t, x) => t + preguntasDe(x).length, 0), 0);
