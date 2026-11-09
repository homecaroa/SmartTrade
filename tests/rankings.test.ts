import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";
import { parseQuery } from "@/lib/schemas/query";
import { getRanking } from "@/lib/service";

/**
 * Clasificaciones descriptivas (06/11/2026). Sustituyen a los dos rankings por percentiles («Mercados grandes» y
 * «Potencial de cuota»), retirados porque no superaban a reglas triviales en su validación histórica. Se comprueba el
 * punto de llamada: URL, orden dentro de un producto, búsqueda de varios productos y paginación.
 */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const q = (raw: Record<string, string>) => { const p = parseQuery(raw); if (!p.success) throw new Error("query"); return p.data; };
const demo = () => getConfig({ SMARTRADE_DATA_MODE: "demo" });

describe("URL", () => {
  it("métricas descriptivas; los enlaces antiguos de los rankings retirados siguen funcionando", () => {
    const sort = (s?: string) => { const r = parseQuery(s === undefined ? {} : { sort: s }); return r.success ? r.data.sort : "ERROR"; };
    expect(sort()).toBe("valor");
    for (const s of ["crecimiento", "peso", "espana"]) expect(sort(s)).toBe(s);
    for (const old of ["score", "size", "volumen", "potencial"]) expect(sort(old)).toBe("valor");
    expect(sort("growth")).toBe("crecimiento");
    expect(sort("otro")).toBe("ERROR");
    expect(parseQuery({ producto: "12345" }).success).toBe(false);
  });
});

describe("búsqueda con varios productos (modo demo, datos sintéticos)", () => {
  it("nunca ordena productos distintos entre sí: la tabla es de UN producto y los demás se ofrecen para elegir", async () => {
    const r = await getRanking(q({}), demo());
    expect(r.products.length).toBeGreaterThan(1);
    expect(new Set(r.rows.map((o) => o.productCode))).toEqual(new Set([r.product!.code]));
    const other = r.products[1].code;
    const r2 = await getRanking(q({ producto: other }), demo());
    expect(r2.rows.every((o) => o.productCode === other)).toBe(true);
  });
  it("orden por valor descendente, reproducible", async () => {
    const r = await getRanking(q({ pageSize: "50" }), demo());
    const v = r.rows.map((o) => o.marketSize!);
    expect(v).toEqual([...v].sort((a, b) => b - a));
    expect((await getRanking(q({ pageSize: "50" }), demo())).rows.map((o) => o.id)).toEqual(r.rows.map((o) => o.id));
  });
  it("una página que no existe se detecta (no se presenta como «no hay resultados»)", async () => {
    const r = await getRanking(q({ page: "999" }), demo());
    expect(r.pageOutOfRange).toBe(true);
    expect(r.rows).toHaveLength(0);
    expect(r.total).toBeGreaterThan(0);
    const page = sinComentarios(readFileSync("app/mercados/page.tsx", "utf8"));
    expect(page).toMatch(/data\.pageOutOfRange \?/);
    expect(page).toMatch(/no existe: hay/);
  });
});
