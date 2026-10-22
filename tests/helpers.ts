import type { TradeObservation } from "@/lib/schemas/trade";

export function ob(p: Partial<TradeObservation>): TradeObservation {
  return {
    period: "2024", reporterCode: "DE", partnerCode: "WORLD", productCode: "220421", productName: "Test",
    productClassification: "HS2022", flow: "import", tradeValue: 100, currency: "EUR", netWeight: null,
    quantity: null, quantityUnit: null, source: "TEST", retrievedAt: "2025-01-01T00:00:00.000Z",
    status: "observed", synthetic: false, ...p,
  };
}

/** Genera observaciones de un par producto-mercado: world[3 años], spain[3 años] y exportación española. */
export function pairObs(opts: { product?: string; market?: string; world: (number | null)[]; spain: (number | null)[]; exportES: number | null; endYear?: number; cls?: string; synthetic?: boolean }): TradeObservation[] {
  const product = opts.product ?? "220421";
  const market = opts.market ?? "DE";
  const end = opts.endYear ?? 2024;
  const years = [end - 2, end - 1, end];
  const out: TradeObservation[] = [];
  years.forEach((y, i) => {
    const base = { period: String(y), productCode: product, productClassification: opts.cls ?? "HS2022", synthetic: opts.synthetic ?? false };
    if (opts.world[i] !== null) out.push(ob({ ...base, reporterCode: market, partnerCode: "WORLD", tradeValue: opts.world[i] }));
    if (opts.spain[i] !== null) out.push(ob({ ...base, reporterCode: market, partnerCode: "ES", tradeValue: opts.spain[i] }));
  });
  if (opts.exportES !== null) out.push(ob({ period: String(end), productCode: product, productClassification: opts.cls ?? "HS2022", reporterCode: "ES", partnerCode: "WORLD", flow: "export", tradeValue: opts.exportES, synthetic: opts.synthetic ?? false }));
  return out;
}
