import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuery } from "@/lib/schemas/query";
import { LENSES } from "@/lib/scoring/score";
import { opportunitiesToCsv } from "@/lib/trade/csv";
import { buildOpportunities } from "@/lib/trade/opportunities";
import { lensRanks, rankOpportunities } from "@/lib/trade/ranking";
import { pairObs } from "./helpers";

/**
 * Dos rankings en lugar de la puntuación única (03/11/2026, docs/methodology.md). Se comprueba el punto de llamada: la
 * URL, el orden, el puesto en cada ranking y el CSV, no solo la función de puntuación.
 */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Mercados con tamaño y cuota española en sentidos opuestos: el orden de los dos rankings tiene que diferir. */
function universe() {
  const markets = [{ code: "DE", name: "Alemania" }, { code: "FR", name: "Francia" }, { code: "IT", name: "Italia" }, { code: "NL", name: "Países Bajos" }];
  const obs = [
    ...pairObs({ market: "DE", world: [900, 950, 1000], spain: [300, 320, 350], exportES: 5000 }), // grande, mucha cuota
    ...pairObs({ market: "FR", world: [600, 640, 700], spain: [150, 160, 175], exportES: 5000 }).filter((o) => o.flow !== "export"),
    ...pairObs({ market: "IT", world: [300, 310, 320], spain: [10, 9, 8], exportES: 5000 }).filter((o) => o.flow !== "export"), // pequeño, casi sin cuota
    ...pairObs({ market: "NL", world: [100, 105, 110], spain: [2, 2, 2], exportES: 5000 }).filter((o) => o.flow !== "export"),
  ];
  return buildOpportunities({ observations: obs, markets, endYear: 2024, mode: "comext" }).opportunities;
}

describe("los dos rankings", () => {
  it("ordenan distinto: tamaño frente a hueco de cuota española", () => {
    const all = universe();
    expect(rankOpportunities(all, { sort: "volumen", order: "desc" }).map((o) => o.marketCode)).toEqual(["DE", "FR", "IT", "NL"]);
    const pot = rankOpportunities(all, { sort: "potencial", order: "desc" }).map((o) => o.marketCode);
    expect(pot.slice(0, 2).sort()).toEqual(["IT", "NL"]);
    expect(pot.at(-1)).toBe("DE");
  });
  it("el puesto de cada oportunidad se da en los dos rankings; incompleta = null", () => {
    const all = universe();
    const de = all.find((o) => o.marketCode === "DE")!;
    expect(lensRanks(all, de.id)).toEqual({ volumen: 1, potencial: 4 });
    expect(lensRanks(all, "999999-DE-2024")).toEqual({ volumen: null, potencial: null });
  });
  it("la URL acepta los dos rankings; «score» y «size» de enlaces antiguos llevan a «volumen», que es el de defecto", () => {
    const sort = (s?: string) => { const r = parseQuery(s === undefined ? {} : { sort: s }); return r.success ? r.data.sort : "ERROR"; };
    expect(sort()).toBe("volumen");
    expect(sort("potencial")).toBe("potencial");
    expect(sort("growth")).toBe("growth");
    expect(sort("score")).toBe("volumen");
    expect(sort("size")).toBe("volumen");
    expect(sort("otro")).toBe("ERROR");
  });
  it("el CSV ya no tiene columna «puntuacion»; los índices son los percentiles de tamaño y expansión", () => {
    const header = opportunitiesToCsv(universe()).replace("﻿", "").split("\r\n")[0].split(",");
    expect(header).not.toContain("puntuacion");
    expect(header).toContain("percentil_tamano");
    expect(header).toContain("percentil_expansion");
    expect(LENSES.volumen.component).toBe("size");
    expect(LENSES.potencial.component).toBe("expansion");
  });
  it("la portada y la ficha muestran los dos rankings, sin rastro de los pesos antiguos", () => {
    const page = sinComentarios(readFileSync("app/page.tsx", "utf8"));
    expect(page).toMatch(/<LensSwitch/);
    const table = sinComentarios(readFileSync("components/opportunity-table.tsx", "utf8"));
    expect(table).toMatch(/lens="volumen"/);
    expect(table).toMatch(/lens="potencial"/);
    for (const f of ["components/opportunity-score.tsx", "app/metodologia/page.tsx", "lib/scoring/score.ts", "lib/scoring/labels.ts"]) {
      const src = sinComentarios(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/DEFAULT_WEIGHTS|\.total\b|contribution/);
    }
  });
});

describe("coherencia entre etiquetas e índices", () => {
  it("una oportunidad con «Poca exportación española» nunca tiene «Potencial de cuota» por encima del tope", async () => {
    const { describeOpportunity } = await import("@/lib/scoring/labels");
    const { LOW_EXPORT_PERCENTILE } = await import("@/lib/scoring/score");
    // Dos productos (percentiles de exportación 25 y 75): el caso real que destapó la contradicción.
    const mk = (prod: string, exp: number) => ["DE", "FR", "IT", "NL", "AT"].flatMap((m, i) =>
      pairObs({ product: prod, market: m, world: [100 * (i + 1), 110 * (i + 1), 120 * (i + 1)], spain: [i + 1, i + 1, i + 1], exportES: m === "DE" ? exp : null }));
    const markets = ["DE", "FR", "IT", "NL", "AT"].map((code) => ({ code, name: code }));
    const opps = buildOpportunities({ observations: [...mk("150920", 9000), ...mk("150930", 100)], markets, endYear: 2024, mode: "comext" }).opportunities.filter((o) => o.complete);
    expect(opps.length).toBeGreaterThan(4);
    for (const o of opps) if (describeOpportunity(o).tags.some((t) => t.key === "pocaexpo")) expect(o.score!.potencial).toBeLessThanOrEqual(LOW_EXPORT_PERCENTILE);
  });
});
