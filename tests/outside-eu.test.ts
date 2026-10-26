import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache/ttl-cache";
import { COMTRADE_MARKET_CODES, MARKETS } from "@/lib/config/catalog";
import { allowedMarkets, getConfig } from "@/lib/config";
import { querySchema } from "@/lib/schemas/query";
import { getFullRanking } from "@/lib/service";

beforeEach(() => { vi.stubEnv("COMTRADE_MIN_GAP_MS", "0"); vi.stubEnv("COMTRADE_BACKOFF_MS", "0"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); clearCache(); });

const ENV = { SMARTRADE_DATA_MODE: "comext", COMTRADE_API_KEY: "k-test" };

describe("modo «fuera de la UE»: configuración", () => {
  it("solo se concede con modo comext y clave de Comtrade", () => {
    expect(getConfig(ENV, "fuera")).toMatchObject({ mode: "comtrade", outsideAvailable: true });
    expect(getConfig(ENV, undefined)).toMatchObject({ mode: "comext", outsideAvailable: true });
    expect(getConfig(ENV, "ue").mode).toBe("comext");
    expect(getConfig(ENV, "otro").mode).toBe("comext");
  });
  it("sin clave, o en modo demo, la petición se ignora y no se mezclan fuentes", () => {
    expect(getConfig({ SMARTRADE_DATA_MODE: "comext" }, "fuera")).toMatchObject({ mode: "comext", outsideAvailable: false });
    expect(getConfig({ SMARTRADE_DATA_MODE: "demo", COMTRADE_API_KEY: "k" }, "fuera")).toMatchObject({ mode: "demo", outsideAvailable: false });
  });
  it("los mercados de Comtrade son solo los verificados y ninguno es de la UE", () => {
    const codes = allowedMarkets("comtrade").map((m) => m.code).sort();
    expect(codes).toEqual([...COMTRADE_MARKET_CODES].sort());
    expect(allowedMarkets("comtrade").some((m) => m.eu)).toBe(false);
    expect(codes).not.toContain("SA");
    expect(allowedMarkets("comext").every((m) => m.eu)).toBe(true);
    expect(MARKETS.length).toBeGreaterThan(codes.length);
  });
  it("el parámetro fuente solo admite ue o fuera", () => {
    expect(querySchema.safeParse({ fuente: "fuera" }).success).toBe(true);
    expect(querySchema.safeParse({ fuente: "ue" }).success).toBe(true);
    expect(querySchema.safeParse({ fuente: "mundo" }).success).toBe(false);
    expect(querySchema.parse({ fuente: "" }).fuente).toBeUndefined();
  });
});

// Fixtures sintéticos con la forma observada en la API real (25/10/2026); no son estadísticas reales.
const YEARS = [2022, 2023, 2024];
const DATA: Record<string, { code: number; world: number[]; es: number[] }> = {
  US: { code: 842, world: [5.0e9, 4.9e9, 5.0e9], es: [2.9e8, 2.7e8, 2.8e8] },
  GB: { code: 826, world: [3.0e9, 3.1e9, 2.9e9], es: [3.2e8, 3.5e8, 3.4e8] },
  CH: { code: 757, world: [1.0e9, 0.99e9, 0.93e9], es: [1.3e8, 1.3e8, 1.2e8] },
};
const rows = (flow: string) => {
  if (flow === "X") return YEARS.map((y, i) => ({ period: y, reporterCode: 724, reporterISO: "ESP", partnerCode: 0, partnerISO: "W00", cmdCode: "220421", flowCode: "X", primaryValue: [1.97e9, 1.94e9, 1.91e9][i], classificationCode: "H6", partner2Code: 0, customsCode: "C00", motCode: 0 }));
  return Object.values(DATA).flatMap((d) => YEARS.flatMap((y, i) => [
    { period: y, reporterCode: d.code, reporterISO: null, partnerCode: 0, partnerISO: null, cmdCode: "220421", flowCode: "M", primaryValue: d.world[i], classificationCode: "H6", partner2Code: 0, customsCode: "C00", motCode: 0 },
    { period: y, reporterCode: d.code, reporterISO: null, partnerCode: 724, partnerISO: null, cmdCode: "220421", flowCode: "M", primaryValue: d.es[i], classificationCode: "H6", partner2Code: 0, customsCode: "C00", motCode: 0 },
  ]));
};

describe("modo «fuera de la UE»: ranking con respuestas controladas", () => {
  it("construye oportunidades en USD solo con UN Comtrade, sin tocar Eurostat ni datos demo", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k-test");
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const u = new URL(String(input));
      urls.push(u.hostname);
      return new Response(JSON.stringify({ data: rows(u.searchParams.get("flowCode") ?? "M") }), { status: 200 });
    });
    const cfg = getConfig(ENV, "fuera");
    const r = await getFullRanking(querySchema.parse({ q: "220421", year: "2024" }), cfg);
    expect(new Set(urls)).toEqual(new Set(["comtradeapi.un.org"]));
    expect(r.info.mode).toBe("comtrade");
    expect(r.info.synthetic).toBe(false);
    expect(r.info.sourceLabel).toMatch(/Comtrade/);
    expect(r.ranked.map((o) => o.marketCode).sort()).toEqual(["CH", "GB", "US"]);
    expect(r.ranked.every((o) => o.currency === "USD" && o.complete && o.score !== null && !o.synthetic)).toBe(true);
    expect(r.ranked[0].classification).toBe("HS2022");
  });
});
