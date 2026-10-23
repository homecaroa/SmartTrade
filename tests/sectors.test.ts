import { describe, expect, it } from "vitest";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { SECTORS, sectorFromQuery } from "@/lib/config/sectors";
import { matchesQuery } from "@/lib/trade/ranking";
import { MAX_CODES, resolveProductQuery } from "@/lib/trade/product-search";
import type { Opportunity } from "@/lib/trade/opportunities";

describe("sectores", () => {
  it("ids únicos y en formato slug", () => {
    expect(new Set(SECTORS.map((s) => s.id)).size).toBe(SECTORS.length);
    expect(SECTORS.every((s) => /^[a-z0-9-]+$/.test(s.id))).toBe(true);
  });
  it("todos los códigos existen en el catálogo y cada producto está en un único sector", () => {
    const cat = new Set(HS_CATALOG.map((e) => e.code));
    const all = SECTORS.flatMap((s) => s.codes);
    expect(all.every((c) => cat.has(c))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(HS_CATALOG.length);
  });
  it("ningún sector supera el máximo de códigos por búsqueda", () => {
    expect(SECTORS.every((s) => s.codes.length > 0 && s.codes.length <= MAX_CODES)).toBe(true);
  });
  it("sectorFromQuery solo acepta un sector exacto y existente", () => {
    expect(sectorFromQuery("sector:bebidas")?.name).toBe("Vinos y bebidas");
    expect(sectorFromQuery("sector:bebidas, sector:automocion")).toBeUndefined();
    expect(sectorFromQuery("sector:inventado")).toBeUndefined();
  });
});

describe("consulta por sector", () => {
  it("expande el sector a sus códigos y permite combinarlo", () => {
    expect(resolveProductQuery("sector:bebidas").codes).toEqual(SECTORS.find((s) => s.id === "bebidas")!.codes);
    const r = resolveProductQuery("sector:bebidas, sector:automocion, 220421");
    expect(r.codes.length).toBe(10);
    expect(resolveProductQuery("sector:xyz").unmatched).toEqual(["sector:xyz"]);
  });
  it("el filtro del ranking (modo demo) respeta el sector", () => {
    const o = (productCode: string) => ({ productCode, productName: "x" }) as Opportunity;
    expect(matchesQuery(o("220421"), "sector:bebidas")).toBe(true);
    expect(matchesQuery(o("870323"), "sector:bebidas")).toBe(false);
  });
});
