import { describe, expect, it } from "vitest";
import { ctxOf, resolve } from "@/lib/learning/export/engine";
import { EXPORT_SCENARIOS } from "@/lib/learning/export/scenarios";
import { NEGOTIATION_SCENARIOS } from "@/lib/learning/negotiation/scenarios";
import { displayOrder } from "@/lib/learning/order";

/** Caso real del 29/10/2026: con el orden de los datos, elegir siempre la primera opción daba un 100 %. */
describe("orden de las opciones", () => {
  it("es determinista y conserva todas las opciones", () => {
    const xs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(displayOrder(xs, "s")).toEqual(displayOrder(xs, "s"));
    expect(displayOrder(xs, "s").map((x) => x.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("la opción correcta no es siempre la primera ni ocupa siempre el mismo lugar", () => {
    const positions: number[] = [];
    for (const sc of EXPORT_SCENARIOS) for (const d of sc.decisions) {
      if (d.kind !== "single") continue;
      const ctx = ctxOf(sc, { incoterm: sc.incoterms[0] });
      positions.push(displayOrder(d.options, `${sc.id}:${d.id}`).findIndex((o) => o.id === resolve(d.best, ctx)));
    }
    for (const sc of NEGOTIATION_SCENARIOS) for (const q of sc.prep) if (q.kind === "options") positions.push(displayOrder(q.options, `${sc.id}:${q.id}`).findIndex((o) => o.id === q.best));
    const firsts = positions.filter((p) => p === 0).length;
    expect(firsts / positions.length).toBeLessThan(0.6);
    expect(new Set(positions).size).toBeGreaterThanOrEqual(3);
  });
});
