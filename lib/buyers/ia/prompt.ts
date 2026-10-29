import { z } from "zod";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { marketName } from "@/lib/config/catalog";
import { COMPANY_TYPES, type BuyerQuery } from "../types";

/**
 * Prompt y contrato de salida de las «pistas» de empresas sugeridas por IA.
 *
 * DECISIÓN (29/10/2026): el modelo se llama SIN la herramienta de búsqueda de Google. Los términos de la API de Gemini
 * restringen guardar y mostrar los «Grounded Results» a otros usuarios; sin esa herramienta, las empresas salen del
 * conocimiento del propio modelo y no hay resultados de búsqueda que almacenar. Contrapartida: el modelo puede inventar
 * nombres o webs. Por eso TODO lo que devuelve es una pista que audit.ts intenta comprobar leyendo la web de cada empresa,
 * y nada se presenta como verificado si esa lectura no lo confirma.
 */

const LANGUAGE: Record<string, string> = {
  DE: "alemán", AT: "alemán", CH: "alemán", FR: "francés", BE: "francés o neerlandés", LU: "francés o alemán", IT: "italiano", PT: "portugués", BR: "portugués",
  NL: "neerlandés", PL: "polaco", JP: "japonés", CN: "chino", KR: "coreano", SE: "sueco", DK: "danés", FI: "finés", NO: "noruego", CZ: "checo", SK: "eslovaco",
  HU: "húngaro", RO: "rumano", BG: "búlgaro", GR: "griego", HR: "croata", SI: "esloveno", EE: "estonio", LV: "letón", LT: "lituano", TR: "turco", SA: "árabe", AE: "árabe o inglés",
  MA: "francés o árabe", MX: "español", US: "inglés", GB: "inglés", IE: "inglés", CA: "inglés o francés", AU: "inglés", IN: "inglés", MT: "inglés", CY: "griego o inglés",
};

export const MAX_CANDIDATES = 15;

export const candidateSchema = z.object({
  nombre: z.string().min(2).max(120),
  web: z.string().max(200).nullable(),
  ciudad: z.string().max(80).nullable(),
  tipo: z.enum(COMPANY_TYPES),
  motivo: z.string().min(5).max(320),
  senalEspana: z.enum(["si", "no", "desconocida"]),
  confianza: z.enum(["alta", "media", "baja"]),
});
export const candidateListSchema = z.object({
  terminosProducto: z.array(z.string().min(2).max(40)).min(1).max(10),
  empresas: z.array(candidateSchema).max(MAX_CANDIDATES),
});
export type Candidate = z.infer<typeof candidateSchema>;
export type CandidateList = z.infer<typeof candidateListSchema>;

/** Esquema JSON enviado a la API. Los límites de longitud no se aplican allí: se vuelven a validar con Zod. */
export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    terminosProducto: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 },
    empresas: {
      type: "array",
      maxItems: MAX_CANDIDATES,
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          web: { type: ["string", "null"] },
          ciudad: { type: ["string", "null"] },
          tipo: { type: "string", enum: [...COMPANY_TYPES] },
          motivo: { type: "string" },
          senalEspana: { type: "string", enum: ["si", "no", "desconocida"] },
          confianza: { type: "string", enum: ["alta", "media", "baja"] },
        },
        required: ["nombre", "web", "ciudad", "tipo", "motivo", "senalEspana", "confianza"],
      },
    },
  },
  required: ["terminosProducto", "empresas"],
} as const;

export function productLabel(hs6: string): string {
  return HS_CATALOG.find((e) => e.code === hs6)?.name ?? `producto con código HS ${hs6}`;
}

export function buildPrompt(q: BuyerQuery, max = MAX_CANDIDATES): { system: string; input: string } {
  const country = marketName(q.country);
  const language = LANGUAGE[q.country] ?? "el idioma local";
  const n = Math.min(Math.max(1, Math.floor(max)), MAX_CANDIDATES);
  const system = [
    "Eres un analista de comercio exterior que ayuda a una pyme exportadora española a localizar posibles compradores.",
    "Respondes SOLO con un objeto JSON que cumple el esquema indicado, sin texto adicional.",
    "Reglas estrictas:",
    "1. No inventes. Incluye únicamente empresas que crees que existen de verdad. Si conoces pocas, devuelve pocas; una lista corta es mejor que una inventada.",
    "2. «web» es el dominio oficial SOLO si lo conoces con seguridad; si no, null. No adivines dominios ni uses buscadores, directorios, marketplaces genéricos ni redes sociales.",
    "3. No incluyas personas, correos ni teléfonos.",
    "4. «confianza» es «alta» únicamente si estás seguro de que la empresa existe y de su web; en otro caso «media» o «baja».",
    "5. «senalEspana» es «si» solo si sabes que la empresa comercializa producto de origen español; si no lo sabes, «desconocida». No es un requisito: incluye también empresas sin relación conocida con España.",
    "6. «motivo» explica en una frase por qué podría comprar este producto. Escríbelo en español y sin promesas.",
    "7. Tipos de empresa admitidos: importador, distribuidor, mayorista, minorista, mixto, otro.",
  ].join("\n");
  const input = [
    `Producto: ${productLabel(q.hs6)} (código HS ${q.hs6}).`,
    `País de destino: ${country}. Idioma local: ${language}.`,
    `Origen de la mercancía: España.`,
    `Devuelve hasta ${n} empresas de ${country} que importen, distribuyan, vendan al por mayor o comercialicen este tipo de producto, priorizando importadores y distribuidores con venta a profesionales.`,
    `En «terminosProducto» da de 3 a 8 palabras con las que se nombra este producto en ${language} (singular y plural) y en inglés, para poder buscarlas en las webs de esas empresas.`,
  ].join("\n");
  return { system, input };
}
