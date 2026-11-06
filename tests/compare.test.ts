import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";
import { buildComparison, MAX_COMPARE, parseCompareIds } from "@/lib/compare";
import { getComparison, getFullRanking } from "@/lib/service";
import type { Opportunity } from "@/lib/trade/opportunities";

describe("selección para comparar", () => {
  it("acepta de 2 a 5 identificadores únicos, también separados por comas", () => {
    expect(parseCompareIds(["220421-DE-2024", "220421-FR-2024"])).toEqual({ ok: true, ids: ["220421-DE-2024", "220421-FR-2024"] });
    expect(parseCompareIds("220421-DE-2024,220421-FR-2024,220421-DE-2024")).toEqual({ ok: true, ids: ["220421-DE-2024", "220421-FR-2024"] });
  });
  it("rechaza menos de 2, más de 5, formatos inválidos y años distintos", () => {
    expect(parseCompareIds("220421-DE-2024").ok).toBe(false);
    expect(parseCompareIds(undefined).ok).toBe(false);
    const six = ["DE", "FR", "IT", "ES", "PT", "NL"].map((c) => `220421-${c}-2024`);
    expect(MAX_COMPARE).toBe(5);
    expect(parseCompareIds(six).ok).toBe(false);
    expect(parseCompareIds(["220421-DE-2024", "bad"]).ok).toBe(false);
    expect(parseCompareIds(["220421-DE-2024", "220421-FR-2023"]).ok).toBe(false);
  });
});

// Desde el 06/11/2026 la comparación no muestra puestos en rankings por percentiles («volumen», «potencial»): solo
// indicadores descriptivos en su unidad y el puesto por importaciones entre los mercados del mismo producto.
const P = (valor: number | null, of = 10) => ({ valor: valor === null ? null : { position: valor, of }, crecimiento: null, peso: null, espana: null });

describe("tabla comparativa", () => {
  const series = [2022, 2023, 2024].map((year, i) => ({ year, value: 8e8 + i * 1e8 }));
  const base = { productCode: "220421", productName: "Wine", classification: "HS2022", marketCode: "DE", marketName: "Alemania", endYear: 2024, currency: "EUR", synthetic: false, quality: "alta", complete: true, missing: [], annualChanges: [12.5, 11.1], importsSeries: series, marketSize: 1e9, yoyChange: 11.1, cagr: 4, cagrVolume: 2, weightEstimated: false, spainValue: 3e7, spanishShare: 3, spanishShareChangePp: 0.5, partnerBasis: "expedicion", spainExportsWorld: 2e9 } as unknown as Opportunity;
  it("muestra n.d. y nunca cero cuando faltan datos", () => {
    const rows = buildComparison([{ opp: base, positions: P(3) }, { opp: { ...base, marketCode: "FR", marketName: "Francia", complete: false, cagr: null, spanishShare: null, spainValue: null, spainExportsWorld: null, yoyChange: null } as Opportunity, positions: P(null) }]);
    const cell = (k: string, i: number) => rows.find((r) => r.key === k)!.cells[i];
    expect(cell("cagr", 1)).toMatch(/^n\.d\./);
    expect(cell("cuota", 1)).toBe("n.d.");
    expect(cell("interanual", 1)).toBe("n.d.");
    expect(cell("exportaciones", 1)).toBe("n.d.");
    expect(cell("pos_valor", 0)).toBe("3 de 10");
    expect(cell("pos_valor", 1)).toBe("sin dato");
    expect(cell("producto", 0)).toContain("Vino en envases");
    // En la UE, «España» es país de expedición: la celda lo dice.
    expect(cell("espana", 0)).toMatch(/expedido desde España/);
  });
  it("no contiene filas de puntuación ni de percentiles", () => {
    const rows = buildComparison([{ opp: base, positions: P(1) }, { opp: base, positions: P(2) }]);
    const text = rows.map((r) => `${r.key} ${r.label} ${r.cells.join(" ")}`).join(" ");
    expect(text).not.toMatch(/puntuaci|percentil|potencial|índice/i);
  });
  it("incluye una celda por resultado en cada fila y marca los aranceles como no verificados", () => {
    const US = { ...base, marketCode: "US", marketName: "Estados Unidos", partnerBasis: "origen" } as Opportunity;
    const rows = buildComparison([{ opp: base, positions: P(1) }, { opp: US, positions: P(2) }]);
    expect(rows.every((r) => r.cells.length === 2)).toBe(true);
    const a = rows.find((r) => r.key === "arancel")!.cells;
    expect(a[0]).toMatch(/Parcial/);
    expect(a[1]).toBe("Pendiente de consulta");
  });
});

describe("carga de la comparación (modo demo, datos sintéticos)", () => {
  it("devuelve los resultados pedidos con su puesto dentro del producto y avisa de los que no existen", async () => {
    const cfg = getConfig({ SMARTRADE_DATA_MODE: "demo" } as never);
    const r = await getFullRanking({ sort: "valor", order: "desc", page: 1, pageSize: 50 } as never, cfg);
    const [a, b] = r.ranked;
    expect(a.productCode).toBe(b.productCode); // el listado es siempre de un solo producto
    const c = await getComparison([a.id, b.id, "999999-DE-2024"], undefined, cfg);
    expect(c.info.synthetic).toBe(true);
    expect(c.items.map((i) => i.opp.id)).toEqual([a.id, b.id]);
    expect(c.items.map((i) => i.positions.valor?.position)).toEqual([1, 2]);
    expect(c.missing).toEqual(["999999-DE-2024"]);
  });
});
