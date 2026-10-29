/**
 * Formas de cobro usadas en los dos módulos. Probabilidades de impago, comisiones y días de financiación: ESTIMACIONES
 * DIDÁCTICAS para comparar instrumentos entre sí (orden de riesgo coherente con la práctica), no datos de mercado.
 */
export type PaymentId = "anticipado" | "anticipo_30_70" | "carta_credito" | "cobro_documentario" | "abierta_30" | "abierta_60" | "abierta_90" | "abierta_90_seguro";

export interface PaymentTerm {
  id: PaymentId;
  label: string;
  /** Explicación breve para el alumno. */
  explain: string;
  /** Probabilidad base de impago (comprador de riesgo medio). Estimación didáctica. */
  baseDefault: number;
  /** Días que el vendedor financia desde la entrega hasta el cobro. */
  financingDays: number;
  /** Comisión bancaria o prima sobre el importe, a cargo del vendedor. Estimación didáctica. */
  feePct: number;
}

export const PAYMENT_TERMS: PaymentTerm[] = [
  { id: "anticipado", label: "Pago anticipado del 100 %", explain: "El comprador paga antes del envío: riesgo casi nulo para el vendedor, pero pocos compradores lo aceptan en una relación nueva.", baseDefault: 0, financingDays: 0, feePct: 0 },
  { id: "anticipo_30_70", label: "30 % anticipado y 70 % contra copia de documentos", explain: "Reparte el riesgo: el anticipo cubre parte del coste y el resto se cobra al enviar los documentos.", baseDefault: 0.012, financingDays: 10, feePct: 0 },
  { id: "carta_credito", label: "Carta de crédito documentaria confirmada", explain: "Un banco se compromete a pagar si se presentan documentos conformes. Muy segura, pero cara y exigente con los documentos.", baseDefault: 0.002, financingDays: 15, feePct: 0.012 },
  { id: "cobro_documentario", label: "Cobro documentario (documentos contra pago)", explain: "El banco entrega los documentos al comprador solo cuando paga. Más barato que la carta de crédito, pero el comprador puede no recoger la mercancía.", baseDefault: 0.02, financingDays: 20, feePct: 0.003 },
  { id: "abierta_30", label: "Cuenta abierta a 30 días", explain: "Se envía la mercancía y se cobra después. Cómodo para el comprador; el vendedor asume todo el riesgo de impago.", baseDefault: 0.03, financingDays: 30, feePct: 0 },
  { id: "abierta_60", label: "Cuenta abierta a 60 días", explain: "Como a 30 días, con más financiación a cargo del vendedor y más riesgo.", baseDefault: 0.04, financingDays: 60, feePct: 0 },
  { id: "abierta_90", label: "Cuenta abierta a 90 días", explain: "Habitual en algunos canales de distribución, pero es la que más financia y arriesga el vendedor.", baseDefault: 0.05, financingDays: 90, feePct: 0 },
  { id: "abierta_90_seguro", label: "Cuenta abierta a 90 días con seguro de crédito", explain: "Se concede el aplazamiento que pide el comprador y se cubre la mayor parte del riesgo con una póliza de seguro de crédito (tiene un coste).", baseDefault: 0.005, financingDays: 90, feePct: 0.006 },
];

export const paymentTerm = (id: PaymentId): PaymentTerm => {
  const t = PAYMENT_TERMS.find((p) => p.id === id);
  if (!t) throw new Error(`Forma de pago desconocida: ${id}`);
  return t;
};

export type BuyerRisk = "bajo" | "medio" | "alto";
export const RISK_MULTIPLIER: Record<BuyerRisk, number> = { bajo: 0.5, medio: 1, alto: 1.8 };

/** Probabilidad de impago estimada (0–1) según instrumento y perfil del comprador. */
export const defaultProbability = (id: PaymentId, risk: BuyerRisk) => Math.min(1, paymentTerm(id).baseDefault * RISK_MULTIPLIER[risk]);
