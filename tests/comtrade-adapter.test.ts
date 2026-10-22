import { afterEach, describe, expect, it, vi } from "vitest";
import { chunk, comtradeSource, COMTRADE_MAX_RECORDS, reportersPerCall } from "@/lib/sources/comtrade";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const row = (o: Record<string, unknown> = {}) => ({ period: 2023, reporterISO: "DEU", partnerISO: "W00", partnerCode: 0, cmdCode: "220421", flowCode: "M", primaryValue: 100, ...o });
const respond = (data: unknown[]) => new Response(JSON.stringify({ data }), { status: 200 });

describe("Comtrade opcional", () => {
  it("sin COMTRADE_API_KEY falla con error de configuración y sin llamar a la red", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "");
    const f = vi.spyOn(globalThis, "fetch");
    await expect(comtradeSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] })).rejects.toMatchObject({ kind: "config" });
    expect(f).not.toHaveBeenCalled();
  });

  it("envía la clave por cabecera por defecto, y por query solo si se activa; nunca la muestra en errores", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "CLAVE-SECRETA-123");
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond([row()]));
    await comtradeSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain("CLAVE-SECRETA");
    expect(String(url)).toContain("maxrecords=500");
    expect((init!.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("CLAVE-SECRETA-123");

    vi.stubEnv("COMTRADE_KEY_IN_QUERY", "true");
    f.mockClear();
    await comtradeSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] });
    expect(String(f.mock.calls[0][0])).toContain("subscription-key=CLAVE-SECRETA-123");

    vi.stubEnv("COMTRADE_KEY_IN_QUERY", "");
    f.mockImplementation(async () => new Response("denegado CLAVE-SECRETA-123", { status: 401 }));
    const err = await comtradeSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] }).catch((e) => e);
    expect(err).toMatchObject({ kind: "http", status: 401 });
    expect(String(err.message)).not.toContain("CLAVE-SECRETA");
  });

  it("rechaza respuestas que alcanzan el límite por llamada (posible truncado)", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(Array.from({ length: COMTRADE_MAX_RECORDS }, () => row())));
    await expect(comtradeSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] })).rejects.toMatchObject({ kind: "too_large" });
  });

  it("trocea los reporteros para no superar el máximo de registros", async () => {
    expect(reportersPerCall(1, 2, 3)).toBe(83);
    expect(reportersPerCall(20, 2, 3)).toBe(4);
    expect(reportersPerCall(500, 2, 3)).toBe(1);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    vi.stubEnv("COMTRADE_API_KEY", "k");
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond([]));
    const markets = ["DE", "FR", "IT", "PT", "NL", "PL", "BE", "AT"]; // 20 productos → 4 reporteros por llamada
    await comtradeSource.fetchData({ years: [2022, 2023, 2024], productCodes: Array.from({ length: 20 }, (_, i) => String(100000 + i)), markets });
    expect(f).toHaveBeenCalledTimes(2 + 1); // 8 mercados / 4 + 1 de exportaciones
  });

  it("ignora filas de países no solicitados o con valor ausente (no 0)", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond([row(), row({ reporterISO: "FRA" }), row({ partnerISO: "ESP", partnerCode: 724, primaryValue: null })]));
    const r = await comtradeSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] });
    const imp = r.observations.filter((o) => o.flow === "import");
    expect(imp).toHaveLength(1);
    expect(imp[0]).toMatchObject({ reporterCode: "DE", partnerCode: "WORLD", currency: "USD" });
  });
});
