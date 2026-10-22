import type { TradeObservation } from "@/lib/schemas/trade";
import { marketName } from "@/lib/config/catalog";
import type { SourceQuery, SourceResult, SupplierQuery, TradeSource } from "./types";

/**
 * DATOS SINTÉTICOS DE DEMOSTRACIÓN. Generados de forma determinista (sin aleatoriedad) a partir de parámetros
 * inventados. NO son estadísticas oficiales y todas las observaciones llevan synthetic=true.
 */
export const DEMO_SOURCE_LABEL = "DEMO · datos sintéticos (no son estadísticas reales)";

interface DemoProduct {
  code: string;
  name: string;
  baseM: number; // M€ de importación de un mercado de escala 1 en 2024
  growth: number;
  spainExportM: number | null; // null = sin dato de exportaciones españolas (caso incompleto)
  share: number;
  eurPerKg: number;
}

const PRODUCTS: DemoProduct[] = [
  { code: "150920", name: "Aceite de oliva virgen extra", baseM: 900, growth: 0.05, spainExportM: 3500, share: 0.1, eurPerKg: 5.5 },
  { code: "220421", name: "Vino en envases ≤ 2 l", baseM: 1200, growth: 0.02, spainExportM: 2800, share: 0.08, eurPerKg: 3.2 },
  { code: "080510", name: "Naranjas frescas o secas", baseM: 400, growth: 0.04, spainExportM: 1900, share: 0.15, eurPerKg: 1.1 },
  { code: "200570", name: "Aceitunas preparadas o conservadas", baseM: 120, growth: 0.06, spainExportM: 700, share: 0.12, eurPerKg: 3.0 },
  { code: "300490", name: "Medicamentos dosificados (resto)", baseM: 5000, growth: 0.07, spainExportM: 6000, share: 0.03, eurPerKg: 90 },
  { code: "392690", name: "Manufacturas de plástico (resto)", baseM: 2500, growth: -0.01, spainExportM: 2500, share: 0.05, eurPerKg: 4 },
  { code: "870323", name: "Turismos 1500-3000 cc", baseM: 6000, growth: 0.03, spainExportM: 4500, share: 0.04, eurPerKg: 14 },
  { code: "847130", name: "Ordenadores portátiles", baseM: 3000, growth: 0.02, spainExportM: null, share: 0.02, eurPerKg: 60 },
];

const MARKET_SCALE: Record<string, number> = { DE: 1.6, FR: 1.2, IT: 1.0, PT: 0.35, NL: 1.1, PL: 0.5, GB: 1.0, US: 2.2, MX: 0.4, MA: 0.12, JP: 0.7 };
const MARKET_GROWTH: Record<string, number> = { DE: -0.005, FR: 0, IT: 0.005, PT: 0.01, NL: 0.005, PL: 0.03, GB: -0.01, US: 0.01, MX: 0.04, MA: 0.05, JP: -0.005 };
const MARKET_SPAIN: Record<string, number> = { DE: 0.6, FR: 1.6, IT: 1.1, PT: 3.0, NL: 0.4, PL: 0.5, GB: 0.5, US: 0.3, MX: 0.4, MA: 1.2, JP: 0.2 };
const OTHER_SUPPLIERS = ["DE", "IT", "FR", "NL", "CN", "US", "PL", "BE"];

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
const classification = "HS2022";

function worldValue(p: DemoProduct, m: string, y: number): number {
  const g = p.growth + (MARKET_GROWTH[m] ?? 0);
  const wiggle = 1 + 0.03 * Math.sin(hash(p.code + m) + y);
  let v = p.baseM * 1e6 * (MARKET_SCALE[m] ?? 0.3) * Math.pow(1 + g, y - 2024) * wiggle;
  if (p.code === "870323" && m === "MX" && y <= 2022) v = 0; // caso de prueba: valor inicial cero
  return Math.round(v);
}
const spainShare = (p: DemoProduct, m: string, y: number) =>
  Math.min(0.6, p.share * (MARKET_SPAIN[m] ?? 1)) * (1 + 0.02 * (y - 2024));

function obs(
  base: Pick<TradeObservation, "period" | "reporterCode" | "partnerCode" | "flow" | "tradeValue" | "netWeight">,
  p: DemoProduct,
  retrievedAt: string,
): TradeObservation {
  return {
    ...base,
    productCode: p.code,
    productName: p.name,
    productClassification: classification,
    currency: "EUR",
    quantity: null,
    quantityUnit: null,
    source: DEMO_SOURCE_LABEL,
    retrievedAt,
    status: "observed",
    synthetic: true,
  };
}

export const demoSource: TradeSource = {
  mode: "demo",
  label: DEMO_SOURCE_LABEL,
  async fetchData(q: SourceQuery): Promise<SourceResult> {
    const retrievedAt = new Date().toISOString();
    const products = PRODUCTS.filter((p) => !q.productCodes || q.productCodes.includes(p.code));
    const out: TradeObservation[] = [];
    for (const p of products) {
      for (const y of q.years) {
        if (p.spainExportM !== null) {
          out.push(obs({ period: String(y), reporterCode: "ES", partnerCode: "WORLD", flow: "export", tradeValue: Math.round(p.spainExportM * 1e6 * (1 + 0.03 * (y - 2024))), netWeight: null }, p, retrievedAt));
        }
        for (const m of q.markets) {
          if (!(m in MARKET_SCALE)) continue;
          const w = worldValue(p, m, y);
          out.push(obs({ period: String(y), reporterCode: m, partnerCode: "WORLD", flow: "import", tradeValue: w, netWeight: Math.round(w / p.eurPerKg) }, p, retrievedAt));
          out.push(obs({ period: String(y), reporterCode: m, partnerCode: "ES", flow: "import", tradeValue: Math.round(w * spainShare(p, m, y)), netWeight: null }, p, retrievedAt));
        }
      }
    }
    return { observations: out, retrievedAt, sourceLabel: DEMO_SOURCE_LABEL, warnings: ["Datos sintéticos de demostración: no usar para decisiones comerciales."], synthetic: true };
  },
  async fetchSuppliers(q: SupplierQuery): Promise<TradeObservation[]> {
    const p = PRODUCTS.find((x) => x.code === q.productCode);
    if (!p || !(q.market in MARKET_SCALE)) return [];
    const retrievedAt = new Date().toISOString();
    const out: TradeObservation[] = [];
    for (const y of q.years) {
      const w = worldValue(p, q.market, y);
      const sp = Math.round(w * spainShare(p, q.market, y));
      out.push(obs({ period: String(y), reporterCode: q.market, partnerCode: "ES", flow: "import", tradeValue: sp, netWeight: null }, p, retrievedAt));
      const rest = w - sp;
      OTHER_SUPPLIERS.filter((c) => c !== q.market).slice(0, 4).forEach((c, i) => {
        const frac = [0.3, 0.2, 0.12, 0.08][i];
        out.push(obs({ period: String(y), reporterCode: q.market, partnerCode: c, flow: "import", tradeValue: Math.round(rest * frac), netWeight: null }, p, retrievedAt));
      });
    }
    return out;
  },
};

export const demoMarketName = marketName;
