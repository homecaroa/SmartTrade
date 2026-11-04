import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMarketAccess, type TariffLookup } from "@/lib/market-access";
import { combineMfn, fetchWtoTariff, latestPreference, wtoRows, wtoUrl } from "@/lib/sources/wto";
import { SourceError } from "@/lib/sources/types";

/** Respuestas REALES de la API Timeseries de la OMC guardadas el 03/11/2026 (Japón, socio España para el preferencial). */
const fx = (pc: string, i: string) => wtoRows(JSON.parse(readFileSync(`tests/fixtures/wto-jp-${pc}-${i}.json`, "utf8")));
const mfn = (pc: string) => combineMfn(fx(pc, "HS_A_0010"), fx(pc, "HS_A_0040"), fx(pc, "HS_A_0050"));
const BASE = "https://wto.test/timeseries/v1";

afterEach(() => vi.unstubAllGlobals());

describe("lectura de los datos de la OMC", () => {
  it("vino en Japón: todas las líneas son derechos por unidad → sin porcentaje (nunca 0)", () => {
    const m = mfn("220421")!;
    expect(m.average).toBeNull();
    expect(m.lines).toBe(2);
    expect(m.nonAdValoremLines).toBe(2);
  });
  it("calzado en Japón: la media ad valorem cubre solo parte de las líneas", () => {
    const m = mfn("640399")!;
    expect(m.average).toBeCloseTo(28.5, 1);
    expect(m.lines).toBe(7);
    expect(m.nonAdValoremLines).toBe(5);
  });
  it("preferencial para España: el del último año disponible", () => {
    expect(latestPreference(fx("220421", "HS_P_0070"))?.average).toBe(0);
    expect(latestPreference(fx("640399", "HS_P_0070"))?.average).toBeCloseTo(8.4, 1);
  });
  it("sin filas o sin número de líneas no hay dato", () => {
    expect(combineMfn([], [], [])).toBeNull();
    expect(latestPreference([])).toBeNull();
    expect(wtoRows(null)).toEqual([]);
    expect(wtoRows({ Dataset: "x" })).toEqual([]);
  });
});

describe("consulta a la API", () => {
  const byIndicator = (resp: Record<string, { status: number; body: string }>) => {
    const calls: { url: string; key: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string, init: RequestInit) => {
      const key = new Headers(init.headers as HeadersInit).get("Ocp-Apim-Subscription-Key");
      calls.push({ url: u, key });
      const i = new URL(u).searchParams.get("i")!;
      const r = resp[i] ?? { status: 204, body: "" };
      return new Response(r.status === 204 ? null : r.body, { status: r.status });
    }));
    return calls;
  };
  const real = (pc: string) => Object.fromEntries(["HS_A_0010", "HS_A_0040", "HS_A_0050", "HS_P_0070"].map((i) => [i, { status: 200, body: readFileSync(`tests/fixtures/wto-jp-${pc}-${i}.json`, "utf8") }]));
  it("cuatro consultas (una por indicador), la clave en cabecera y nunca en la URL, preferencial con socio España", async () => {
    const calls = byIndicator(real("640399"));
    const t = await fetchWtoTariff(BASE, "clave-secreta", "JP", "640399", new Date("2026-11-03"));
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.key === "clave-secreta" && !c.url.includes("clave-secreta"))).toBe(true);
    expect(calls.find((c) => c.url.includes("HS_P_0070"))!.url).toContain("&p=724&");
    expect(calls[0].url).toBe(wtoUrl(BASE, "HS_A_0010", 392, "640399", 2022, 2026));
    expect(t!.mfn!.average).toBeCloseTo(28.5, 1);
    expect(t!.preference!.average).toBeCloseTo(8.4, 1);
  });
  it("usa los códigos de la OMC, no los de Comtrade del catálogo (EE. UU. 840, no 842)", async () => {
    const calls = byIndicator({});
    await fetchWtoTariff(BASE, "k", "US", "150920");
    await fetchWtoTariff(BASE, "k", "CH", "150920");
    await fetchWtoTariff(BASE, "k", "NO", "150920");
    expect(calls.map((c) => new URL(c.url).searchParams.get("r"))).toEqual([...Array(4).fill("840"), ...Array(4).fill("756"), ...Array(4).fill("578")]);
  });
  it("una consulta lenta se corta a los 8 s (la ficha no espera los 25 s generales)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))))));
    const p = fetchWtoTariff(BASE, "k", "JP", "220421").catch((e) => e);
    await vi.advanceTimersByTimeAsync(8000);
    const e = await p;
    vi.useRealTimers();
    expect(e).toBeInstanceOf(SourceError);
    expect(e.kind).toBe("network");
  });
  it("204 sin cuerpo = sin datos (no un error)", async () => {
    byIndicator({});
    expect(await fetchWtoTariff(BASE, "k", "US", "150920")).toEqual({ mfn: null, preference: null });
  });
  it("clave rechazada o error del servidor = error, no «sin datos»", async () => {
    byIndicator({ HS_A_0010: { status: 401, body: "{}" } });
    await expect(fetchWtoTariff(BASE, "k", "JP", "220421")).rejects.toMatchObject({ kind: "config" });
    byIndicator({ HS_A_0040: { status: 500, body: "x" } });
    await expect(fetchWtoTariff(BASE, "k", "JP", "220421")).rejects.toBeInstanceOf(SourceError);
  });
  it("no consulta mercados de la UE ni desconocidos", async () => {
    const calls = byIndicator({});
    expect(await fetchWtoTariff(BASE, "k", "DE", "220421")).toBeNull();
    expect(await fetchWtoTariff(BASE, "k", "ZZ", "220421")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("aranceles en «Acceso al mercado»", () => {
  const at = "2026-11-03T10:00:00.000Z";
  const lookup = (pc: string): TariffLookup => ({ tariff: { mfn: mfn(pc), preference: latestPreference(fx(pc, "HS_P_0070")) }, checkedAt: at });
  const jp = (t?: TariffLookup, synthetic = false) => buildMarketAccess({ marketCode: "JP", marketName: "Japón", productCode: "220421", synthetic, tariff: t });
  const arancel = (t?: TariffLookup) => jp(t).items.find((x) => x.topic === "arancel")!;
  it("derechos por unidad: lo dice y no muestra un porcentaje inventado; da el preferencial para España", () => {
    const a = arancel(lookup("220421"));
    expect(a.value).toMatch(/derechos por unidad.*no se puede expresar en %/);
    expect(a.value).not.toMatch(/NMF\)? medio: 0/);
    expect(a.value).toMatch(/Preferencial para productos españoles: 0 %/);
    expect(a.status).toBe("partial");
  });
  it("media parcial: «sobre N de M líneas»", () => {
    const a = arancel(lookup("640399"));
    expect(a.value).toMatch(/28,5 %, sobre 2 de 7 líneas/);
    expect(a.value).toMatch(/8,4 %/);
    expect(a.source).toMatch(/WTO Tariff and Trade Data/);
  });
  it("singular bien escrito: una línea por unidad, una sola línea", () => {
    const one = arancel({ tariff: { mfn: { year: 2024, average: 0, lines: 2, nonAdValoremLines: 1 }, preference: null }, checkedAt: at });
    expect(one.value).toContain("sobre 1 de 2 líneas (la otra es un derecho por unidad y no entra en la media)");
    const only = arancel({ tariff: { mfn: { year: 2025, average: null, lines: 1, nonAdValoremLines: 1 }, preference: null }, checkedAt: at });
    expect(only.value).toContain("en su única línea");
  });
  it("sin preferencial publicado no dice que no haya acuerdo", () => {
    const a = arancel({ tariff: { mfn: mfn("640399"), preference: null }, checkedAt: at });
    expect(a.value).toMatch(/la OMC no publica un tipo.*puede existir igualmente un acuerdo UE–Japón/);
  });
  it("sin ningún dato: «no disponible»; con error: pendiente; nunca «verificado»", () => {
    expect(arancel({ tariff: { mfn: null, preference: null }, checkedAt: at }).status).toBe("unavailable");
    expect(arancel({ tariff: null, checkedAt: at, error: "No se pudo consultar la OMC: tiempo agotado" }).status).toBe("pending");
    expect(arancel({ tariff: null, checkedAt: at, error: "No se pudo consultar la OMC: tiempo agotado" }).note).toMatch(/Recarga la página/);
    expect(JSON.stringify(jp(lookup("640399")))).not.toMatch(/"verified"/);
    expect(jp(lookup("640399")).checkedAt).toBe(at);
  });
  it("en la UE y con datos de demostración no se usan", () => {
    const de = buildMarketAccess({ marketCode: "DE", marketName: "Alemania", productCode: "220421", synthetic: false, tariff: lookup("220421") });
    expect(de.items[0].value).toMatch(/libre circulación/);
    expect(jp(lookup("220421"), true).items[0].status).toBe("pending");
  });
  it("no se guardan en los datos del repositorio ni en el CSV, y la clave no llega al navegador", () => {
    for (const f of ["lib/snapshots/update.ts", "lib/trade/csv.ts", "scripts/actualizar-datos.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/wto/i);
    expect(readFileSync("lib/config/index.ts", "utf8")).not.toMatch(/NEXT_PUBLIC_WTO/);
  });
});

describe("punto de llamada: el servicio de la ficha", () => {
  const opp = { marketCode: "JP", productCode: "640399", synthetic: false } as never;
  const cfg = (o: Record<string, unknown>) => ({ mode: "comtrade", cacheTtlMs: 1000, wtoBase: BASE, wtoKey: "k", ...o }) as never;
  it("sin clave no consulta nada; en demo, en la UE o con datos sintéticos, tampoco", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { lookupTariff } = await import("@/lib/service");
    expect(await lookupTariff(opp, cfg({ wtoKey: null }))).toBeUndefined();
    expect(await lookupTariff(opp, cfg({ mode: "demo" }))).toBeUndefined();
    expect(await lookupTariff({ marketCode: "DE", productCode: "640399", synthetic: false } as never, cfg({}))).toBeUndefined();
    expect(await lookupTariff({ marketCode: "JP", productCode: "640399", synthetic: true } as never, cfg({}))).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
  });
  it("con clave consulta y, si la OMC falla, devuelve el error sin romper la ficha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const { lookupTariff } = await import("@/lib/service");
    const r = await lookupTariff({ marketCode: "JP", productCode: "999999", synthetic: false } as never, cfg({}));
    expect(r?.tariff).toBeNull();
    expect(r?.error).toMatch(/No se pudo consultar la OMC/);
  });
});
