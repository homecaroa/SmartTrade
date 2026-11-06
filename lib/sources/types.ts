import type { DataMode, TradeObservation } from "@/lib/schemas/trade";

/**
 * Tipos de error de las fuentes. «config» y «not_found» son de la consulta del usuario (código no válido o que la fuente
 * no reconoce); el resto son fallos del proveedor (temporales o de formato). La UI los distingue (app/page.tsx).
 */
export type SourceErrorKind = "config" | "not_found" | "http" | "rate_limit" | "network" | "parse" | "too_large" | "pending";

/** ¿Es un problema de la consulta (no tiene sentido reintentar) o del proveedor? */
export const isQueryError = (k: SourceErrorKind) => k === "config" || k === "not_found";

export class SourceError extends Error {
  constructor(
    public kind: SourceErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export interface SourceQuery {
  years: number[];
  /** null = todos los productos disponibles (solo demo). */
  productCodes: string[] | null;
  markets: string[]; // ISO2
}

export interface SourceResult {
  observations: TradeObservation[];
  retrievedAt: string;
  sourceLabel: string;
  warnings: string[];
  synthetic: boolean;
}

export interface SupplierQuery {
  market: string;
  productCode: string;
  years: number[];
}

export interface TradeSource {
  mode: DataMode;
  label: string;
  fetchData(q: SourceQuery): Promise<SourceResult>;
  /** Importaciones del mercado por país proveedor (excluye agregados). */
  fetchSuppliers(q: SupplierQuery): Promise<TradeObservation[]>;
}

export const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 25_000;

export interface RawResponse {
  status: number;
  /** Cuerpo JSON si lo hay; null si el cuerpo no es JSON (solo posible con estado no 2xx). */
  json: unknown | null;
}

/**
 * fetch con timeout y límite de tamaño. Devuelve el estado HTTP y el JSON (si lo hay) sin interpretar errores de la
 * fuente, salvo 429 (rate_limit). Nunca incluye cabeceras/claves ni la URL en los mensajes de error.
 */
export async function rawFetchJson(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<RawResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    const given = init.headers instanceof Headers || Array.isArray(init.headers) ? Object.fromEntries(new Headers(init.headers).entries()) : ((init.headers ?? {}) as Record<string, string>);
    const headers: Record<string, string> = { accept: "application/json", "user-agent": "SmarTrade/0.1 (proyecto académico de comercio internacional)", ...given };
    res = await fetch(url, { ...init, headers, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    throw new SourceError("network", e instanceof Error && e.name === "AbortError" ? "La fuente no respondió a tiempo" : "No se pudo contactar con la fuente");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new SourceError("rate_limit", "Límite de consultas de la fuente alcanzado", 429);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_RESPONSE_BYTES) throw new SourceError("too_large", "Respuesta de la fuente demasiado grande");
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new SourceError("too_large", "Respuesta de la fuente demasiado grande");
  // Cuerpo vacío (p. ej. 204 No Content de la API de la OMC cuando no hay datos): sin JSON, no es un error de formato.
  if (text.trim() === "") return { status: res.status, json: null };
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    if (res.ok) throw new SourceError("parse", "La fuente devolvió una respuesta que no es JSON válido");
    return { status: res.status, json: null };
  }
}

/** Como rawFetchJson, pero cualquier estado no 2xx es un error tipificado. */
export async function safeFetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const r = await rawFetchJson(url, init);
  if (r.status < 200 || r.status >= 300) throw new SourceError("http", `La fuente respondió con error HTTP ${r.status}`, r.status);
  return r.json;
}
