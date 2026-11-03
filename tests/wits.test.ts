import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMarketAccess, type TariffLookup } from "@/lib/market-access";
import { fetchWitsTariff, parseWitsTariff, witsUrl } from "@/lib/sources/wits";
import { SourceError } from "@/lib/sources/types";

/** Respuestas REALES de WITS guardadas el 03/11/2026: Japón, vino embotellado (220421), 2023, socio mundo. */
const ave = JSON.parse(readFileSync("tests/fixtures/wits-jp-220421-2023-ave.json", "utf8"));
const reported = JSON.parse(readFileSync("tests/fixtures/wits-jp-220421-2023-reported.json", "utf8"));
const BASE = "https://wits.test/API/V1/SDMX/V21";

afterEach(() => vi.unstubAllGlobals());

describe("lectura de la respuesta de WITS", () => {
  it("equivalente ad valorem: media, rango y líneas", () => {
    const t = parseWitsTariff(ave, 2023)!;
    expect(t.average).toBeCloseTo(14.847, 2);
    expect(t.min).toBeCloseTo(14.69, 1);
    expect(t.max).toBe(15);
    expect(t).toMatchObject({ year: 2023, lines: 2, naLines: 0, tariffType: "MFN" });
  });
  it("«reported» con derechos específicos da 0 % y todas las líneas sin dato: eso NO es un arancel cero", () => {
    // Caso real: Japón grava el vino por litro. Leerlo como 0 % sería un arancel falso.
    expect(parseWitsTariff(reported, 2023)).toBeNull();
  });
  it("respuestas vacías o extrañas son «sin dato»", () => {
    expect(parseWitsTariff(null, 2023)).toBeNull();
    expect(parseWitsTariff({}, 2023)).toBeNull();
    expect(parseWitsTariff({ dataSets: [{ series: {} }] }, 2023)).toBeNull();
  });
});

describe("consulta a WITS", () => {
  const respond = (seq: { status: number; body: string }[]) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); const r = seq.shift()!; return new Response(r.body, { status: r.status }); }));
    return urls;
  };
  it("pide el arancel NMF estimado (socio mundo) y retrocede de año si no hay datos", async () => {
    const urls = respond([{ status: 404, body: "{}Not Found - NoRecordsFound" }, { status: 200, body: JSON.stringify(ave) }]);
    const t = await fetchWitsTariff(BASE, "JP", "220421", 2024);
    expect(t?.year).toBe(2023);
    expect(urls[0]).toBe(witsUrl(BASE, 392, "220421", 2024));
    expect(urls[0]).toMatch(/reporter\/392\/partner\/000\/product\/220421\/year\/2024\/datatype\/aveestimated/);
    expect(urls[1]).toMatch(/year\/2023\//);
  });
  it("sin datos en ningún año → null (nunca 0); como mucho prueba tres años", async () => {
    const urls = respond([1, 2, 3].map(() => ({ status: 404, body: "NoRecordsFound" })));
    expect(await fetchWitsTariff(BASE, "US", "220421", 2024)).toBeNull();
    expect(urls).toHaveLength(3);
  });
  it("un error del servidor es un error, no un «sin dato»", async () => {
    respond([{ status: 500, body: "oops" }]);
    await expect(fetchWitsTariff(BASE, "US", "220421", 2024)).rejects.toBeInstanceOf(SourceError);
  });
  it("no consulta mercados de la UE ni desconocidos", async () => {
    const urls = respond([]);
    expect(await fetchWitsTariff(BASE, "DE", "220421", 2024)).toBeNull();
    expect(await fetchWitsTariff(BASE, "ZZ", "220421", 2024)).toBeNull();
    expect(urls).toHaveLength(0);
  });
});

describe("arancel en «Acceso al mercado»", () => {
  const lookup = (o: Partial<TariffLookup> = {}): TariffLookup => ({ tariff: parseWitsTariff(ave, 2023), checkedAt: "2026-11-03T10:00:00.000Z", yearsTried: [2024, 2022], ...o });
  const jp = (t?: TariffLookup, synthetic = false) => buildMarketAccess({ marketCode: "JP", marketName: "Japón", productCode: "220421", synthetic, tariff: t });
  it("muestra el arancel general con año y fuente, como «parcial» y avisando del preferencial", () => {
    const i = jp(lookup());
    const a = i.items.find((x) => x.topic === "arancel")!;
    expect(a.value).toContain("14,8 %");
    expect(a.value).toContain("2023");
    expect(a.status).toBe("partial");
    expect(a.source).toMatch(/WITS/);
    expect(a.note).toMatch(/GENERAL.*acuerdo comercial UE–Japón.*Access2Markets/);
    expect(i.checkedAt).toBe("2026-11-03T10:00:00.000Z");
    expect(JSON.stringify(i)).not.toMatch(/"verified"/);
  });
  it("sin dato en WITS: «no disponible» con los años probados, nunca 0", () => {
    const a = jp(lookup({ tariff: null })).items[0];
    expect(a.value).toBeNull();
    expect(a.status).toBe("unavailable");
    expect(a.source).toContain("entre 2022 y 2024");
  });
  it("si la consulta falla, queda pendiente y lo dice", () => {
    const a = jp(lookup({ tariff: null, error: "No se pudo consultar WITS: tiempo agotado" })).items[0];
    expect(a.status).toBe("pending");
    expect(a.note).toContain("tiempo agotado");
  });
  it("en la UE y con datos de demostración no se usa el arancel de WITS", () => {
    const de = buildMarketAccess({ marketCode: "DE", marketName: "Alemania", productCode: "220421", synthetic: false, tariff: lookup() });
    expect(de.items[0].value).toMatch(/libre circulación/);
    expect(de.checkedAt).toBeNull();
    expect(jp(lookup(), true).items[0].status).toBe("pending");
    expect(jp(lookup(), true).checkedAt).toBeNull();
  });
  it("no se guarda en los datos del repositorio ni en el CSV (licencia de TRAINS sin confirmar)", () => {
    for (const f of ["lib/snapshots/update.ts", "lib/trade/csv.ts", "scripts/actualizar-datos.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/wits/i);
  });
});
