import { describe, expect, it } from "vitest";
import { annualChanges, cagr, spanishShare, topSuppliersShare, unitValuePerKg } from "@/lib/scoring/indicators";

describe("CAGR", () => {
  it("calcula correctamente con 2 intervalos", () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(10, 10);
    expect(cagr(200, 100, 2)).toBeCloseTo(-29.2893, 3);
  });
  it("devuelve null con valor inicial cero, negativo o ausente (no fuerza el cálculo)", () => {
    expect(cagr(0, 100, 2)).toBeNull();
    expect(cagr(-5, 100, 2)).toBeNull();
    expect(cagr(100, 0, 2)).toBeNull();
    expect(cagr(null, 100, 2)).toBeNull();
    expect(cagr(100, NaN, 2)).toBeNull();
    expect(cagr(100, 120, 0)).toBeNull();
  });
});

describe("variaciones anuales", () => {
  it("calcula y propaga null", () => {
    expect(annualChanges([100, 110, 99])).toEqual([expect.closeTo(10), expect.closeTo(-10)]);
    expect(annualChanges([0, 10, null])).toEqual([null, null]);
  });
});

describe("cuota española", () => {
  it("calcula el porcentaje", () => expect(spanishShare(25, 200)).toBeCloseTo(12.5));
  it("admite 0 observado", () => expect(spanishShare(0, 200)).toBe(0));
  it("null si total no válido o España supera el total", () => {
    expect(spanishShare(10, 0)).toBeNull();
    expect(spanishShare(null, 100)).toBeNull();
    expect(spanishShare(150, 100)).toBeNull();
  });
});

describe("concentración y valor unitario", () => {
  it("top-3 proveedores", () => {
    const s = [{ code: "A", value: 40 }, { code: "B", value: 30 }, { code: "C", value: 10 }, { code: "D", value: 5 }];
    expect(topSuppliersShare(s, 100, 3)).toBeCloseTo(80);
    expect(topSuppliersShare([], 100)).toBeNull();
    expect(topSuppliersShare(s, 50, 3)).toBeNull();
  });
  it("valor por kg", () => {
    expect(unitValuePerKg(1000, 200)).toBe(5);
    expect(unitValuePerKg(1000, 0)).toBeNull();
    expect(unitValuePerKg(null, 10)).toBeNull();
  });
});
