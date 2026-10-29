/**
 * Cliente mínimo de la API de Gemini (solo servidor / script). SIN la herramienta de búsqueda de Google (ver prompt.ts).
 *
 * Usa el endpoint documentado en https://ai.google.dev/gemini-api/docs/interactions (consultado el 29/10/2026):
 * POST /v1beta/interactions con `model`, `input`, `system_instruction`, `generation_config` y `response_format` (JSON + esquema).
 * Forma de la respuesta COMPROBADA con la API real el 29/10/2026 (gemini-3.5-flash-lite): `steps[]` con un paso
 * `{type:"thought"}` y otro `{type:"model_output", content:[{type:"text", text}]}`. `extractModelText` acepta además
 * otras formas por si cambia, y si no reconoce ninguna falla con las claves de primer nivel (nunca con la clave de API).
 *
 * Disponibilidad observada el 29/10/2026 con una clave nueva: `gemini-2.5-flash` → 404 «no longer available to new
 * users» (Google recomienda gemini-3.8-flash y esta API); `gemini-3.8-flash` → tiempos de espera y 503 repetidos;
 * `gemini-3.5-flash-lite` → respuesta en 3 s. Por eso hay reintentos y un modelo de respaldo (generate.ts).
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  constructor(public kind: "config" | "http" | "network" | "format", message: string, public status?: number) {
    super(message);
    this.name = "GeminiError";
  }
  /** Fallos pasajeros (saturación, límite de ritmo, tiempo de espera): tiene sentido reintentar o cambiar de modelo. */
  get transient(): boolean {
    return this.kind === "network" || (this.kind === "http" && [429, 500, 502, 503, 504].includes(this.status ?? 0));
  }
}

export interface GeminiRequest {
  apiKey: string | undefined;
  model?: string;
  system: string;
  input: string;
  schema: unknown;
  baseUrl?: string;
  timeoutMs?: number;
  /** Reintentos ante fallos pasajeros (por defecto 1). */
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: GeminiError) => void;
}

function textOfContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content.map((c) => (c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).filter(Boolean);
    return parts.length ? parts.join("") : null;
  }
  return null;
}

/** Busca el texto generado en las formas de respuesta conocidas. Devuelve null si no reconoce ninguna. */
export function extractModelText(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.output_text === "string" && o.output_text) return o.output_text;
  if (Array.isArray(o.steps)) {
    const texts = o.steps
      .filter((s) => s && typeof s === "object" && (s as { type?: unknown }).type === "model_output")
      .map((s) => textOfContent((s as { content?: unknown }).content ?? (s as { text?: unknown }).text))
      .filter((t): t is string => !!t);
    if (texts.length) return texts.join("");
  }
  const cand = (o.candidates as { content?: { parts?: unknown } }[] | undefined)?.[0]?.content?.parts;
  const fromCand = textOfContent(cand);
  if (fromCand) return fromCand;
  return null;
}

/** Quita vallas de código ```json … ``` por si el modelo las añade. */
export function parseJsonText(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

async function callOnce(r: GeminiRequest, key: string, model: string, base: string): Promise<unknown> {
  const doFetch = r.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${base}/v1beta/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model,
        input: r.input,
        system_instruction: r.system,
        generation_config: { temperature: 0.2 },
        response_format: { type: "text", mime_type: "application/json", schema: r.schema },
      }),
      signal: AbortSignal.timeout(r.timeoutMs ?? 90_000),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new GeminiError("network", timeout ? `La API de Gemini no respondió a tiempo (modelo ${model}).` : "No se pudo conectar con la API de Gemini.");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? ""; } catch { /* sin cuerpo JSON */ }
    detail = detail.replaceAll(key, "[clave]").slice(0, 300).replace(/[.\s]+$/, "");
    throw new GeminiError("http", `La API de Gemini respondió ${res.status} (modelo ${model})${detail ? `: ${detail}` : ""}.`, res.status);
  }
  try { return await res.json(); } catch { throw new GeminiError("format", "La respuesta de Gemini no es JSON."); }
}

export async function callGemini(r: GeminiRequest): Promise<{ data: unknown; model: string }> {
  const key = r.apiKey?.trim();
  if (!key) throw new GeminiError("config", "Falta GEMINI_API_KEY en el entorno (clave gratuita de Google AI Studio).");
  const model = r.model?.trim() || DEFAULT_GEMINI_MODEL;
  const base = (r.baseUrl?.trim() || DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, "");
  const sleep = r.sleep ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const retries = Math.max(0, r.retries ?? 1);
  let json: unknown;
  for (let attempt = 0; ; attempt++) {
    try { json = await callOnce(r, key, model, base); break; } catch (e) {
      if (!(e instanceof GeminiError) || !e.transient || attempt >= retries) throw e;
      r.onRetry?.(attempt + 1, e);
      await sleep(5_000 * (attempt + 1));
    }
  }
  const text = extractModelText(json);
  if (!text) {
    const keys = json && typeof json === "object" ? Object.keys(json as object).slice(0, 12).join(", ") : typeof json;
    throw new GeminiError("format", `No se reconoce el texto en la respuesta de Gemini (claves de primer nivel: ${keys}). Hay que ajustar extractModelText.`);
  }
  try { return { data: parseJsonText(text), model }; } catch { throw new GeminiError("format", "El texto generado por Gemini no es JSON válido."); }
}
