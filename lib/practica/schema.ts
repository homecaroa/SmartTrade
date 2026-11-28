import { z } from "zod";

/**
 * Banco de tests de estudio (sección /practica). Los ficheros de data/practica los trae tal cual la web
 * «tests-comercio-internacional», donde se auditan (sesgo de longitud, cifras contra fuentes, duplicados). Aquí solo se
 * validan al cargarlos: un fichero mal formado da error con su nombre, nunca una pregunta rota en pantalla.
 */
export const VERIFICACION = ["oficial", "secundaria", "general"] as const;
export type Verificacion = (typeof VERIFICACION)[number];

/** Qué significa cada nivel. «general» NO es «falso»: es conocimiento del sector sin fuente oficial leída. */
export const VERIFICACION_TEXTO: Record<Verificacion, string> = {
  oficial: "Contrastada con el texto oficial leído (BOE, convenio o reglamento)",
  secundaria: "Basada en una fuente secundaria (libro de texto, guía), sin el texto oficial leído",
  general: "Conocimiento general del sector; no se ha contrastado con una fuente oficial",
};

export const preguntaSchema = z.object({
  id: z.string().regex(/^\d{4}-[\d.]+[a-z]?-\d{3}$/),
  tipo: z.literal("opcion_unica"),
  enunciado: z.string().min(5),
  opciones: z.array(z.string().min(1)).length(4),
  respuesta: z.number().int().min(0).max(3),
  explicacion: z.string().min(5),
  criterio: z.string(),
  fuente: z.string(),
  verificacion: z.enum(VERIFICACION),
  dificultad: z.number().int().min(1).max(3),
}).refine((q) => new Set(q.opciones).size === 4, { message: "opciones repetidas" });
export type Pregunta = z.infer<typeof preguntaSchema>;

export const bancoSchema = z.object({
  modulo: z.string(),
  tema: z.string(),
  titulo: z.string(),
  preguntas: z.array(preguntaSchema).min(1),
});

const testSchema = z.object({
  id: z.string(), titulo: z.string(), archivo: z.string(), apartados: z.array(z.string()), ra_extra: z.array(z.number()).optional(),
});
const unidadSchema = z.object({
  num: z.number(), titulo: z.string(), ra: z.array(z.number()), tests: z.array(testSchema),
});
export const catalogoSchema = z.object({
  modulos: z.array(z.object({
    codigo: z.string(), nombre: z.string(), horas: z.number(), disponible: z.boolean(),
    unidades: z.array(unidadSchema),
  })),
});
export type Catalogo = z.infer<typeof catalogoSchema>;
export type ModuloCat = Catalogo["modulos"][number];
export type UnidadCat = ModuloCat["unidades"][number];
export type TestCat = UnidadCat["tests"][number];
