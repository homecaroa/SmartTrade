import type { Fact } from "../provenance";
import type { BuyerRisk, PaymentId } from "../payments";

/** Tipos del simulador de negociación B2B. Todo el comportamiento del comprador sale de reglas locales deterministas. */
export type Guarantee = "estandar" | "ampliada";

/** Oferta: lo que el alumno propone (o la contraoferta del comprador). Precio por unidad en euros, según el Incoterm. */
export interface Offer {
  unitPrice: number;
  quantity: number;
  incoterm: string;
  deliveryDays: number;
  payment: PaymentId;
  exclusivity: boolean;
  guarantee: Guarantee;
}

export type CriterionKey = "price" | "payment" | "delivery" | "quantity" | "guarantee" | "incoterm";

export interface PrepOption { id: string; label: string; grade: "correcta" | "razonable" | "grave"; feedback: string }
export type PrepQuestion =
  | { kind: "options"; id: string; title: string; prompt: string; options: PrepOption[]; best: string; why: string }
  | { kind: "walkaway"; id: "walkaway"; title: string; prompt: string; basis: { incoterm: string; payment: PaymentId; guarantee: Guarantee } };

export interface NegotiationScenario {
  id: string;
  title: string;
  difficulty: "básica" | "media" | "avanzada";
  summary: string;
  learningGoal: string;
  instructions: string[];
  hs6: string;
  market: string;
  unit: string;
  unitDetail: string;
  company: { name: string; city: string; description: string };
  buyer: {
    name: string; city: string; type: string; description: string; needs: string[]; budget: string; volume: string; frequency: string;
    requirements: string[]; language: string; context: string[]; paymentHabit: string; risk: BuyerRisk;
  };
  facts: Fact[];
  /** Datos del vendedor: el alumno los conoce (son sus propios costes). Supuestos del escenario. */
  seller: {
    unitCost: number;
    logisticsPerUnit: Record<string, number>;
    guaranteeCostPerUnit: number;
    targetMarginPct: number;
    capitalCostPct: number;
    minDeliveryDays: number;
    maxQuantity: number;
    /** Reglas que la empresa no puede cumplir (por ejemplo, DDP sin registro de IVA en destino). */
    unfeasibleIncoterms: Record<string, string>;
  };
  allowedIncoterms: string[];
  allowedPayments: PaymentId[];
  /** Límites y preferencias OCULTOS del comprador: se revelan solo al final, en la revisión. */
  hidden: {
    /** Precios en «coste puesto en su almacén» por unidad: precio + lo que el comprador paga según el Incoterm. */
    targetPrice: number;
    maxPrice: number;
    buyerExtraPerUnit: Record<string, number>;
    minQty: number; desiredQty: number; maxQty: number;
    maxDeliveryDays: number;
    /** 0 = inaceptable. */
    paymentUtility: Partial<Record<PaymentId, number>>;
    incotermUtility: Record<string, number>;
    requiredGuarantee: Guarantee;
    exclusivity: { wants: boolean; extraQty: number };
    weights: Record<CriterionKey, number>;
    acceptAt: number;
    rejectBelow: number;
    maxRounds: number;
  };
  prep: PrepQuestion[];
  /** Estrategia de referencia para comparar al final: ofertas que se enviarían en orden. */
  reference: { label: string; explanation: string; offers: Offer[] };
}
