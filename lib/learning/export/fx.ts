import { round2 } from "../money";
import type { ExtraCost, FxChoice, FxSetup } from "./types";

/**
 * Divisa de facturación y riesgo de cambio (propuesta 1, 04/11/2026). Tipos expresados como unidades de la divisa por
 * 1 euro (como se publican: 1,10 USD por euro). TODOS los tipos son SIMULADOS y fijos por caso: no hay azar ni datos de
 * mercado. Cálculo:
 * - Factura en divisa = ingresos en euros × tipo al ofertar.
 * - Sin cobertura se cobra al tipo del día de cobro: euros cobrados = factura ÷ tipo al cobrar.
 * - Con seguro de cambio se cobra al tipo pactado a plazo: euros cobrados = factura ÷ tipo a plazo. Los «puntos a plazo»
 *   dependen de la diferencia de tipos de interés entre las dos monedas y pueden jugar a favor o en contra.
 * - Facturar en euros no tiene diferencia de cambio, pero traslada el riesgo al comprador, que pide un descuento.
 * Resultado: diferencia = ingresos en euros − euros cobrados (positiva = pérdida para el vendedor; negativa = ganancia).
 */
export const FX_DIGITS: Record<FxSetup["currency"], number> = { USD: 4, JPY: 2 };
const fmtRate = (fx: FxSetup, r: number) => `${r.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: FX_DIGITS[fx.currency] })} ${fx.currency}/€`;

export function fxOutcome(fx: FxSetup, revenueEur: number, choice: FxChoice): { invoice: number; collectedEur: number; difference: number } {
  if (choice === "eur") return { invoice: revenueEur, collectedEur: revenueEur, difference: 0 };
  const invoice = round2(revenueEur * fx.quoteRate);
  const collectedEur = round2(invoice / (choice === "divisa_cubierta" ? fx.forwardRate : fx.collectionRate));
  return { invoice, collectedEur, difference: round2(revenueEur - collectedEur) };
}

export function fxCost(fx: FxSetup, revenueEur: number, choice: FxChoice): ExtraCost | null {
  if (choice === "eur") {
    const amount = round2(revenueEur * fx.buyerDiscountPct / 100);
    return { concept: "ajuste_comercial", label: `Descuento pedido por el comprador por asumir el riesgo de cambio (${fx.buyerDiscountPct} %)`, amount, payer: "vendedor", note: "Factura en euros: el riesgo de cambio lo asume el comprador y lo repercute en el precio (supuesto del caso)." };
  }
  const o = fxOutcome(fx, revenueEur, choice);
  const covered = choice === "divisa_cubierta";
  const rate = covered ? fx.forwardRate : fx.collectionRate;
  return {
    concept: "diferencia_cambio",
    label: covered ? `Seguro de cambio: cobro al tipo pactado a plazo (${fmtRate(fx, rate)})` : `Diferencia de cambio sin cobertura: cobro al tipo del día (${fmtRate(fx, rate)})`,
    amount: o.difference, payer: "vendedor",
    note: `Factura de ${o.invoice.toLocaleString("es-ES")} ${fx.currency} al tipo de la oferta (${fmtRate(fx, fx.quoteRate)}); se cobran ${o.collectedEur.toLocaleString("es-ES")} €. ${o.difference >= 0 ? "Importe positivo = pérdida." : "Importe negativo = ganancia."} Tipos simulados.`,
  };
}

export { fmtRate as fmtFxRate };
