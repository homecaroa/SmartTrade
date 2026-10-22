import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache/ttl-cache";
import { classifyComextResponse, comextFetch, comextSource } from "@/lib/sources/comext";
import { SourceError } from "@/lib/sources/types";
import { startMock, type MockMode } from "./helpers/mock-comext";

const run = promisify(execFile);
const noSleep = async () => {};
let closers: (() => Promise<void>)[] = [];
afterEach(async () => { vi.unstubAllEnvs(); clearCache(); for (const c of closers) await c(); closers = []; });

async function mock(mode: MockMode, opts?: { asyncCalls?: number }) {
  const m = await startMock(mode, opts);
  closers.push(m.close);
  vi.stubEnv("COMEXT_BASE_URL", m.base);
  return m;
}

describe("clasificación de respuestas de Eurostat (formato documentado)", () => {
  it("datos, vacío (100 No results found), asíncrono (413) y errores", () => {
    expect(classifyComextResponse(200, { id: [], dimension: {} }).type).toBe("data");
    expect(classifyComextResponse(400, { error: { status: "400", label: "100 No results found" } }).type).toBe("empty");
    expect(classifyComextResponse(404, { error: { status: "404", label: "100 No results found" } }).type).toBe("empty");
    expect(classifyComextResponse(200, { warning: { status: 413, label: "ASYNCHRONOUS_RESPONSE. Please try again later." } }).type).toBe("pending");
    expect(classifyComextResponse(400, { error: { status: "400", label: "140 Syntax error" } })).toMatchObject({ type: "error", status: 400 });
    expect(classifyComextResponse(404, null)).toMatchObject({ type: "error", status: 404 });
    expect(classifyComextResponse(500, null).type).toBe("error");
  });
});

describe("comextFetch con servidor simulado", () => {
  it("reintenta respuestas asíncronas y acaba obteniendo datos", async () => {
    const m = await mock("async", { asyncCalls: 2 });
    const sleep = vi.fn(noSleep);
    const json = await comextFetch(`${m.base}/ds-x?format=JSON`, { sleep, delayMs: 1 });
    expect(json).toHaveProperty("id");
    expect(m.requests).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("si sigue asíncrona tras los reintentos lanza error 'pending' (no inventa datos)", async () => {
    const m = await mock("async");
    await expect(comextFetch(`${m.base}/ds-x`, { sleep: noSleep, attempts: 3 })).rejects.toMatchObject({ kind: "pending" });
    expect(m.requests).toHaveLength(3);
  });
  it("consulta vacía → null; error de sintaxis → error con la etiqueta de Eurostat; 500 → http", async () => {
    let m = await mock("empty");
    expect(await comextFetch(`${m.base}/ds-x`, { sleep: noSleep })).toBeNull();
    await m.close(); closers = [];
    m = await mock("badrequest");
    await expect(comextFetch(`${m.base}/ds-x`, { sleep: noSleep })).rejects.toThrow(/140 Syntax error/);
    await m.close(); closers = [];
    m = await mock("error500");
    await expect(comextFetch(`${m.base}/ds-x`, { sleep: noSleep })).rejects.toMatchObject({ kind: "http", status: 500 });
  });
});

describe("comextSource.fetchData (servidor simulado)", () => {
  it("construye consultas filtradas con el formato documentado y normaliza", async () => {
    const m = await mock("ok");
    const r = await comextSource.fetchData({ years: [2022, 2023, 2024], productCodes: ["220421"], markets: ["DE", "FR", "GR", "US"] });
    // Dos consultas filtradas (importaciones y exportaciones); filtros repetidos por valor; sin descarga completa
    expect(m.requests).toHaveLength(2);
    const imp = m.requests.find((u) => u.searchParams.get("flow") === "1")!;
    expect(imp.pathname).toBe("/data/ds-045409");
    expect(imp.searchParams.get("format")).toBe("JSON");
    expect(imp.searchParams.getAll("reporter")).toEqual(["DE", "FR", "EL"]); // US excluido (no UE); GR→EL (código Eurostat)
    expect(imp.searchParams.getAll("partner")).toEqual(["WORLD", "ES"]);
    expect(imp.searchParams.getAll("time")).toEqual(["2022", "2023", "2024"]);
    expect(imp.searchParams.getAll("indicators")).toEqual(["VALUE_IN_EUROS", "QUANTITY_IN_100KG"]);
    const exp = m.requests.find((u) => u.searchParams.get("flow") === "2")!;
    expect(exp.searchParams.getAll("reporter")).toEqual(["ES"]);

    expect(r.synthetic).toBe(false);
    const reporters = new Set(r.observations.map((o) => o.reporterCode));
    expect(reporters).toEqual(new Set(["DE", "FR", "GR", "ES"])); // EL→GR
    // celda ausente (FR←ES) no se convierte en 0
    expect(r.observations.find((o) => o.reporterCode === "FR" && o.partnerCode === "ES")).toBeUndefined();
    expect(r.observations.find((o) => o.reporterCode === "DE" && o.partnerCode === "ES" && o.period === "2023")!.tradeValue).toBeGreaterThan(0);
    expect(r.observations.every((o) => o.currency === "EUR" && o.productClassification === (Number(o.period) >= 2022 ? "HS2022" : "HS2017"))).toBe(true);
    expect(r.observations.filter((o) => o.flow === "export").every((o) => o.reporterCode === "ES")).toBe(true);
  });

  it("consulta vacía → sin observaciones y con aviso (ausencia de datos ≠ ceros)", async () => {
    await mock("empty");
    const r = await comextSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] });
    expect(r.observations).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/no devolvió datos/);
  });

  it("exige códigos HS y propaga errores de red sin datos", async () => {
    await expect(comextSource.fetchData({ years: [2023], productCodes: null, markets: ["DE"] })).rejects.toMatchObject({ kind: "config" });
    vi.stubEnv("COMEXT_BASE_URL", "http://127.0.0.1:9/data"); // puerto cerrado
    await expect(comextSource.fetchData({ years: [2023], productCodes: ["220421"], markets: ["DE"] })).rejects.toBeInstanceOf(SourceError);
  });

  it("proveedores: excluye agregados y el propio mercado", async () => {
    await mock("ok");
    const sup = await comextSource.fetchSuppliers({ market: "DE", productCode: "220421", years: [2023] });
    const codes = new Set(sup.map((o) => o.partnerCode));
    expect(codes.has("WORLD")).toBe(false);
    expect(codes.has("DE")).toBe(false);
    expect(codes.has("ES")).toBe(true);
  });
});

describe("npm run verify:comext (contra servidor simulado)", { timeout: 60_000 }, () => {
  const exec = async (base: string) => {
    try {
      const { stdout } = await run("node", ["scripts/verify-comext.mjs"], { env: { ...process.env, COMEXT_BASE_URL: base, COMEXT_WORLD_CODE: "WORLD" } });
      return { code: 0, stdout };
    } catch (e) {
      const err = e as { code: number; stdout: string };
      return { code: err.code, stdout: err.stdout };
    }
  };
  it("sale con 0 y resume cuando los supuestos coinciden", async () => {
    const m = await startMock("ok"); closers.push(m.close);
    const r = await exec(m.base);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Todas las dimensiones esperadas existen/);
    expect(r.stdout).toMatch(/sin fallos|0 fallos/);
  });
  it("sale con 2 (no concluyente) ante respuesta asíncrona y con 1 ante errores", async () => {
    let m = await startMock("async"); closers.push(m.close);
    expect((await exec(m.base)).code).toBe(2);
    m = await startMock("badrequest"); closers.push(m.close);
    const bad = await exec(m.base);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toMatch(/140 Syntax error/);
  });
  it("los scripts no usan process.exit() (provoca cierre brusco 0xC0000409 en Windows con conexiones abiertas)", () => {
    for (const f of ["scripts/verify-comext.mjs", "scripts/verify-comtrade.mjs"]) {
      expect(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/process\.exit\(/);
    }
  });
  it("diagnostica fallo de red", async () => {
    const r = await exec("http://127.0.0.1:9/data");
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Fallo de red/);
  });
});
