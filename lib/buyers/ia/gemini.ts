/**
 * Cliente mínimo de la API de Gemini (solo servidor / script). SIN la herramienta de búsqueda de Google (ver prompt.ts).
 *
 * Usa el endpoint documentado en https://ai.google.dev/gemini-api/docs/interactions (consultado el 29/10/2026):
 * POST /v1beta/interactions con `model`, `input`, `system_instruction`, `generation_config` y `response_format` (JSON + esquema).
 * NO VERIFICADO: la forma exacta de la RESPUESTA en REST no aparece en esa documentación. `extractModelText` prueba
 * varias formas conocidas y, si no reconoce ninguna, falla con las claves de primer nivel para poder corregirlo (nunca
 * incluye la clave de API ni el contenido enviado).
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  constructor(public kind: "config" | "http" | "network" | "format", message: string) {
    super(message);
    this.name = "GeminiError";
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
  fetchImpl?: typeof fetch;
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

export async function callGemini(r: GeminiRequest): Promise<{ data: unknown; model: string }> {
  const key = r.apiKey?.trim();
  if (!key) throw new GeminiError("config", "Falta GEMINI_API_KEY en el entorno (clave gratuita de Google AI Studio).");
  const model = r.model?.trim() || DEFAULT_GEMINI_MODEL;
  const base = (r.baseUrl?.trim() || DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, "");
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
    throw new GeminiError("network", timeout ? "La API de Gemini no respondió a tiempo." : "No se pudo conectar con la API de Gemini.");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? ""; } catch { /* sin cuerpo JSON */ }
    detail = detail.replaceAll(key, "[clave]").slice(0, 300);
    throw new GeminiError("http", `La API de Gemini respondió ${res.status}${detail ? `: ${detail}` : ""}.`);
  }
  let json: unknown;
  try { json = await res.json(); } catch { throw new GeminiError("format", "La respuesta de Gemini no es JSON."); }
  const text = extractModelText(json);
  if (!text) {
    const keys = json && typeof json === "object" ? Object.keys(json as object).slice(0, 12).join(", ") : typeof json;
    throw new GeminiError("format", `No se reconoce el texto en la respuesta de Gemini (claves de primer nivel: ${keys}). Hay que ajustar extractModelText.`);
  }
  try { return { data: parseJsonText(text), model }; } catch { throw new GeminiError("format", "El texto generado por Gemini no es JSON válido."); }
}
