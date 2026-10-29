import { fetchPageSafe, type FetchPageResult } from "../fetch-page";
import { productTerms } from "../service";
import type { BuyerQuery } from "../types";
import { auditCandidates } from "./audit";
import { callGemini, DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL, GeminiError } from "./gemini";
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
  /** Modelo de respaldo si el principal falla por saturación o tiempo de espera. `null` = sin respaldo. */
  fallbackModel?: string | null;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Mensajes de avance para quien lanza el script (no se guardan). */
  onProgress?: (msg: string) => void;
}
export interface GenerateStats { suggested: number; verified: number; unverified: number; discarded: string[]; modelsTried: string[] }

const cleanTerms = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2 && x.length <= 40))];

/** Pide pistas a Gemini (sin búsqueda de Google), las audita leyendo las webs y devuelve la lista lista para guardar. */
export async function generatePistas(q: BuyerQuery, deps: GenerateDeps): Promise<{ set: IaSet; stats: GenerateStats }> {
  const now = deps.now ?? (() => new Date());
  const say = deps.onProgress ?? (() => {});
  const { system, input } = buildPrompt(q, deps.max);
  const primary = deps.model?.trim() || DEFAULT_GEMINI_MODEL;
  const fallback = deps.fallbackModel === undefined ? FALLBACK_GEMINI_MODEL : deps.fallbackModel;
  const models = [primary, ...(fallback && fallback !== primary ? [fallback] : [])];
  const tried: string[] = [];
  let result: { data: unknown; model: string } | null = null;
  for (const m of models) {
    tried.push(m);
    say(`Consultando Gemini (${m})… puede tardar hasta un par de minutos.`);
    try {
      result = await callGemini({ apiKey: deps.apiKey, model: m, baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl, system, input, schema: RESPONSE_JSON_SCHEMA,
        timeoutMs: deps.timeoutMs, sleep: deps.sleep, onRetry: (n, e) => say(`${e.message} Reintento ${n}…`) });
      break;
    } catch (e) {
      const last = m === models[models.length - 1];
      if (!(e instanceof GeminiError) || !e.transient || last) throw e;
      say(`${e.message} Se prueba con el modelo de respaldo.`);
    }
  }
  if (!result) throw new GeminiError("network", "Ningún modelo respondió.");
  const { data, model } = result;
  const parsed = candidateListSchema.safeParse(data);
  if (!parsed.success) throw new Error(`La respuesta de Gemini no cumple el formato esperado: ${parsed.error.issues[0]?.path.join(".") || "raíz"}: ${parsed.error.issues[0]?.message}.`);
  say(`Gemini (${model}) sugirió ${parsed.data.empresas.length} empresas. Comprobando sus webs…`);
  const terms = cleanTerms([...parsed.data.terminosProducto, ...productTerms(q)]);
  const { companies, discarded } = await auditCandidates(parsed.data.empresas, { hs6: q.hs6, country: q.country, terms, model }, { fetchPage: deps.fetchPage ?? fetchPageSafe, now, onProgress: say });
  const verified = companies.filter((c) => c.ia?.verificacion === "verificada").length;
  return {
    set: { hs6: q.hs6, country: q.country, generadoEn: now().toISOString().slice(0, 10), modelo: model, scope: productLabel(q.hs6), companies },
    stats: { suggested: parsed.data.empresas.length, verified, unverified: companies.length - verified, discarded, modelsTried: tried },
  };
}
