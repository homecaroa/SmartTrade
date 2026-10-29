import { afterEach, describe, expect, it, vi } from "vitest";
import { getSearchProvider } from "@/lib/buyers/providers";
import { tavilyProvider } from "@/lib/buyers/providers/tavily";

afterEach(() => vi.restoreAllMocks());
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("proveedor Tavily (respuestas simuladas; sin clave real)", () => {
  it("envía POST con Bearer y el cuerpo documentado, y normaliza resultados", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ results: [{ title: "FICTICIO", url: "https://ejemplo.test", content: "texto" }, { url: "https://b.test" }] }));
    const hits = await tavilyProvider("tvly-FICTICIA").search({ query: "wine importer Japan", maxResults: 5, excludeDomains: ["zoominfo.com"] });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.tavily.com/search");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tvly-FICTICIA");
    expect(JSON.parse(String(init?.body))).toMatchObject({ query: "wine importer Japan", search_depth: "basic", max_results: 5, exclude_domains: ["zoominfo.com"] });
    expect(hits).toEqual([{ title: "FICTICIO", url: "https://ejemplo.test", snippet: "texto" }, { title: "https://b.test", url: "https://b.test", snippet: "" }]);
  });
  it("traduce errores: clave no válida, cuota agotada y respuesta inesperada, sin exponer la clave", async () => {
    const p = tavilyProvider("tvly-SECRETA");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}, 401));
    await expect(p.search({ query: "x", maxResults: 1 })).rejects.toMatchObject({ kind: "config" });
    for (const status of [429, 432, 433]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}, status));
      await expect(p.search({ query: "x", maxResults: 1 })).rejects.toMatchObject({ kind: "rate_limit" });
    }
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ otra: 1 }));
    const err = await p.search({ query: "x", maxResults: 1 }).catch((e) => e);
    expect(err).toMatchObject({ kind: "parse" });
    expect(String(err.message)).not.toContain("SECRETA");
  });
  it("sin TAVILY_API_KEY no hay proveedor (el modo curado sigue funcionando)", () => {
    expect(getSearchProvider({})).toBeNull();
    expect(getSearchProvider({ TAVILY_API_KEY: "  " })).toBeNull();
    expect(getSearchProvider({ TAVILY_API_KEY: "tvly-x" })?.id).toBe("tavily");
  });
});
