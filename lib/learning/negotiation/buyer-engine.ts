import { round2 } from "../money";
import { paymentTerm, type PaymentId } from "../payments";
import { floorPrice } from "./economics";
import type { CriterionKey, NegotiationScenario, Offer } from "./types";

/**
 * Comprador simulado basado en reglas. Determinista: misma secuencia de ofertas → mismas respuestas.
 * 1. Cada criterio se puntúa de 0 a 1 (utilidad) y se pondera con las prioridades del comprador.
 * 2. Algunos incumplimientos son «límites duros» (cantidad fuera de rango, plazo excesivo, pago inaceptable, precio muy
 *    por encima de su máximo): con ellos nunca acepta.
 * 3. Acepta si no hay límites duros y la utilidad llega a su umbral. Si no, contraoferta acercándose poco a poco
 *    (concede más en cada ronda) o, si la oferta es muy mala, se estanca o se agotan las rondas, rechaza.
 * Al alumno solo se le explica QUÉ ha pesado, en términos cualitativos; los límites numéricos se revelan al final.
 */
export interface CriterionScore { key: CriterionKey; label: string; u: number; hard: boolean; message: string }
export type ResponseKind = "acepta" | "contraoferta" | "rechaza";
export interface BuyerResponse { kind: ResponseKind; reasons: string[]; counter: Offer | null; final: boolean; utility: number }

export const CRITERION_LABEL: Record<CriterionKey, string> = { price: "Precio", payment: "Forma de pago", delivery: "Plazo de entrega", quantity: "Cantidad", guarantee: "Garantía y calidad", incoterm: "Condiciones de entrega" };
const CONCESSION = [0.3, 0.5, 0.7, 0.85, 0.95];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const deliveredPrice = (sc: NegotiationScenario, o: Offer) => round2(o.unitPrice + (sc.hidden.buyerExtraPerUnit[o.incoterm] ?? 0));

export function criteria(sc: NegotiationScenario, o: Offer): CriterionScore[] {
  const h = sc.hidden;
  const out: CriterionScore[] = [];
  const dp = deliveredPrice(sc, o);
  const uPrice = dp <= h.targetPrice ? 1 : dp >= h.maxPrice ? 0 : clamp01(1 - (dp - h.targetPrice) / (h.maxPrice - h.targetPrice));
  const priceHard = dp > h.maxPrice * 1.1;
  out.push({ key: "price", label: CRITERION_LABEL.price, u: uPrice, hard: priceHard,
    message: priceHard ? "Con ese precio no podría revender el producto en su mercado." : uPrice >= 0.85 ? "El precio encaja con lo que esperaba." : uPrice >= 0.4 ? "El precio le parece algo alto para su mercado." : "El precio está lejos de lo que puede pagar." });

  const uPay = h.paymentUtility[o.payment] ?? 0;
  out.push({ key: "payment", label: CRITERION_LABEL.payment, u: uPay, hard: uPay === 0,
    message: uPay === 0 ? "No acepta esa forma de pago." : uPay >= 0.8 ? "La forma de pago le conviene." : "Preferiría otra forma de pago (más aplazamiento o menos gastos bancarios para él)." });

  const late = o.deliveryDays > h.maxDeliveryDays;
  const uDel = late ? clamp01(1 - (o.deliveryDays - h.maxDeliveryDays) / h.maxDeliveryDays) : 1;
  out.push({ key: "delivery", label: CRITERION_LABEL.delivery, u: uDel, hard: late,
    message: late ? "Ese plazo de entrega no le sirve para su calendario de ventas." : "El plazo de entrega le encaja." });

  const inRange = o.quantity >= h.minQty && o.quantity <= h.maxQty;
  const uQty = inRange ? clamp01(1 - Math.abs(o.quantity - h.desiredQty) / (h.maxQty - h.minQty)) : 0;
  out.push({ key: "quantity", label: CRITERION_LABEL.quantity, u: uQty, hard: !inRange,
    message: !inRange ? "Esa cantidad no encaja con lo que puede vender." : uQty >= 0.8 ? "La cantidad le encaja." : "Habría preferido otra cantidad." });

  const uGuar = o.guarantee === h.requiredGuarantee || o.guarantee === "ampliada" ? 1 : 0.3;
  out.push({ key: "guarantee", label: CRITERION_LABEL.guarantee, u: uGuar, hard: false,
    message: uGuar === 1 ? "Las garantías cubren lo que necesita." : "Echa en falta las garantías o la documentación de calidad que necesita." });

  const uInc = h.incotermUtility[o.incoterm] ?? 0;
  out.push({ key: "incoterm", label: CRITERION_LABEL.incoterm, u: uInc, hard: false,
    message: uInc >= 0.8 ? "Las condiciones de entrega le convienen." : "Las condiciones de entrega le obligan a asumir trámites o costes que prefiere evitar." });
  return out;
}

export function utility(sc: NegotiationScenario, o: Offer): number {
  const base = criteria(sc, o).reduce((a, c) => a + sc.hidden.weights[c.key] * c.u, 0);
  const bonus = sc.hidden.exclusivity.wants && o.exclusivity ? 0.05 : 0;
  return round2(Math.min(1, base + bonus));
}

function bestPayment(sc: NegotiationScenario): PaymentId {
  return [...sc.allowedPayments].sort((a, b) => (sc.hidden.paymentUtility[b] ?? 0) - (sc.hidden.paymentUtility[a] ?? 0) || paymentTerm(a).financingDays - paymentTerm(b).financingDays)[0];
}
function bestIncoterm(sc: NegotiationScenario): string {
  return [...sc.allowedIncoterms].sort((a, b) => (sc.hidden.incotermUtility[b] ?? 0) - (sc.hidden.incotermUtility[a] ?? 0))[0];
}

/** Contraoferta del comprador: corrige lo que no le encaja y acerca el precio a su objetivo según la ronda. */
export function counterOffer(sc: NegotiationScenario, o: Offer, round: number): Offer {
  const h = sc.hidden;
  const incoterm = (h.incotermUtility[o.incoterm] ?? 0) >= 0.5 ? o.incoterm : bestIncoterm(sc);
  // Se compara en «coste puesto en su almacén» con el Incoterm de la oferta recibida, y se traduce al Incoterm de la
  // contraoferta: si cambia de regla, cambia quién paga el transporte y el precio por unidad debe recogerlo.
  const offeredDelivered = deliveredPrice(sc, o);
  const k = CONCESSION[Math.min(round, CONCESSION.length - 1)];
  const wanted = Math.min(offeredDelivered, h.maxPrice, round2(h.targetPrice + Math.max(0, offeredDelivered - h.targetPrice) * k));
  const unitPrice = round2(wanted - (h.buyerExtraPerUnit[incoterm] ?? 0));
  let quantity = o.quantity >= h.minQty && o.quantity <= h.maxQty ? o.quantity : h.desiredQty;
  let exclusivity = o.exclusivity;
  if (h.exclusivity.wants && !o.exclusivity) {
    // Intercambio: pide exclusividad a cambio de comprometer más volumen.
    exclusivity = true;
    quantity = Math.min(h.maxQty, Math.max(quantity, h.desiredQty) + h.exclusivity.extraQty);
  }
  return {
    unitPrice, quantity, incoterm, exclusivity,
    deliveryDays: Math.min(o.deliveryDays, h.maxDeliveryDays),
    payment: (h.paymentUtility[o.payment] ?? 0) >= 0.6 ? o.payment : bestPayment(sc),
    guarantee: o.guarantee === "ampliada" ? "ampliada" : h.requiredGuarantee,
  };
}

/**
 * Respuesta a la oferta número `round` (0 = primera). `previous` son las utilidades de las ofertas anteriores del alumno,
 * para detectar estancamiento: dos ofertas seguidas sin mejora real hacen que el comprador se retire.
 */
export function respond(sc: NegotiationScenario, o: Offer, round: number, previous: number[]): BuyerResponse {
  const cs = criteria(sc, o);
  const u = utility(sc, o);
  const hard = cs.filter((c) => c.hard);
  const reasons = [...cs].sort((a, b) => sc.hidden.weights[b.key] * (1 - b.u) - sc.hidden.weights[a.key] * (1 - a.u)).filter((c) => c.hard || c.u < 0.8).slice(0, 3).map((c) => c.message);
  if (sc.hidden.exclusivity.wants) reasons.push(o.exclusivity ? "Valora mucho la exclusividad: está dispuesto a comprometer más volumen por ella." : "Valoraría tener la exclusividad en su país.");
  if (!hard.length && u >= sc.hidden.acceptAt) return { kind: "acepta", reasons: ["La oferta cubre lo que necesita en condiciones que considera razonables.", ...reasons.filter((r) => !r.startsWith("Valoraría"))], counter: null, final: true, utility: u };

  const stagnant = previous.length >= 2 && u <= previous[previous.length - 1] + 0.01 && previous[previous.length - 1] <= previous[previous.length - 2] + 0.01;
  const lastRound = round >= sc.hidden.maxRounds - 1;
  if (stagnant) return { kind: "rechaza", reasons: ["No ve avances en las últimas propuestas y da por terminada la negociación.", ...reasons], counter: null, final: true, utility: u };
  if (round >= 2 && u < sc.hidden.rejectBelow) return { kind: "rechaza", reasons: ["La propuesta sigue muy lejos de lo que necesita y prefiere buscar otro proveedor.", ...reasons], counter: null, final: true, utility: u };
  if (lastRound) return { kind: "contraoferta", reasons: ["Es su última propuesta: o la aceptas o no habrá acuerdo.", ...reasons], counter: counterOffer(sc, o, round), final: true, utility: u };
  return { kind: "contraoferta", reasons, counter: counterOffer(sc, o, round), final: false, utility: u };
}

/** Validación de una oferta antes de enviarla: errores (impiden enviarla) y avisos (contradicciones o riesgos). */
export function validateOffer(sc: NegotiationScenario, o: Offer): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(o.unitPrice) || o.unitPrice <= 0) errors.push("El precio debe ser mayor que cero.");
  if (!Number.isInteger(o.quantity) || o.quantity <= 0) errors.push("La cantidad debe ser un número entero positivo.");
  if (o.quantity > sc.seller.maxQuantity) errors.push(`Tu empresa no puede servir más de ${sc.seller.maxQuantity.toLocaleString("es-ES")} ${sc.unit}s en este pedido.`);
  if (!Number.isInteger(o.deliveryDays) || o.deliveryDays <= 0) errors.push("El plazo de entrega debe ser un número entero de días.");
  if (!sc.allowedIncoterms.includes(o.incoterm)) errors.push("Incoterm no disponible en este caso.");
  if (!sc.allowedPayments.includes(o.payment)) errors.push("Forma de pago no disponible en este caso.");
  if (errors.length) return { errors, warnings };
  if (o.deliveryDays < sc.seller.minDeliveryDays) warnings.push(`Prometes ${o.deliveryDays} días, pero tu empresa necesita al menos ${sc.seller.minDeliveryDays}: no podrías cumplirlo.`);
  if (sc.seller.unfeasibleIncoterms[o.incoterm]) warnings.push(sc.seller.unfeasibleIncoterms[o.incoterm]);
  if (o.unitPrice < floorPrice(sc, o.incoterm, o.payment, o.guarantee)) warnings.push("Con este precio y estas condiciones la operación da pérdidas.");
  if (o.payment === "anticipado") warnings.push("Pocos compradores aceptan pagar por adelantado a un proveedor nuevo.");
  return { errors, warnings };
}
