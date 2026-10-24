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

describe("tabla comparativa", () => {
  const base = { productCode: "220421", productName: "Wine", classification: "HS2022", marketCode: "DE", marketName: "Alemania", endYear: 2024, currency: "EUR", synthetic: false, quality: "alta", complete: true, annualChanges: [], marketSize: 1e9, cagr: 4, spanishShare: 3, spainExportsWorld: 2e9, score: null } as unknown as Opportunity;
  it("muestra n.d. y nunca cero cuando faltan datos", () => {
    const rows = buildComparison([{ opp: base, rank: 1 }, { opp: { ...base, marketCode: "FR", marketName: "Francia", cagr: null, spanishShare: null, spainExportsWorld: null } as Opportunity, rank: null }]);
    const cell = (k: string, i: number) => rows.find((r) => r.key === k)!.cells[i];
    expect(cell("cagr", 1)).toBe("n.d.");
    expect(cell("cuota", 1)).toBe("n.d.");
    expect(cell("exportaciones", 1)).toBe("n.d.");
    expect(cell("posicion", 1)).toBe("fuera del ranking");
    expect(cell("puntuacion", 0)).toMatch(/n\.d\./);
    expect(cell("producto", 0)).toContain("Vino en envases");
  });
  it("incluye una celda por resultado en cada fila y marca los aranceles como no verificados", () => {
    const US = { ...base, marketCode: "US", marketName: "Estados Unidos" } as Opportunity;
    const rows = buildComparison([{ opp: base, rank: 1 }, { opp: US, rank: 2 }]);
    expect(rows.every((r) => r.cells.length === 2)).toBe(true);
    const a = rows.find((r) => r.key === "arancel")!.cells;
    expect(a[0]).toMatch(/Parcial/);
    expect(a[1]).toBe("Pendiente de consulta");
  });
});

describe("carga de la comparación (modo demo, datos sintéticos)", () => {
  it("devuelve los resultados pedidos con su posición y avisa de los que no existen", async () => {
    const cfg = getConfig({ SMARTRADE_DATA_MODE: "demo" } as never);
    const r = (await getFullRanking({ sort: "score", order: "desc", page: 1, pageSize: 50 } as never, cfg)) as never as { ranked?: Opportunity[]; rows?: Opportunity[] };
    const rows = (r.ranked ?? r.rows ?? (r as unknown as Opportunity[])).filter((o) => o.score);
    const [a, b] = rows;
    const c = await getComparison([a.id, b.id, "999999-DE-2024"], undefined, cfg);
    expect(c.info.synthetic).toBe(true);
    expect(c.items.map((i) => i.opp.id)).toEqual([a.id, b.id]);
    expect(c.items.every((i) => typeof i.rank === "number")).toBe(true);
    expect(c.missing).toEqual(["999999-DE-2024"]);
  });
});
