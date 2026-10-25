import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chunk, comtradeSource, COMTRADE_MAX_RECORDS, reportersPerCall } from "@/lib/sources/comtrade";

beforeEach(() => { vi.stubEnv("COMTRADE_MIN_GAP_MS", "0"); vi.stubEnv("COMTRADE_BACKOFF_MS", "0"); });
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

// Hallazgos verificados con la API real (clave gratuita, 25/10/2026). Las respuestas son fixtures sintéticos con la forma observada.
describe("Comtrade: comportamiento observado en la API real", () => {
  const q = { years: [2023], productCodes: ["220421"], markets: ["DE"] };

  it("pide solo totales: segundo socio 0, régimen aduanero C00 y transporte 0 (si no, 500+ filas de desglose)", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond([]));
    await comtradeSource.fetchData(q);
    for (const [url] of f.mock.calls) {
      const u = new URL(String(url));
      expect(u.searchParams.get("partner2Code")).toBe("0");
      expect(u.searchParams.get("customsCode")).toBe("C00");
      expect(u.searchParams.get("motCode")).toBe("0");
    }
    f.mockClear();
    await comtradeSource.fetchSuppliers({ market: "DE", productCode: "220421", years: [2023] });
    expect(new URL(String(f.mock.calls[0][0])).searchParams.get("customsCode")).toBe("C00");
  });

  it("identifica país y socio por código numérico cuando los ISO llegan a null", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      respond([
        row({ reporterISO: null, partnerISO: null, reporterCode: 276, partnerCode: 0, primaryValue: 1821 }),
        row({ reporterISO: null, partnerISO: null, reporterCode: 276, partnerCode: 724, primaryValue: 225 }),
      ]));
    const r = await comtradeSource.fetchData(q);
    const imp = r.observations.filter((o) => o.flow === "import");
    expect(imp.map((o) => [o.reporterCode, o.partnerCode, o.tradeValue])).toEqual([["DE", "WORLD", 1821], ["DE", "ES", 225]]);
  });

  it("descarta filas de desglose (segundo socio, aduana, transporte) para no duplicar valores", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      respond([row({ partner2Code: 0, customsCode: "C00", motCode: 0, primaryValue: 100 }), row({ partner2Code: 516, primaryValue: 7 }), row({ customsCode: "C04", primaryValue: 8 }), row({ motCode: 1000, primaryValue: 9 })]));
    const r = await comtradeSource.fetchData(q);
    expect(r.observations.filter((o) => o.flow === "import").map((o) => o.tradeValue)).toEqual([100]);
  });

  it("reintenta tras un 429 y devuelve los datos", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    let n = 0;
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => (++n === 1 ? new Response("{}", { status: 429 }) : respond([row()])));
    const r = await comtradeSource.fetchData(q);
    expect(r.observations.some((o) => o.flow === "import")).toBe(true);
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(3); // 429 + reintento + exportaciones
  });

  it("si el 429 persiste, falla con rate_limit tras 3 intentos", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 429 }));
    await expect(comtradeSource.fetchData(q)).rejects.toMatchObject({ kind: "rate_limit" });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("separa las llamadas por el intervalo mínimo (1 por segundo en la clave gratuita)", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    vi.stubEnv("COMTRADE_MIN_GAP_MS", "80");
    const times: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => { times.push(Date.now()); return respond([]); });
    await comtradeSource.fetchData(q);
    expect(times.length).toBe(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(70);
  });

  it("proveedores fuera del catálogo conservan el nombre de la fuente y no se pierden", async () => {
    vi.stubEnv("COMTRADE_API_KEY", "k");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      respond([
        row({ reporterISO: null, reporterCode: 842, partnerISO: null, partnerCode: 0, primaryValue: 1000 }),
        row({ reporterISO: null, reporterCode: 842, partnerISO: null, partnerCode: 724, primaryValue: 100 }),
        row({ reporterISO: null, reporterCode: 842, partnerISO: null, partnerCode: 704, partnerDesc: "Viet Nam", primaryValue: 300 }),
      ]));
    const s = await comtradeSource.fetchSuppliers({ market: "US", productCode: "220421", years: [2023] });
    expect(s.map((o) => [o.partnerCode, o.partnerName ?? null])).toEqual([["ES", null], ["M49-704", "Viet Nam"]]);
  });
});

