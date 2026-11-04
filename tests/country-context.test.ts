import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eurostatValues, fetchCountryContext, fetchEurostatContext, fetchOecdContext, oecdContext, oecdRows, OECD_NON_EU } from "@/lib/sources/country-context";
import { SourceError } from "@/lib/sources/types";

/** Respuestas REALES guardadas el 04/11/2026: Eurostat para Grecia (código EL) y OCDE Economic Outlook para Japón. */
const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, "utf8");
const NOW = new Date("2026-11-04T00:00:00Z");
const BASES = { eurostat: "https://estat.test/data", oecd: "https://oecd.test/rest" };

afterEach(() => vi.unstubAllGlobals());

describe("lectura de Eurostat y de la OCDE", () => {
  it("Eurostat: valores por año y marca de provisional", () => {
    const g = eurostatValues(JSON.parse(fx("eurostat-el-growth.json")));
    expect(g.map((v) => v.year)).toEqual([2023, 2024, 2025]);
    expect(g.find((v) => v.year === 2025)).toMatchObject({ value: 2.1, provisional: true });
    expect(g.find((v) => v.year === 2023)?.provisional).toBeUndefined();
  });
  it("OCDE: lo anterior al año actual es observado; desde el actual, previsión", () => {
    const c = oecdContext(oecdRows(fx("oecd-eo-jpn.csv")), NOW)!;
    expect(c.growth).toMatchObject({ year: 2025 });
    expect(c.growth!.value).toBeCloseTo(1.054, 2);
    expect(c.growthForecasts.map((f) => f.year)).toEqual([2026, 2027]);
    expect(c.gdpPerCapita).toMatchObject({ year: 2025, unit: "USD_PPA" });
    expect(c.population!.year).toBe(2025);
  });
  it("OCDE: un CSV sin las columnas esperadas es un error de formato; filas vacías no son ceros", () => {
    expect(() => oecdRows("a,b,c\n1,2,3")).toThrow(SourceError);
    expect(oecdRows("MEASURE,TIME_PERIOD,OBS_VALUE\nPOP,2025,\nPOP,2024,5")).toEqual([{ measure: "POP", year: 2024, value: 5 }]);
    expect(oecdContext([], NOW)).toBeNull();
  });
});

describe("consultas", () => {
  const serve = (route: (u: string) => { status: number; body: string }) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); const r = route(u); return new Response(r.status === 204 ? null : r.body, { status: r.status }); }));
    return urls;
  };
  it("Eurostat: Grecia se pide como EL (con GR la respuesta llega vacía) y se combinan los tres indicadores", async () => {
    const urls = serve((u) => ({ status: 200, body: u.includes("nama_10_gdp") ? fx("eurostat-el-growth.json") : u.includes("nama_10_pc") ? fx("eurostat-el-gdppc.json") : fx("eurostat-el-pop.json") }));
    const c = (await fetchEurostatContext(BASES.eurostat, "GR"))!;
    expect(urls).toHaveLength(3);
    expect(urls.every((u) => u.includes("geo=EL") && !u.includes("geo=GR"))).toBe(true);
    expect(c).toMatchObject({ source: "eurostat", growthForecasts: [] });
    expect(c.gdpPerCapita).toMatchObject({ unit: "EUR", provisional: true });
    expect(c.population!.value).toBeGreaterThan(1e7);
  });
  it("OCDE: Japón en una sola consulta del Economic Outlook sin versión fija (= última edición) y con Accept */*", async () => {
    const accepts: (string | null)[] = [];
    const urls = serve(() => ({ status: 200, body: fx("oecd-eo-jpn.csv") }));
    const inner = globalThis.fetch as unknown as (u: string, init: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (u: string, init: RequestInit) => { const h = new Headers(init.headers as HeadersInit); accepts.push(`${h.get("accept")}|${h.get("accept-language")}`); return inner(u, init); }));
    const c = (await fetchOecdContext(BASES.oecd, "JP", NOW))!;
    expect(urls).toEqual(["https://oecd.test/rest/data/OECD.ECO.MAD,DSD_EO@DF_EO/JPN.POP+GDPVD_CAP+GDPV_ANNPCT.A?startPeriod=2023&format=csvfile"]);
    expect(c.source).toBe("oecd");
    expect(accepts).toEqual(["*/*|en"]); // con «text/csv» o con el Accept-Language «*» de Node la OCDE responde 500 (visto en vivo)
  });
  it("UE → Eurostat, miembros de la OCDE → OCDE, Marruecos y Emiratos → sin consulta", async () => {
    const urls = serve(() => ({ status: 404, body: "" }));
    await fetchCountryContext(BASES, "DE", NOW);
    await fetchCountryContext(BASES, "US", NOW);
    expect(await fetchCountryContext(BASES, "MA", NOW)).toBeNull();
    expect(await fetchCountryContext(BASES, "AE", NOW)).toBeNull();
    expect(urls.filter((u) => u.startsWith(BASES.eurostat))).toHaveLength(3);
    expect(urls.filter((u) => u.startsWith(BASES.oecd))).toHaveLength(1);
    expect(urls).toHaveLength(4);
    expect(Object.keys(OECD_NON_EU).sort()).toEqual(["CA", "CH", "GB", "JP", "MX", "NO", "US"]);
  });
  it("un error del servidor es un error, no un «sin datos»", async () => {
    serve(() => ({ status: 500, body: "x" }));
    await expect(fetchOecdContext(BASES.oecd, "JP", NOW)).rejects.toBeInstanceOf(SourceError);
    await expect(fetchEurostatContext(BASES.eurostat, "DE")).rejects.toBeInstanceOf(SourceError);
  });
});

describe("punto de llamada: el servicio de la ficha", () => {
  const cfg = (o: Record<string, unknown>) => ({ mode: "comext", cacheTtlMs: 1000, eurostatBase: BASES.eurostat, oecdBase: BASES.oecd, ...o }) as never;
  it("en demo o con datos sintéticos no consulta", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { lookupContext } = await import("@/lib/service");
    expect(await lookupContext({ marketCode: "DE", synthetic: false } as never, cfg({ mode: "demo" }))).toBeUndefined();
    expect(await lookupContext({ marketCode: "DE", synthetic: true } as never, cfg({}))).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
  it("si la fuente falla devuelve el error sin romper la ficha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const { lookupContext } = await import("@/lib/service");
    const r = await lookupContext({ marketCode: "FR", synthetic: false } as never, cfg({}));
    expect(r?.context).toBeNull();
    expect(r?.error).toMatch(/error HTTP 500/);
  });
});
