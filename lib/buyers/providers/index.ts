import type { SearchProvider } from "../types";
import { tavilyProvider } from "./tavily";

/** Para cambiar de proveedor basta con añadir otro adaptador que cumpla SearchProvider y devolverlo aquí. */
export function getSearchProvider(env: Record<string, string | undefined> = process.env): SearchProvider | null {
  const key = env.TAVILY_API_KEY?.trim();
  return key ? tavilyProvider(key) : null;
}
