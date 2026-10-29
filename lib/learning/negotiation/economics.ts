import { round2 } from "../money";
import { defaultProbability, paymentTerm, type PaymentId } from "../payments";
import type { Guarantee, NegotiationScenario, Offer } from "./types";

/**
 * Resultado económico de una oferta para el VENDEDOR. Fórmulas (todas por pedido, importes simulados):
 *   ingresos = precio × cantidad
 *   costes = producto + logística según Incoterm + garantía + financiación + comisión del cobro + pérdida esperada
 *   financiación = ingresos × coste de capital anual × días financiados / 365
 *   pérdida esperada = ingresos × probabilidad de impago (según forma de pago y perfil del comprador)
 * La pérdida esperada no es un gasto seguro: es el coste medio del riesgo. Se muestra por separado.
 */
export interface SellerEconomics {
  revenue: number; product: number; logistics: number; guarantee: number; financing: number; fee: number; expectedLoss: number;
  margin: number; marginPct: number; defaultProb: number;
}

const variablePct = (sc: NegotiationScenario, payment: PaymentId) => {
  const t = paymentTerm(payment);
  return (sc.seller.capitalCostPct / 100) * (t.financingDays / 365) + t.feePct + defaultProbability(payment, sc.buyer.risk);
};

export function sellerEconomics(sc: NegotiationScenario, o: Offer): SellerEconomics {
  const t = paymentTerm(o.payment);
  const revenue = round2(o.unitPrice * o.quantity);
  const product = round2(sc.seller.unitCost * o.quantity);
  const logistics = round2((sc.seller.logisticsPerUnit[o.incoterm] ?? 0) * o.quantity);
  const guarantee = round2((o.guarantee === "ampliada" ? sc.seller.guaranteeCostPerUnit : 0) * o.quantity);
  const financing = round2(revenue * (sc.seller.capitalCostPct / 100) * (t.financingDays / 365));
  const fee = round2(revenue * t.feePct);
  const defaultProb = defaultProbability(o.payment, sc.buyer.risk);
  const expectedLoss = round2(revenue * defaultProb);
  const margin = round2(revenue - product - logistics - guarantee - financing - fee - expectedLoss);
  return { revenue, product, logistics, guarantee, financing, fee, expectedLoss, margin, marginPct: revenue > 0 ? round2((margin / revenue) * 100) : 0, defaultProb };
}

/** Precio mínimo por unidad (margen cero) para unas condiciones: el «punto de retirada» del vendedor. */
export function floorPrice(sc: NegotiationScenario, incoterm: string, payment: PaymentId, guarantee: Guarantee): number {
  const fixed = sc.seller.unitCost + (sc.seller.logisticsPerUnit[incoterm] ?? 0) + (guarantee === "ampliada" ? sc.seller.guaranteeCostPerUnit : 0);
  return round2(fixed / (1 - variablePct(sc, payment)));
}

/** Precio por unidad que da exactamente el margen objetivo. */
export function targetPrice(sc: NegotiationScenario, incoterm: string, payment: PaymentId, guarantee: Guarantee): number {
  const fixed = sc.seller.unitCost + (sc.seller.logisticsPerUnit[incoterm] ?? 0) + (guarantee === "ampliada" ? sc.seller.guaranteeCostPerUnit : 0);
  return round2(fixed / (1 - variablePct(sc, payment) - sc.seller.targetMarginPct / 100));
}
