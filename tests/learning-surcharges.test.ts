import { describe, expect, it } from "vitest";
import { computeOperation, routeOf, shipmentOf } from "@/lib/learning/export/costs";
import { ctxOf, gradeAnswer, resolve, visibleDecisions } from "@/lib/learning/export/engine";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { freightBreakdown } from "@/lib/learning/export/scenarios/shared";
import { computeQuote, equipmentFor, surcharges } from "@/lib/learning/logistics/calculator";
import { SURCHARGES } from "@/lib/learning/logistics/params";
import { mid } from "@/lib/learning/logistics/types";

/** Propuesta 2 (04/11/2026): recargos del flete (combustible y temporada alta). Importes simulados. */
const sc = (id: string) => EXPORT_SCENARIOS.find((s) => s.id === id)!;

describe("cálculo", () => {
  it("todas las rutas llevan recargo de combustible = % del flete base según el medio, y lo paga quien paga el flete", () => {
    for (const s of EXPORT_SCENARIOS) for (const r of s.logistics.routes) for (const inc of ["EXW", "FCA", "CIP", "DAP"]) {
      const q = computeQuote(shipmentOf(s), r, inc);
      const main = q.lines.find((l) => l.concept === "transporte_principal")!;
      const sur = q.lines.find((l) => l.concept === "recargos_flete");
      expect(sur, `${s.id}/${r.id}`).toBeDefined();
      expect(sur!.payer).toBe(main.payer);
      const vehicle = r.legs.find((l) => l.role === "principal")!.vehicle as keyof typeof SURCHARGES.fuelPct;
      const x = surcharges(shipmentOf(s), r, equipmentFor(shipmentOf(s), r), main.range);
      expect(x.fuel.min).toBeCloseTo(main.range.min * SURCHARGES.fuelPct[vehicle].min / 100, 1);
    }
  });
  it("temporada alta solo en el caso que la declara (Japón) y solo por barco", () => {
    const peakOf = (id: string, route: string) => { const s = sc(id); const r = routeOf(s, route); const main = computeQuote(shipmentOf(s), r, "CIP").lines.find((l) => l.concept === "transporte_principal")!.range; return surcharges(shipmentOf(s), r, equipmentFor(shipmentOf(s), r), main).peak; };
    expect(peakOf("vino-japon", "fcl")).toEqual({ min: SURCHARGES.peakPerContainer.min, max: SURCHARGES.peakPerContainer.max }); // 1 contenedor de 20'
    expect(peakOf("vino-japon", "lcl").max).toBeGreaterThan(0);
    expect(peakOf("vino-japon", "aereo").max).toBe(0);
    expect(peakOf("aceitunas-nueva-york", "fcl").max).toBe(0);
  });
  it("punto de llamada: los recargos entran en la liquidación de la operación", () => {
    const r = computeOperation(sc("vino-japon"), { incoterm: "CIP", transport: "fcl", documents: ["declaracion_origen"] });
    const line = r.lines.find((l) => l.concept === "recargos_flete")!;
    expect(line.payer).toBe("vendedor");
    expect(line.amount).toBeCloseTo(mid(line.range!), 2);
  });
});

describe("pregunta de la etapa logística", () => {
  const ask = (id: string, answers: Record<string, string>) => { const s = sc(id); return { s, d: visibleDecisions(s, answers).find((x) => x.id === "recargos") }; };
  it("solo si el transporte lo contrata el vendedor", () => {
    expect(ask("vino-japon", { incoterm: "CIP", transport: "fcl" }).d).toBeDefined();
    expect(ask("vino-japon", { incoterm: "FCA" }).d).toBeUndefined();
  });
  it("con temporada alta, olvidar el PSS es razonable; sin ella, base + combustible ya es el total", () => {
    const g = (id: string, transport: string, a: string) => { const { s, d } = ask(id, { incoterm: "CIP", transport }); return gradeAnswer(s, d!, { incoterm: "CIP", transport, recargos: a })!.grade; };
    expect([g("vino-japon", "fcl", "todo"), g("vino-japon", "fcl", "base_combustible"), g("vino-japon", "fcl", "base")]).toEqual(["correcta", "razonable", "grave"]);
    expect(g("aceitunas-nueva-york", "fcl", "base_combustible")).toBe("correcta");
  });
  it("las cifras del enunciado son las de la liquidación (mismos valores centrales)", () => {
    const s = sc("vino-japon");
    const answers = { incoterm: "CIP", transport: "fcl" };
    const f = freightBreakdown(ctxOf(s, { incoterm: "CIP", transport: "fcl" }));
    const lines = computeOperation(s, { incoterm: "CIP", transport: "fcl" }).lines;
    const amount = (c: string) => lines.find((l) => l.concept === c)!.amount;
    expect(f.base).toBeCloseTo(amount("transporte_principal"), 2);
    expect(f.fuel + f.peak).toBeCloseTo(amount("recargos_flete"), 0);
    const d = ask("vino-japon", answers).d!;
    expect(resolve(d.prompt, ctxOf(s, { incoterm: "CIP", transport: "fcl" }))).toMatch(/temporada alta/);
  });
});
