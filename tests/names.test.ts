import { describe, expect, it } from "vitest";
import { countryName } from "@/lib/config/catalog";
import { productLabel } from "@/lib/config/hs-catalog";

describe("nombres de país", () => {
  it("resuelve mercados, España y códigos propios de Eurostat", () => {
    expect(countryName("DE")).toBe("Alemania");
    expect(countryName("ES")).toBe("España");
    expect(countryName("EL")).toBe("Grecia");
    expect(countryName("XS")).toBe("Serbia");
    expect(countryName("XK")).toBe("Kosovo");
  });
  it("traduce otros países con Intl y no inventa si no puede", () => {
    expect(countryName("UA")).toBe("Ucrania");
    expect(countryName("TN")).toBe("Túnez");
    expect(countryName("EG")).toBe("Egipto");
    expect(countryName("AR")).toBe("Argentina");
    expect(countryName("ZZZ")).toBe("ZZZ");
    expect(countryName("")).toBe("");
  });
});

describe("título de producto", () => {
  it("usa el nombre en español del catálogo y conserva la descripción de la fuente", () => {
    const l = productLabel("690721", "Ceramic flags and paving, hearth or wall tiles...");
    expect(l.title).toBe("Baldosas cerámicas (absorción de agua ≤ 0,5 %)");
    expect(l.sourceDescription).toContain("Ceramic flags");
  });
  it("sin código en catálogo, muestra el nombre de la fuente tal cual", () => {
    expect(productLabel("999999", "Producto X")).toEqual({ title: "Producto X", sourceDescription: null });
  });
  it("no duplica la descripción si coincide con el nombre", () => {
    expect(productLabel("220300", "Cerveza de malta").sourceDescription).toBeNull();
  });
});
