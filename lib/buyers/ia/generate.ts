import { fetchPageSafe, type FetchPageResult } from "../fetch-page";
import { productTerms } from "../service";
import type { BuyerQuery } from "../types";
import { auditCandidates } from "./audit";
import { callGemini, DEFAULT_GEMINI_MODEL } from "./gemini";
import { buildPrompt, candidateListSchema, productLabel, RESPONSE_JSON_SCHEMA } from "./prompt";
import type { IaSet } from "./store";

export interface GenerateDeps {
  apiKey: string | undefined;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  fetchPage?: (url: string) => Promise<FetchPageResult>;
  now?: () => Date;
  max?: number;
}
export interface GenerateStats { suggested: number; verified: number; unverified: number; discarded: string[] }

const cleanTerms = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2 && x.length <= 40))];

/** Pide pistas a Gemini (sin búsqueda de Google), las audita leyendo las webs y devuelve la lista lista para guardar. */
export async function generatePistas(q: BuyerQuery, deps: GenerateDeps): Promise<{ set: IaSet; stats: GenerateStats }> {
  const now = deps.now ?? (() => new Date());
  const { system, input } = buildPrompt(q, deps.max);
  const { data, model } = await callGemini({ apiKey: deps.apiKey, model: deps.model ?? DEFAULT_GEMINI_MODEL, baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl, system, input, schema: RESPONSE_JSON_SCHEMA });
  const parsed = candidateListSchema.safeParse(data);
  if (!parsed.success) throw new Error(`La respuesta de Gemini no cumple el formato esperado: ${parsed.error.issues[0]?.path.join(".") || "raíz"}: ${parsed.error.issues[0]?.message}.`);
  const terms = cleanTerms([...parsed.data.terminosProducto, ...productTerms(q)]);
  const { companies, discarded } = await auditCandidates(parsed.data.empresas, { hs6: q.hs6, country: q.country, terms, model }, { fetchPage: deps.fetchPage ?? fetchPageSafe, now });
  const verified = companies.filter((c) => c.ia?.verificacion === "verificada").length;
  return {
    set: { hs6: q.hs6, country: q.country, generadoEn: now().toISOString().slice(0, 10), modelo: model, scope: productLabel(q.hs6), companies },
    stats: { suggested: parsed.data.empresas.length, verified, unverified: companies.length - verified, discarded },
  };
}
