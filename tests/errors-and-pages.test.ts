import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import { parseQuery } from "@/lib/schemas/query";
import { getRanking } from "@/lib/service";
import { classifyComextResponse, comextFetch } from "@/lib/sources/comext";
import { isQueryError, SourceError } from "@/lib/sources/types";

/**
 * Regresiones del 06/11/2026:
 * - Un código que Eurostat no reconoce devolvía un «HTTP 413» genérico: Eurostat descarta el filtro de producto, estima
 *   millones de filas y responde {"error":[{"status":413,"label":"EXTRACTION_TOO_BIG…"}]} (lista, no objeto).
 * - Una página fuera de rango mostraba una tabla vacía sin explicación.
 * - La interfaz no debe mostrar puntuaciones, percentiles ni enlaces a la búsqueda de compradores retirada.
 */
const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("errores de Eurostat", () => {
  const tooBig = { error: [{ status: 413, label: "EXTRACTION_TOO_BIG: The requested extraction is too big, estimated 12000000 rows" }] };
  it("clasifica el error en forma de lista y distingue «extracción demasiado grande»", () => {
    expect(classifyComextResponse(413, tooBig)).toMatchObject({ type: "too_big" });
    expect(classifyComextResponse(400, { error: [{ status: 400, label: "140 Syntax error" }] })).toMatchObject({ type: "error", label: "140 Syntax error" });
  });
  it("un código no reconocido es un error de la consulta (404), no un fallo temporal del proveedor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(tooBig), { status: 413 }));
    const e = (await comextFetch("https://example.invalid/x", { attempts: 1 }).catch((x: unknown) => x)) as SourceError;
    expect(e).toBeInstanceOf(SourceError);
    expect(e.kind).toBe("not_found");
    expect(isQueryError(e.kind)).toBe(true);
    expect(e.message).toMatch(/no reconoce el código/);
    expect(isQueryError("http")).toBe(false);
    expect(isQueryError("pending")).toBe(false);
  });
});

describe("paginación", () => {
  const cfg = getConfig({ SMARTRADE_DATA_MODE: "demo" } as never);
  const q = (o: Record<string, string>) => { const p = parseQuery(o); if (!p.success) throw new Error("query"); return p.data; };
  it("una página que no existe se marca como fuera de rango y no inventa filas", async () => {
    const first = await getRanking(q({}), cfg);
    expect(first.pageOutOfRange).toBe(false);
    const out = await getRanking(q({ page: String(first.pages + 5) }), cfg);
    expect(out.pageOutOfRange).toBe(true);
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(first.total);
  });
  it("la portada explica la página fuera de rango", () => {
    expect(sinComentarios(readFileSync("app/mercados/page.tsx", "utf8"))).toMatch(/pageOutOfRange/);
  });
});

describe("interfaz sin puntuación ni compradores", () => {
  const files = ["app/mercados/page.tsx", "app/oportunidad/[id]/page.tsx", "app/comparar/page.tsx", "app/guia/page.tsx", "components/opportunity-table.tsx", "components/search-form.tsx", "components/entry-paths.tsx", "components/research-checklist.tsx"];
  it.each(files)("%s no habla de puntuación, percentiles ni enlaza a compradores", (f) => {
    // Se permite decir que NO hay puntuación («no hay puntuación», «Sin puntuaciones»): es el aviso, no la métrica.
    const src = sinComentarios(readFileSync(f, "utf8")).replace(/(no hay|sin) puntuaci(ón|ones)/gi, "");
    expect(src).not.toMatch(/puntuaci[oó]n|percentil|Potencial de cuota|Mercados grandes/i);
    expect(src).not.toMatch(/href=[^>]*\/compradores/);
  });
  it("/compradores es una página estática que no consulta nada", () => {
    const src = sinComentarios(readFileSync("app/compradores/page.tsx", "utf8"));
    expect(src).not.toMatch(/fetch|tavily|lib\/buyers|async function/i);
    expect(src).toMatch(/retirada/);
  });
});

// Portada (09/11/2026): `/` es el Modo Aprendizaje; las URLs antiguas del análisis se llevan intactas a /mercados.
describe("portada y URLs antiguas", () => {
  it("next.config redirige a /mercados con todos los parámetros de búsqueda", async () => {
    const { querySchema } = await import("@/lib/schemas/query");
    type Rule = { source: string; destination: string; permanent: boolean; has?: unknown[] };
    // @ts-expect-error next.config.mjs es JavaScript sin tipos; aquí solo se leen dos exportaciones.
    const cfg = (await import("../next.config.mjs")) as { ANALYSIS_PARAMS: string[]; default: { redirects: () => Promise<Rule[]> } };
    expect([...cfg.ANALYSIS_PARAMS].sort()).toEqual(Object.keys(querySchema.shape).sort());
    const rules = await cfg.default.redirects();
    expect(rules.filter((r) => r.source === "/" && r.destination === "/mercados")).toHaveLength(cfg.ANALYSIS_PARAMS.length);
    expect(rules).toContainEqual({ source: "/aprendizaje", destination: "/", permanent: true });
    // Solo con parámetros del análisis: un `?utm_source=…` en la portada no debe llevar a /mercados.
    expect(rules.some((r) => r.source === "/" && !("has" in r))).toBe(false);
  });
  it("ningún formulario ni enlace del análisis apunta ya a la portada con una búsqueda", () => {
    for (const f of ["app/mercados/page.tsx", "app/comparar/page.tsx", "app/oportunidad/[id]/page.tsx", "app/guia/page.tsx", "components/search-form.tsx", "components/entry-paths.tsx", "components/source-switch.tsx"]) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/[`"']\/\?|action="\/"/);
    }
  });
});

describe("404 de verdad (auditoría del 11/11/2026)", () => {
  // Con un app/loading.tsx general, toda página empezaba a responder (200) antes de saber si existía: las direcciones
  // inexistentes mostraban «no encontrada» con un 200. Comprobado a mano con `next start` el 11/11/2026: 404 en los casos
  // y en las fichas mal formadas.
  it("no hay esqueleto de carga general; solo en las páginas que consultan datos", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync("app/loading.tsx")).toBe(false);
    for (const p of ["app/mercados/loading.tsx", "app/comparar/loading.tsx"]) expect(existsSync(p)).toBe(true);
  });
  it("los casos solo existen si están en su catálogo, y la ficha valida el identificador antes de cargar", () => {
    for (const k of ["exportacion", "importacion", "negociacion"]) {
      const src = readFileSync(`app/aprendizaje/${k}/[caso]/page.tsx`, "utf8");
      expect(src).toMatch(/export const dynamicParams = false;/);
      expect(src).toMatch(/export const generateStaticParams/);
    }
    const detail = readFileSync("app/oportunidad/[id]/page.tsx", "utf8");
    expect(detail.indexOf("idSchema.safeParse(id)")).toBeGreaterThan(-1);
    expect(detail.indexOf("idSchema.safeParse(id)")).toBeLessThan(detail.indexOf("<Suspense"));
  });
});
