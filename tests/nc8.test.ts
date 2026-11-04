import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/cache/ttl-cache";
import { getConfig } from "@/lib/config";
import { codeLabel, HS_CATALOG, hs6Of, NC8_CATALOG, productLabel } from "@/lib/config/hs-catalog";
import { SECTORS } from "@/lib/config/sectors";
import { buildMarketAccess } from "@/lib/market-access";
import { idSchema, querySchema } from "@/lib/schemas/query";
import { observationSchema } from "@/lib/schemas/trade";
import { getFullRanking } from "@/lib/service";
import { clearSnapshotMemo } from "@/lib/snapshots/store";
import { serializeSnapshot, stableObservations, updateSnapshots } from "@/lib/snapshots/update";
import { comextToObservations } from "@/lib/sources/comext";
import { parseJsonStat } from "@/lib/sources/jsonstat";
import { resolveProductQuery } from "@/lib/trade/product-search";

/**
 * Subcategorías NC8 (04/11/2026): solo UE (Eurostat Comext). El fixture es una respuesta REAL de Comext guardada el
 * 04/11/2026: Rioja tinto (22042176) importado por Alemania en 2024.
 */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); clearCache(); clearSnapshotMemo(); });

describe("catálogo NC8", () => {
  it("8 dígitos, sin duplicados, con su partida HS6 en el catálogo y fuera de los sectores (se solaparían)", () => {
    expect(NC8_CATALOG.every((e) => /^\d{8}$/.test(e.code))).toBe(true);
    expect(new Set(NC8_CATALOG.map((e) => e.code)).size).toBe(NC8_CATALOG.length);
    const hs6 = new Set(HS_CATALOG.map((e) => e.code));
    for (const e of NC8_CATALOG) expect(hs6.has(hs6Of(e.code)), e.code).toBe(true);
    const inSectors = new Set(SECTORS.flatMap((s) => s.codes));
    expect(NC8_CATALOG.some((e) => inSectors.has(e.code))).toBe(false);
  });
  it("rótulo NC para los 8 dígitos y HS para los 6; nombre en español del catálogo", () => {
    expect(codeLabel("22042176")).toBe("NC 22042176");
    expect(codeLabel("220421")).toBe("HS 220421");
    expect(productLabel("22042176", "Wines produced in Rioja…").title).toMatch(/Rioja/);
  });
});

describe("búsqueda", () => {
  const codes = (q: string, nc8 = true) => resolveProductQuery(q, { nc8 }).codes;
  it("por denominación, variedad o tipo", () => {
    expect(codes("rioja")).toEqual(["22042176", "22042136"]);
    expect(codes("Ribera del Duero")).toEqual(["22042178"]);
    expect(codes("naranjas navel")).toEqual(["08051022"]);
    expect(codes("cava")).toEqual(["22041013"]);
    expect(codes("coches eléctricos usados")).toEqual(["87038090"]);
    expect(codes("22042176")).toEqual(["22042176"]);
  });
  it("lo genérico se queda en la partida y avisa de que hay subcategorías", () => {
    const r = resolveProductQuery("naranjas", { nc8: true });
    expect(r.codes).toEqual(["080510"]);
    expect(r.notes[0]).toMatch(/subcategorías más precisas/);
    expect(codes("vino").every((c) => c.length === 6)).toBe(true);
  });
  it("fuera de la UE (sin NC8) se usa la partida HS6 y se dice", () => {
    const r = resolveProductQuery("rioja", { nc8: false });
    expect(r.codes).toEqual(["220421"]);
    expect(r.notes[0]).toMatch(/fuera de la UE solo hay datos a 6 dígitos/);
    expect(codes("22042176, 08051022", false)).toEqual(["220421", "080510"]);
  });
  it("pedir a la vez una partida y su subcategoría se permite, pero avisa del solape", () => {
    const r = resolveProductQuery("220421, 22042176");
    expect(r.codes).toEqual(["220421", "22042176"]);
    expect(r.notes.at(-1)).toMatch(/22042176 está incluido en su partida HS6/);
  });
  it("lo que no existe en la estadística no se inventa", () => {
    expect(codes("SUV")).toEqual([]);
    expect(resolveProductQuery("SUV").unmatched).toEqual(["SUV"]);
  });
});

describe("datos y esquemas", () => {
  it("Comext: una respuesta real a 8 dígitos se convierte y valida, rotulada «NC8» con su versión HS", () => {
    const obs = comextToObservations(parseJsonStat(JSON.parse(readFileSync("tests/fixtures/comext-de-22042176-2024.json", "utf8"))), "2026-11-04T00:00:00Z");
    expect(obs).toHaveLength(2);
    expect(obs.every((o) => o.productCode === "22042176" && o.productClassification === "NC8-HS2022" && observationSchema.safeParse(o).success)).toBe(true);
    expect(obs.find((o) => o.partnerCode === "ES")?.tradeValue).toBe(44033679);
  });
  it("la clasificación de un NC8 no cambia de un año a otro dentro de la misma HS (si cambiara, la ventana sería incompatible)", () => {
    const raw = readFileSync("tests/fixtures/comext-de-22042176-2024.json", "utf8");
    const label = (y: number) => comextToObservations(parseJsonStat(JSON.parse(raw.replace(/"2024"/g, `"${y}"`))), "x")[0].productClassification;
    expect(label(2022)).toBe(label(2024));
  });
  it("identificadores con 6 u 8 dígitos; ni 7 ni 9", () => {
    expect(idSchema.safeParse("22042176-DE-2024").success).toBe(true);
    expect(idSchema.safeParse("220421-DE-2024").success).toBe(true);
    expect(idSchema.safeParse("2204217-DE-2024").success).toBe(false);
  });
  it("los datos guardados de UN Comtrade no piden NC8 (no existen ahí); los de Comext sí", async () => {
    const asked: Record<string, string[]> = { comext: [], comtrade: [] };
    await updateSnapshots([{ mode: "comext", markets: ["DE"] }, { mode: "comtrade", markets: ["US"] }], ["220421", "22042176"], [2024], 5, {
      fetchData: async (mode, q) => { asked[mode].push(...(q.productCodes ?? [])); return { observations: [], retrievedAt: "x", sourceLabel: "x", warnings: [], synthetic: false }; },
      read: () => null, write: () => {}, now: () => new Date("2026-11-04T00:00:00Z"),
    });
    expect(asked).toEqual({ comext: ["220421", "22042176"], comtrade: ["220421"] });
  });
  it("acceso al mercado y compradores usan la partida HS6", () => {
    expect(buildMarketAccess({ marketCode: "DE", marketName: "Alemania", productCode: "22042176", synthetic: false }).hs6).toBe("220421");
    const page = sinComentarios(readFileSync("app/oportunidad/[id]/page.tsx", "utf8"));
    expect(page).toMatch(/compradores\?hs=\$\{hs6Of\(o\.productCode\)\}/);
    expect(page).toMatch(/nc8Entry\(o\.productCode\)\?\.spanishOrigin && <p[^>]*>\{spanishOriginWarning\(/); // la ficha también lo avisa
  });
});

describe("ventana de tres años con NC8", () => {
  it("una oportunidad NC8 con datos 2022–2024 queda completa y entra en el ranking (antes salía incompleta)", async () => {
    // Datos guardados en una carpeta temporal a partir del fixture real de 2024 replicado a 2022 y 2023 (solo cambia el año).
    const raw = readFileSync("tests/fixtures/comext-de-22042176-2024.json", "utf8");
    const imports = [2022, 2023, 2024].flatMap((y) => comextToObservations(parseJsonStat(JSON.parse(raw.replace(/"2024"/g, `"${y}"`))), "x"));
    // La exportación española al mundo es otra consulta: aquí se deriva (no es un dato real) para completar la oportunidad.
    const exportsES = imports.filter((o) => o.partnerCode === "WORLD").map((o) => ({ ...o, reporterCode: "ES", flow: "export" as const, tradeValue: 5e8 }));
    const obs = [...imports, ...exportsES];
    const dir = mkdtempSync(path.join(tmpdir(), "nc8-snap-"));
    mkdirSync(path.join(dir, "comext"));
    writeFileSync(path.join(dir, "comext", "22042176.json"), serializeSnapshot({ v: 1, mode: "comext", code: "22042176", years: [2022, 2023, 2024], generatedAt: "2026-11-04T00:00:00.000Z", sourceLabel: "Eurostat Comext", warnings: [], observations: stableObservations(obs) }));
    vi.stubEnv("SMARTRADE_SNAPSHOT_DIR", dir);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no debe consultar en vivo"); }));
    const r = await getFullRanking(querySchema.parse({ q: "22042176", year: "2024" }), getConfig({ SMARTRADE_DATA_MODE: "comext" }, undefined));
    vi.unstubAllGlobals();
    expect(r.ranked.map((o) => `${o.productCode}-${o.marketCode}`)).toEqual(["22042176-DE"]);
    expect(r.ranked[0].classification).toBe("NC8-HS2022");
  });
});

describe("punto de llamada: el ranking", () => {
  beforeEach(() => { vi.stubEnv("SMARTRADE_SNAPSHOT_DIR", mkdtempSync(path.join(tmpdir(), "nc8-"))); vi.stubEnv("COMTRADE_MIN_GAP_MS", "0"); vi.stubEnv("COMTRADE_BACKOFF_MS", "0"); vi.stubEnv("COMTRADE_API_KEY", "k-test"); });
  it("UE: pide los NC8 a Comext y avisa de que la cuota española de una DOP propia no informa", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => { urls.push(String(input)); return new Response(readFileSync("tests/fixtures/comext-de-22042176-2024.json", "utf8"), { status: 200 }); });
    const r = await getFullRanking(querySchema.parse({ q: "rioja", year: "2024" }), getConfig({ SMARTRADE_DATA_MODE: "comext" }, undefined));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes("product=22042176") && u.includes("product=22042136") && !u.includes("product=220421&"))).toBe(true);
    expect(r.info.warnings.join(" ")).toMatch(/solo se producen en España.*«Potencial de cuota» no informa/);
  });
  it("fuera de la UE: la misma búsqueda pide la partida HS6 a UN Comtrade", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => { urls.push(String(input)); return new Response(JSON.stringify({ data: [] }), { status: 200 }); });
    const r = await getFullRanking(querySchema.parse({ q: "rioja", year: "2024" }), getConfig({ SMARTRADE_DATA_MODE: "comext", COMTRADE_API_KEY: "k-test" }, "fuera"));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => /cmdCode=220421(&|$)/.test(u) && !u.includes("22042176"))).toBe(true);
    expect(r.info.warnings.join(" ")).toMatch(/fuera de la UE solo hay datos a 6 dígitos/);
  });
});
