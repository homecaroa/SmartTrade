import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrLoad, clearCache } from "@/lib/cache/ttl-cache";
import { buildComextUrl, comextToObservations } from "@/lib/sources/comext";
import { comtradeToObservations } from "@/lib/sources/comtrade";
import { demoSource } from "@/lib/sources/demo";
import { parseJsonStat } from "@/lib/sources/jsonstat";
import { SourceError, safeFetchJson } from "@/lib/sources/types";

// Estructura JSON-stat construida a mano (respuesta controlada, NO es una respuesta real de Eurostat).
const fixture = {
  id: ["reporter", "partner", "product", "flow", "indicators", "time"],
  size: [1, 2, 1, 1, 2, 2],
  dimension: {
    reporter: { category: { index: { DE: 0 } } },
    partner: { category: { index: { WORLD: 0, ES: 1 } } },
    product: { category: { index: { "220421": 0 }, label: { "220421": "Virgin olive oil" } } },
    flow: { category: { index: { "1": 0 } } },
    indicators: { category: { index: { VALUE_IN_EUROS: 0, QUANTITY_IN_100KG: 1 } } },
    time: { category: { index: { "2023": 0, "2024": 1 } } },
  },
  // orden: partner × indicators × time. WORLD: value(2023=100,2024=null), qty(2023=10,2024=11); ES: value(2023=5, 2024 ausente)
  value: { "0": 100, "2": 10, "3": 11, "4": 5 },
};

afterEach(() => { vi.restoreAllMocks(); clearCache(); });

describe("adaptador Comext (respuesta controlada)", () => {
  const obs = comextToObservations(parseJsonStat(fixture), "2025-01-01T00:00:00Z");
  it("normaliza y no convierte celdas ausentes en cero", () => {
    const world23 = obs.find((o) => o.partnerCode === "WORLD" && o.period === "2023")!;
    expect(world23.tradeValue).toBe(100);
    expect(world23.netWeight).toBe(1000);
    expect(world23.currency).toBe("EUR");
    expect(world23.synthetic).toBe(false);
    expect(world23.productName).toBe("Virgin olive oil");
    // WORLD 2024: valor ausente -> no existe observación (aunque haya cantidad)
    expect(obs.find((o) => o.partnerCode === "WORLD" && o.period === "2024")).toBeUndefined();
    expect(obs.find((o) => o.partnerCode === "ES" && o.period === "2024")).toBeUndefined();
    expect(obs).toHaveLength(2);
  });
  it("convierte 100 kg → kg sin errores de coma flotante", () => {
    const js = parseJsonStat({ ...fixture, value: { "0": 100, "2": 131716.67 } });
    const w = comextToObservations(js, "x").find((o) => o.partnerCode === "WORLD")!;
    expect(w.netWeight).toBe(13171667);
  });
  it("rechaza respuestas con formato inesperado", () => {
    expect(() => parseJsonStat({ foo: 1 })).toThrow(SourceError);
    const bad = { ...fixture, id: ["reporter"] };
    expect(() => comextToObservations(parseJsonStat({ ...bad, size: [1] }), "x")).toThrow(/dimensión/);
  });
  it("construye URLs filtradas", () => {
    const u = new URL(buildComextUrl("https://example.org/data", "ds-x", { reporter: ["DE"], time: ["2023", "2024"] }));
    expect(u.searchParams.getAll("time")).toEqual(["2023", "2024"]);
    expect(u.pathname).toBe("/data/ds-x");
  });
});

describe("adaptador Comtrade (respuesta controlada)", () => {
  it("normaliza en USD y descarta países no solicitados", () => {
    const raw = { data: [
      { period: 2023, reporterISO: "DEU", partnerISO: "W00", partnerCode: 0, cmdCode: "220421", flowCode: "M", primaryValue: 50 },
      { period: 2023, reporterISO: "FRA", partnerISO: "W00", partnerCode: 0, cmdCode: "220421", flowCode: "M", primaryValue: 70 },
      { period: 2023, reporterISO: "DEU", partnerISO: "ESP", cmdCode: "220421", flowCode: "M", primaryValue: null },
    ] };
    const obs = comtradeToObservations(raw, "x", new Set(["DE"]));
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ reporterCode: "DE", partnerCode: "WORLD", currency: "USD", tradeValue: 50 });
  });
});

describe("errores de fuentes externas", () => {
  it("HTTP 429, 500, red y JSON inválido se tipifican", async () => {
    const mk = (status: number, body = "{}") => vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status }));
    mk(429); await expect(safeFetchJson("https://x.test")).rejects.toMatchObject({ kind: "rate_limit" });
    mk(500); await expect(safeFetchJson("https://x.test")).rejects.toMatchObject({ kind: "http", status: 500 });
    mk(200, "<html>"); await expect(safeFetchJson("https://x.test")).rejects.toMatchObject({ kind: "parse" });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(safeFetchJson("https://x.test")).rejects.toMatchObject({ kind: "network" });
  });
  it("los mensajes de error no incluyen la clave", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(safeFetchJson("https://x.test", { headers: { "Ocp-Apim-Subscription-Key": "SECRETO" } })).rejects.not.toThrow(/SECRETO/);
  });
});

describe("caché", () => {
  it("sirve caché fresca, recarga al caducar y marca obsoleta si la fuente falla", async () => {
    let t = 1000;
    const now = () => t;
    const loader = vi.fn().mockResolvedValueOnce("a").mockRejectedValueOnce(new Error("caída"));
    const first = await getOrLoad("k", 100, loader, now);
    expect(first).toMatchObject({ value: "a", fromCache: false, stale: false });
    t += 50;
    expect((await getOrLoad("k", 100, loader, now)).fromCache).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    t += 200;
    const stale = await getOrLoad("k", 100, loader, now);
    expect(stale).toMatchObject({ value: "a", stale: true, staleReason: "caída" });
    expect(stale.ageMs).toBe(250);
  });
  it("sin caché previa propaga el error (no inventa datos)", async () => {
    await expect(getOrLoad("nuevo", 100, async () => { throw new SourceError("http", "fallo"); })).rejects.toThrow("fallo");
  });
});

describe("separación real / sintético", () => {
  it("todos los datos demo son sintéticos y están etiquetados", async () => {
    const r = await demoSource.fetchData({ years: [2022, 2023, 2024], productCodes: null, markets: ["DE", "FR"] });
    expect(r.synthetic).toBe(true);
    expect(r.observations.length).toBeGreaterThan(0);
    expect(r.observations.every((o) => o.synthetic && o.source.includes("DEMO"))).toBe(true);
  });
  it("los adaptadores reales nunca producen datos sintéticos", () => {
    expect(comextToObservations(parseJsonStat(fixture), "x").every((o) => !o.synthetic)).toBe(true);
  });
  it("el demo es determinista (sin cifras aleatorias)", async () => {
    const q = { years: [2024], productCodes: ["220421"], markets: ["DE"] };
    const a = (await demoSource.fetchData(q)).observations.map((o) => o.tradeValue);
    const b = (await demoSource.fetchData(q)).observations.map((o) => o.tradeValue);
    expect(a).toEqual(b);
  });
});
