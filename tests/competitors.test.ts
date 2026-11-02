import { describe, expect, it } from "vitest";
import { buildCompetitors } from "@/lib/trade/competitors";
import { ob } from "./helpers";

/** Importaciones de DE por proveedor. Totales del mercado: 2023 = 1.000, 2025 = 1.200. */
const sup = (partner: string, year: number, value: number | null, kg: number | null, extra: Record<string, unknown> = {}) =>
  ob({ period: String(year), reporterCode: "DE", partnerCode: partner, flow: "import", tradeValue: value, netWeight: kg, ...extra });
const totals = [{ year: 2023, value: 1000 }, { year: 2024, value: 1100 }, { year: 2025, value: 1200 }];
const names = (c: string) => ({ IT: "Italia", ES: "España", GR: "Grecia", FR: "Francia", PT: "Portugal", TN: "Túnez", MA: "Marruecos", TR: "Turquía" })[c] ?? c;
const base = [
  sup("IT", 2023, 500, 100), sup("IT", 2025, 540, 90),
  sup("ES", 2023, 200, 50), sup("ES", 2025, 300, 60),
  sup("GR", 2023, 100, 20), sup("GR", 2025, 120, null),
];

describe("España frente a sus competidores", () => {
  it("cuota, variación en puntos y valor unitario frente a España", () => {
    const a = buildCompetitors({ observations: base, totals, names, currency: "EUR" })!;
    expect(a.startYear).toBe(2023);
    expect(a.endYear).toBe(2025);
    const it_ = a.rows.find((r) => r.code === "IT")!;
    expect(it_.rank).toBe(1);
    expect(it_.sharePct).toBeCloseTo(45, 6); // 540 / 1.200
    expect(it_.shareChangePp).toBeCloseTo(45 - 50, 6); // pierde 5 puntos
    expect(it_.unitValue).toBeCloseTo(6, 6); // 540 / 90
    expect(a.spain!.unitValue).toBeCloseTo(5, 6); // 300 / 60
    expect(it_.unitValueVsSpainPct).toBeCloseTo(20, 6); // un 20 % más caro que España
    expect(a.spain!.shareChangePp).toBeCloseTo(25 - 20, 6);
    expect(a.spain!.unitValueVsSpainPct).toBeNull();
    expect(a.top3SharePct).toBeCloseTo(((540 + 300 + 120) / 1200) * 100, 6);
  });
  it("ausente ≠ cero: sin peso no hay valor unitario y sin año inicial no hay variación", () => {
    const a = buildCompetitors({ observations: [...base, sup("FR", 2025, 50, 10)], totals, names, currency: "EUR" })!;
    const gr = a.rows.find((r) => r.code === "GR")!;
    expect(gr.unitValue).toBeNull();
    expect(gr.unitValueVsSpainPct).toBeNull();
    expect(a.rows.find((r) => r.code === "FR")!.shareChangePp).toBeNull();
  });
  it("España aparece aunque no esté entre los principales proveedores", () => {
    const many = ["PT", "TN", "MA", "TR", "FR"].map((c, i) => sup(c, 2025, 400 - i * 10, 50));
    const a = buildCompetitors({ observations: [...base, ...many], totals: [{ year: 2023, value: 1000 }, { year: 2025, value: 5000 }], names, currency: "EUR", top: 3 })!;
    expect(a.rows).toHaveLength(4);
    expect(a.rows.at(-1)!.isSpain).toBe(true);
    expect(a.spain!.rank).toBeGreaterThan(3);
    expect(a.suppliersCount).toBe(8);
  });
  it("descarta otra moneda, valores no positivos y años fuera de la ventana; sin España no compara", () => {
    const a = buildCompetitors({
      observations: [sup("IT", 2025, 540, 90), sup("GR", 2025, 0, 10), sup("FR", 2025, 99, 9, { currency: "USD" }), sup("PT", 2019, 80, 8)],
      totals, names, currency: "EUR",
    })!;
    expect(a.rows.map((r) => r.code)).toEqual(["IT"]);
    expect(a.spain).toBeNull();
    expect(a.rows[0].unitValueVsSpainPct).toBeNull();
  });
  it("sin datos del último año no hay análisis", () => {
    expect(buildCompetitors({ observations: [sup("IT", 2023, 500, 100)], totals, names, currency: "EUR" })).toBeNull();
  });
  it("una cuota imposible (proveedor > total) no se calcula", () => {
    const a = buildCompetitors({ observations: [sup("IT", 2025, 5000, 10)], totals, names, currency: "EUR" })!;
    expect(a.rows[0].sharePct).toBeNull();
  });
});
