import { DATA_MODES, type DataMode } from "@/lib/schemas/trade";
import { COMTRADE_MARKET_CODES, DEMO_MARKET_CODES, MARKETS, type Market } from "./catalog";

export interface AppConfig {
  mode: DataMode;
  cacheTtlMs: number;
  defaultYear: number;
  comextBase: string;
  comextDataset: string;
  comtradeKey: string | null;
  /** true si el servidor permite consultar mercados fuera de la UE (modo comext + clave de Comtrade). */
  outsideAvailable: boolean;
}

const positive = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * `fuente`: "fuera" pide los mercados fuera de la UE (UN Comtrade). Solo se concede si el servidor está en modo comext
 * y tiene clave de Comtrade; en cualquier otro caso se ignora y se mantiene el modo configurado.
 */
export function getConfig(env: Record<string, string | undefined> = process.env, fuente?: string): AppConfig {
  const envMode = env.SMARTRADE_DATA_MODE ?? "demo";
  if (!(DATA_MODES as readonly string[]).includes(envMode)) {
    throw new Error(`SMARTRADE_DATA_MODE inválido: "${envMode}". Valores permitidos: ${DATA_MODES.join(", ")}`);
  }
  const key = env.COMTRADE_API_KEY?.trim() || null;
  const outsideAvailable = envMode === "comext" && key !== null;
  const mode = fuente === "fuera" && outsideAvailable ? "comtrade" : envMode;
  return {
    mode: mode as DataMode,
    outsideAvailable,
    cacheTtlMs: positive(env.CACHE_TTL_SECONDS, 3600) * 1000,
    defaultYear: Math.min(2025, Math.max(2018, positive(env.DEFAULT_END_YEAR, 2024))),
    comextBase:
      env.COMEXT_BASE_URL ?? "https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data",
    comextDataset: env.COMEXT_DATASET ?? "ds-045409",
    comtradeKey: key,
  };
}

/** Mercados que cada modo puede analizar como declarantes de importaciones. */
export function allowedMarkets(mode: DataMode): Market[] {
  if (mode === "demo") return MARKETS.filter((m) => DEMO_MARKET_CODES.includes(m.code));
  if (mode === "comext") return MARKETS.filter((m) => m.eu);
  return MARKETS.filter((m) => COMTRADE_MARKET_CODES.includes(m.code));
}
