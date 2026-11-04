import { describe, expect, it } from "vitest";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { resolveProductQuery, searchCatalog } from "@/lib/trade/product-search";

describe("catálogo", () => {
  it("códigos HS6 válidos y sin duplicados", () => {
    expect(HS_CATALOG.every((e) => /^\d{6}$/.test(e.code))).toBe(true);
    expect(new Set(HS_CATALOG.map((e) => e.code)).size).toBe(HS_CATALOG.length);
  });
});

describe("búsqueda por nombre", () => {
  it("ignora acentos, mayúsculas y plurales", () => {
    expect(searchCatalog("CERÁMICA").map((e) => e.code)).toEqual(["690721", "690722"]);
    expect(searchCatalog("vinos").map((e) => e.code)).toContain("220421");
  });
  it("exige todas las palabras", () => {
    // Desde el 04/11/2026 el catálogo incluye subcategorías NC8; la búsqueda en bruto las devuelve y
    // resolveProductQuery se queda con la partida (ver tests/nc8.test.ts).
    expect(searchCatalog("coches eléctricos").map((e) => e.code)).toEqual(["870380", "87038010", "87038090"]);
    expect(searchCatalog("coches eléctricos usados").map((e) => e.code)).toEqual(["87038090"]);
  });
  it("devuelve vacío si no hay coincidencias", () => {
    expect(searchCatalog("xyzzy")).toEqual([]);
    expect(searchCatalog("de")).toEqual([]);
  });
});

describe("resolveProductQuery", () => {
  it("acepta códigos, prefijos y nombres mezclados sin duplicar", () => {
    const r = resolveProductQuery("220421, 2204, aceite de oliva");
    expect(r.codes).toEqual(["220421", "220429", "220410", "150920", "150930"]);
    expect(r.unmatched).toEqual([]);
    expect(r.notes.length).toBe(2);
  });
  it("separa códigos por espacios y registra lo no interpretado", () => {
    const r = resolveProductQuery("220421 150920, xyzzy");
    expect(r.codes).toEqual(["220421", "150920"]);
    expect(r.unmatched).toEqual(["xyzzy"]);
  });
  it("marca búsquedas con demasiados códigos", () => {
    expect(resolveProductQuery(HS_CATALOG.map((e) => e.code).join(",")).tooMany).toBe(true);
  });
});

describe("sinónimos en inglés y erratas", () => {
  it("entiende nombres en inglés", () => {
    expect(searchCatalog("olive oil").map((e) => e.code)).toEqual(["150920", "150930"]);
    expect(searchCatalog("ceramic tiles").map((e) => e.code)).toEqual(["690721", "690722"]);
    expect(searchCatalog("laptops").map((e) => e.code)).toEqual(["847130"]);
  });
  it("tolera erratas solo si la búsqueda exacta no da resultados, y lo avisa", () => {
    const r = resolveProductQuery("ceramca");
    expect(r.codes).toEqual(["690721", "690722"]);
    expect(r.notes[0]).toContain("aproximada");
    expect(resolveProductQuery("cerámica").notes[0]).not.toContain("aproximada");
  });
  it("no inventa coincidencias con palabras cortas o sin relación", () => {
    // Las subcategorías NC8 de una partida encontrada se descartan (contarían dos veces el mismo comercio).
    expect(resolveProductQuery("vin").codes).toEqual(searchCatalog("vin").map((e) => e.code).filter((c) => c.length === 6));
    expect(resolveProductQuery("xyzzyqwerty").codes).toEqual([]);
    expect(resolveProductQuery("casa").codes).toEqual([]);
  });
});
