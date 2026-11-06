import { describe, expect, it } from "vitest";
import { checkCompatible, dedupeObservations, hsVersionForYear, parseObservations } from "@/lib/trade/normalize";
import { ob } from "./helpers";

describe("duplicados", () => {
  it("detecta y conserva la observación más reciente", () => {
    const a = ob({ tradeValue: 1, retrievedAt: "2025-01-01T00:00:00Z" });
    const b = ob({ tradeValue: 2, retrievedAt: "2025-02-01T00:00:00Z" });
    const { unique, duplicates } = dedupeObservations([a, b, ob({ period: "2023" })]);
    expect(duplicates).toBe(1);
    expect(unique).toHaveLength(2);
    expect(unique.find((o) => o.period === "2024")!.tradeValue).toBe(2);
  });
});

describe("compatibilidad antes de comparar", () => {
  it("acepta observaciones homogéneas", () => expect(checkCompatible([ob({}), ob({ period: "2023" })]).ok).toBe(true));
  // Desde el 06/11/2026 HS2017 y HS2022 se unen para los códigos del catálogo que no cambiaron (tabla de la OMA,
  // lib/trade/hs-revisions.ts). Antes se rechazaba cualquier mezcla y los años finales 2022 y 2023 no daban resultados.
  it("rechaza clasificaciones distintas si el código cambió entre ediciones o no está comprobado", () => {
    const r = checkCompatible([ob({ productCode: "150920", productClassification: "HS2017" }), ob({ productCode: "150920", productClassification: "HS2022" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Clasificaciones/);
    expect(checkCompatible([ob({ productCode: "010121", productClassification: "HS2017" }), ob({ productCode: "010121", productClassification: "HS2022" })]).ok).toBe(false); // fuera del catálogo
    expect(checkCompatible([ob({ productClassification: "HS2012" }), ob({ productClassification: "HS2017" })]).ok).toBe(false);
  });
  it("une HS2017 y HS2022 para un código del catálogo sin cambios (220421)", () => {
    expect(checkCompatible([ob({ productCode: "220421", productClassification: "HS2017" }), ob({ productCode: "220421", productClassification: "HS2022" })]).ok).toBe(true);
  });
  it("rechaza monedas distintas, productos distintos y mezcla sintético/real", () => {
    expect(checkCompatible([ob({ currency: "USD" }), ob({})]).ok).toBe(false);
    expect(checkCompatible([ob({ productCode: "150920" }), ob({})]).ok).toBe(false);
    expect(checkCompatible([ob({ synthetic: true }), ob({})]).ok).toBe(false);
  });
  it("versión HS por año", () => {
    expect(hsVersionForYear(2021)).toBe("HS2017");
    expect(hsVersionForYear(2022)).toBe("HS2022");
  });
});

describe("validación de esquema", () => {
  it("descarta observaciones inválidas sin repararlas", () => {
    const { valid, invalid } = parseObservations([ob({}), { ...ob({}), productCode: "15" }, { foo: 1 }]);
    expect(valid).toHaveLength(1);
    expect(invalid).toBe(2);
  });
});
