import { z } from "zod";
import { SourceError, safeFetchJson } from "@/lib/sources/types";
import type { SearchHit, SearchProvider } from "../types";

/**
 * Proveedor Tavily. Contrato verificado en la documentación oficial (27/10/2026): POST https://api.tavily.com/search,
 * cabecera Authorization: Bearer <clave>, cuerpo {query, search_depth, max_results, include_domains, exclude_domains}.
 * Plan gratuito declarado: 1.000 créditos al mes sin tarjeta (una búsqueda básica = 1 crédito); comprobar condiciones vigentes.
 * NO se ha probado con una clave real: falta TAVILY_API_KEY.
 */
const responseSchema = z.object({ results: z.array(z.object({ title: z.string().nullish(), url: z.string(), content: z.string().nullish() })) });

export function tavilyProvider(apiKey: string): SearchProvider {
  return {
    id: "tavily",
    async search({ query, maxResults, includeDomains, excludeDomains }): Promise<SearchHit[]> {
      let raw: unknown;
      try {
        raw = await safeFetchJson("https://api.tavily.com/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, search_depth: "basic", max_results: maxResults, include_domains: includeDomains, exclude_domains: excludeDomains }),
        });
      } catch (e) {
        if (e instanceof SourceError && e.status === 401) throw new SourceError("config", "La clave de Tavily no es válida.");
        if (e instanceof SourceError && (e.kind === "rate_limit" || e.status === 429 || e.status === 432 || e.status === 433)) throw new SourceError("rate_limit", "Se agotó la cuota de la API de búsqueda.");
        throw e;
      }
      const parsed = responseSchema.safeParse(raw);
      if (!parsed.success) throw new SourceError("parse", "Respuesta inesperada de la API de búsqueda.");
      return parsed.data.results.map((r) => ({ title: r.title ?? r.url, url: r.url, snippet: r.content ?? "" }));
    },
  };
}
