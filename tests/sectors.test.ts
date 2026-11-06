import { describe, expect, it } from "vitest";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { SECTORS, sectorFromQuery } from "@/lib/config/sectors";
import { getConfig } from "@/lib/config";
import { getFullRanking } from "@/lib/service";
import { MAX_CODES, resolveProductQuery } from "@/lib/trade/product-search";

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
  // matchesQuery desapareció con el ranking por puntuación (06/11/2026); el filtro de la demo vive en el servicio.
  it("el filtro de la búsqueda (modo demo) respeta el sector", async () => {
    const cfg = getConfig({ SMARTRADE_DATA_MODE: "demo" } as never);
    const bebidas = new Set(SECTORS.find((s) => s.id === "bebidas")!.codes);
    const r = await getFullRanking({ q: "sector:bebidas", sort: "valor", order: "desc", page: 1, pageSize: 25 } as never, cfg);
    expect(r.products.length).toBeGreaterThan(0);
    expect(r.products.every((p) => bebidas.has(p.code))).toBe(true);
    expect(r.ranked.every((o) => bebidas.has(o.productCode))).toBe(true);
  });
});
