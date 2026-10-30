import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import { clearCache } from "@/lib/cache/ttl-cache";
import { getRanking } from "@/lib/service";
import { snapshotFileSchema, STALE_AFTER_DAYS, type SnapshotFile } from "@/lib/snapshots/schema";
import { clearSnapshotMemo, isSnapshotStale, lookupSnapshot, snapshotAgeDays } from "@/lib/snapshots/store";
import { serializeSnapshot, snapshotYears, summarize, updateSnapshots } from "@/lib/snapshots/update";
import { parseQuery } from "@/lib/schemas/query";
import { pairObs } from "./helpers";
import type { TradeObservation } from "@/lib/schemas/trade";

// Observaciones FICTICIAS (helpers de pruebas); solo los ficheros de data/snapshots son datos reales.
const YEARS = [2021, 2022, 2023, 2024];
const file = (code: string, o: Partial<SnapshotFile> = {}): SnapshotFile => ({
  v: 1, mode: "comext", code, years: YEARS, generatedAt: "2026-10-01T00:00:00.000Z", sourceLabel: "Eurostat Comext", warnings: ["aviso de la fuente"],
  observations: [2022, 2023, 2024].flatMap((end) => pairObs({ product: code, market: "DE", world: [100, 110, 120], spain: [10, 11, 12], exportES: 500, endYear: end }).filter((x) => x.period === String(end))),
  ...o,
});
let dir: string;
const put = (f: SnapshotFile | string, mode = "comext", code = typeof f === "string" ? "999999" : f.code) => {
  mkdirSync(path.join(dir, mode), { recursive: true });
  writeFileSync(path.join(dir, mode, `${code}.json`), typeof f === "string" ? f : serializeSnapshot(f));
};
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "snap-")); clearSnapshotMemo(); clearCache(); });
afterEach(() => { vi.restoreAllMocks(); delete process.env.SMARTRADE_SNAPSHOT_DIR; });

describe("lectura de datos guardados", () => {
  it("separa los códigos guardados de los que faltan y filtra por años", () => {
    put(file("220421"));
    const r = lookupSnapshot("comext", [2022, 2023, 2024], ["220421", "150920"], dir);
    expect(r.covered).toEqual(["220421"]);
    expect(r.missing).toEqual(["150920"]);
    expect(new Set(r.observations.map((o) => o.period))).toEqual(new Set(["2022", "2023", "2024"]));
    expect(r.warnings).toContain("aviso de la fuente");
  });
  it("un fichero que no cubre los años pedidos, inválido o de otro código no se usa", () => {
    put(file("220421", { years: [2023, 2024] }));
    put("{ no es json", "comext", "150920");
    put(file("690721", { code: "690722" }), "comext", "690721");
    expect(lookupSnapshot("comext", [2022, 2023, 2024], ["220421", "150920", "690721"], dir).missing).toEqual(["220421", "150920", "690721"]);
  });
  it("muestra la fecha del fichero más antiguo usado y descarta observaciones inválidas con aviso", () => {
    put(file("220421", { generatedAt: "2026-09-01T00:00:00.000Z" }));
    put(file("150920", { observations: [...file("150920").observations, { period: "2024", basura: true }] }));
    const r = lookupSnapshot("comext", [2022, 2023, 2024], ["220421", "150920"], dir);
    expect(r.generatedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(r.warnings.join(" ")).toMatch(/1 observaciones guardadas no superaron/);
  });
  it("avisa de antigüedad a partir del umbral documentado", () => {
    const now = Date.parse("2026-12-31T00:00:00.000Z");
    expect(snapshotAgeDays("2026-10-01T00:00:00.000Z", now)).toBe(91);
    expect(isSnapshotStale(new Date(now - (STALE_AFTER_DAYS - 1) * 86_400_000).toISOString(), now)).toBe(false);
    expect(isSnapshotStale(new Date(now - (STALE_AFTER_DAYS + 1) * 86_400_000).toISOString(), now)).toBe(true);
  });
  it("el formato legible se vuelve a leer igual", () => {
    const f = file("220421");
    expect(snapshotFileSchema.parse(JSON.parse(serializeSnapshot(f)))).toEqual(f);
    expect(serializeSnapshot(f).split("\n").filter((l) => l.startsWith('    {"period"')).length).toBe(f.observations.length);
  });
  it("guarda los cuatro últimos años completos", () => { expect(snapshotYears(new Date("2026-10-30T00:00:00Z"))).toEqual([2022, 2023, 2024, 2025]); });
});

describe("actualización", () => {
  const src = (fail: string[] = []) => vi.fn(async (_m: string, q: { productCodes: string[] | null }) => {
    if (q.productCodes!.some((c) => fail.includes(c))) throw new Error("La fuente no respondió a tiempo");
    return { observations: q.productCodes!.filter((c) => c !== "000001").flatMap((c) => file(c).observations) as TradeObservation[], retrievedAt: "x", sourceLabel: "Eurostat Comext", warnings: [], synthetic: false };
  });
  it("si un grupo falla, conserva los ficheros anteriores de ese grupo y lo dice en el resumen", async () => {
    const written: SnapshotFile[] = [];
    const prev = file("150920");
    const reports = await updateSnapshots([{ mode: "comext", markets: ["DE"] }], ["220421", "000001", "150920", "690721"], YEARS, 2, {
      fetchData: src(["150920"]), read: (_m, c) => (c === "150920" ? prev : null), write: (f) => written.push(f), now: () => new Date("2026-11-01T04:23:00Z"),
    });
    expect(written.map((f) => f.code)).toEqual(["220421", "000001"]); // 150920 y 690721 (mismo grupo) no se tocan
    expect(reports[0].failed).toEqual([{ codes: ["150920", "690721"], reason: "La fuente no respondió a tiempo" }]);
    expect(reports[0].empty).toEqual(["000001"]); // consultado sin datos: se guarda vacío
    const md = summarize(reports, YEARS, new Date("2026-11-01T04:23:00Z"));
    expect(md).toMatch(/Fallidos \(se conservan los datos anteriores\)/);
    expect(md).toMatch(/Sin datos en la fuente: 000001/);
  });
  it("distingue datos que cambian de datos iguales y omite Comtrade sin clave", async () => {
    const changed = file("220421", { observations: file("220421").observations.map((o, i) => (i === 0 ? { ...(o as object), tradeValue: 1 } : o)) });
    const reports = await updateSnapshots([{ mode: "comext", markets: ["DE"] }, { mode: "comtrade", markets: ["JP"], skipReason: "falta COMTRADE_API_KEY" }], ["220421", "150920"], YEARS, 5, {
      fetchData: src(), read: (_m, c) => (c === "220421" ? changed : file(c)), write: () => {}, now: () => new Date(),
    });
    expect(reports[0].changed).toEqual(["220421"]);
    expect(reports[1].skipped).toMatch(/COMTRADE_API_KEY/);
  });
});

describe("integración con el servicio", () => {
  const cfg = () => getConfig({ SMARTRADE_DATA_MODE: "comext" });
  const q = (o: Record<string, string>) => { const p = parseQuery({ year: "2024", ...o }); if (!p.success) throw new Error("query"); return p.data; };
  it("con todos los códigos guardados no se consulta la fuente y se informa de la fecha", async () => {
    put(file("220421", { generatedAt: new Date(Date.now() - 10 * 86_400_000).toISOString() }));
    process.env.SMARTRADE_SNAPSHOT_DIR = dir;
    const f = vi.spyOn(globalThis, "fetch");
    const r = await getRanking(q({ q: "220421" }), cfg());
    expect(f).not.toHaveBeenCalled();
    expect(r.info.snapshot).toMatchObject({ ageDays: 10, stale: false, liveCodes: [] });
    expect(r.validCount).toBeGreaterThan(0);
  });
  it("si faltan códigos y la consulta en vivo falla, muestra los guardados con un aviso", async () => {
    put(file("220421"));
    process.env.SMARTRADE_SNAPSHOT_DIR = dir;
    const f = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("sin red"));
    const r = await getRanking(q({ q: "220421, 150920" }), cfg());
    expect(f).toHaveBeenCalled();
    expect(r.validCount).toBeGreaterThan(0);
    expect(r.info.warnings.join(" ")).toMatch(/No se pudieron consultar en vivo 150920/);
    expect(r.info.snapshot?.liveCodes).toEqual([]);
  });
  it("con datos guardados antiguos, avisa", async () => {
    put(file("220421", { generatedAt: new Date(Date.now() - (STALE_AFTER_DAYS + 5) * 86_400_000).toISOString() }));
    process.env.SMARTRADE_SNAPSHOT_DIR = dir;
    vi.spyOn(globalThis, "fetch");
    const r = await getRanking(q({ q: "220421" }), cfg());
    expect(r.info.snapshot?.stale).toBe(true);
    expect(r.info.warnings.join(" ")).toMatch(/se actualizan cada dos meses/);
  });
  it("sin datos guardados, todo sigue como antes (consulta en vivo)", async () => {
    process.env.SMARTRADE_SNAPSHOT_DIR = dir;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("sin red"));
    await expect(getRanking(q({ q: "220421" }), cfg())).rejects.toThrow();
  });
  it("el modo demo nunca usa datos guardados", async () => {
    put(file("220421"));
    process.env.SMARTRADE_SNAPSHOT_DIR = dir;
    const p = parseQuery({}); if (!p.success) throw new Error("query");
    const r = await getRanking(p.data, getConfig({ SMARTRADE_DATA_MODE: "demo" }));
    expect(r.info.snapshot).toBeNull();
    expect(r.info.synthetic).toBe(true);
  });
});

describe("ficheros guardados en el repositorio", () => {
  it("son válidos y su modo y código coinciden con su ruta", () => {
    const root = path.join(process.cwd(), "data", "snapshots");
    let n = 0;
    for (const mode of ["comext", "comtrade"]) {
      let names: string[] = [];
      try { names = readdirSync(path.join(root, mode)).filter((x) => x.endsWith(".json")); } catch { continue; }
      for (const name of names) {
        const f = snapshotFileSchema.parse(JSON.parse(readFileSync(path.join(root, mode, name), "utf8")));
        expect(f.mode).toBe(mode);
        expect(`${f.code}.json`).toBe(name);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});
