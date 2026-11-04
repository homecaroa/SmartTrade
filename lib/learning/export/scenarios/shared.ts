import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { marketName } from "@/lib/config/catalog";
import type { Leg } from "../../logistics/types";
import { fmtEur } from "../../money";
import { computeOperation, incotermOf, routeOf, shipmentOf } from "../costs";
import { equipmentFor, surcharges } from "../../logistics/calculator";
import { mid } from "../../logistics/types";
import { fmtFxRate, fxCost, fxOutcome } from "../fx";
import type { Decision, DecisionCtx, FxChoice, FxSetup, Option } from "../types";

/** Ayudas comunes a los escenarios de exportación. */
export const productName = (hs6: string) => HS_CATALOG.find((e) => e.code === hs6)?.name ?? `HS ${hs6}`;
export const countryOf = (code: string) => marketName(code);
export const sellerCarries = (ctx: DecisionCtx) => !!ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).carriage === "vendedor";
export const sellerClearsExport = (ctx: DecisionCtx) => !!ctx.settings.incoterm && incotermOf(ctx.settings.incoterm).exportClearance === "vendedor";
/** Ruta del envío (la elegida o, si el transporte es del comprador, la estándar) y su medio principal. */
export const mainVehicles = (ctx: DecisionCtx) => routeOf(ctx.scenario, ctx.settings.transport).legs.filter((l) => l.role === "principal").map((l) => l.vehicle);
export const bySea = (ctx: DecisionCtx) => mainVehicles(ctx).includes("barco");
export const byAir = (ctx: DecisionCtx) => mainVehicles(ctx).includes("avion");
export const eur = fmtEur;

/** Opción con nota fija. */
export const opt = (id: string, label: string, grade: Option["grade"], feedback: Option["feedback"], cost?: Option["cost"]): Option => ({ id, label, grade, feedback, cost });

/** Tramo de una ruta didáctica. */
export const leg = (vehicle: Leg["vehicle"], from: string, to: string, days: [number, number], role: Leg["role"], pricing?: Leg["pricing"], note?: string): Leg =>
  ({ vehicle, from, to, days: { min: days[0], max: days[1] }, role, pricing, note });

/**
 * Etapa logística común: elegir ruta entre las alternativas (tabla con tramos, plazos, equipo y costes) y justificarla.
 * Solo se pregunta si el transporte principal lo contrata el vendedor; si no, lo organiza el comprador.
 */
export const routeDecisions = (prompt: string): Decision[] => [
  { id: "transport", stage: "logistica", kind: "route", title: "Ruta y modalidad de transporte", prompt, appliesIf: sellerCarries,
    concept: "Se compara coste logístico total, plazo de entrega (preparación + espera + tramos), transbordos y adecuación a la mercancía. La mejor opción es la más barata de las que llegan a tiempo, no la más barata a secas." },
  { id: "justificacion", stage: "logistica", kind: "justify", title: "Justificación de la ruta", appliesIf: sellerCarries,
    prompt: "Marca todos los motivos que sean ciertos para la ruta que has elegido. Se comprueban con los mismos datos de la tabla." },
  surchargeDecision,
];

/** Flete base y recargos de la ruta elegida, a valor central (los mismos que entran en la liquidación). */
export function freightBreakdown(ctx: DecisionCtx) {
  const sh = shipmentOf(ctx.scenario);
  const route = routeOf(ctx.scenario, ctx.settings.transport);
  const main = computeOperation(ctx.scenario, ctx.settings).quote.lines.find((l) => l.concept === "transporte_principal")!.range;
  const s = surcharges(sh, route, equipmentFor(sh, route), main);
  const c = (r: { min: number; max: number }) => Math.round(mid(r) * 100) / 100;
  return { base: c(main), fuel: c(s.fuel), fuelPct: s.fuelPct, peak: c(s.peak), total: c(main) + c(s.fuel) + c(s.peak) };
}

/**
 * Recargos del flete (propuesta 2, 04/11/2026): la cotización trae un flete base y recargos aparte. Pregunta de
 * conocimiento sin efecto económico propio: los recargos ya están en el presupuesto y en la liquidación.
 */
export const surchargeDecision: Decision = {
  id: "recargos", stage: "logistica", kind: "single", title: "Recargos del flete", appliesIf: sellerCarries,
  prompt: (ctx) => {
    const f = freightBreakdown(ctx);
    return `La cotización de tu ruta dice: flete base ${eur(f.base)}, más recargo de combustible del ${f.fuelPct.min}–${f.fuelPct.max} % (≈ ${eur(f.fuel)})${f.peak > 0 ? `, más recargo de temporada alta (≈ ${eur(f.peak)})` : ""}. ¿Qué importe presupuestas para el transporte principal?`;
  },
  concept: "Navieras, aerolíneas y transportistas cotizan un flete base y recargos aparte: combustible (BAF en barco), temporada alta (PSS), seguridad… Para comparar ofertas y fijar el precio hay que usar el total «todo incluido».",
  options: [
    opt("todo", "El flete base más todos los recargos de la cotización", "correcta", (ctx) => `Correcto: ${eur(freightBreakdown(ctx).total)} es lo que facturará el transportista.`),
    opt("base_combustible", "El flete base más el recargo de combustible", (ctx) => (freightBreakdown(ctx).peak > 0 ? "razonable" : "correcta"),
      (ctx) => { const f = freightBreakdown(ctx); return f.peak > 0 ? `Te falta el recargo de temporada alta: presupuestas ${eur(f.base + f.fuel)} y pagarás ${eur(f.total)}.` : `Correcto: en tu ruta no hay recargo de temporada alta; el total es ${eur(f.total)}.`; }),
    opt("base", "Solo el flete base: los recargos son orientativos", "grave", (ctx) => { const f = freightBreakdown(ctx); return `Los recargos se facturan siempre: presupuestarías ${eur(f.base)} y pagarás ${eur(f.total)} (${eur(f.total - f.base)} más).`; }),
  ],
  best: "todo", whyBest: "El coste del flete es el total con recargos; el flete base solo es una parte.",
};

/** Riesgo frente a propiedad: el Incoterm reparte costes, riesgos y trámites, pero no regula la propiedad. */
export const ownershipDecision: Decision = {
  id: "propiedad", stage: "contrato", kind: "single", title: "Riesgo y propiedad",
  prompt: (ctx) => `Con ${ctx.settings.incoterm ?? "la regla elegida"}, ¿cuándo pasa la PROPIEDAD de la mercancía al comprador?`,
  concept: "El Incoterm fija dónde se entrega, cuándo pasa el RIESGO y quién paga cada tramo. La propiedad la regulan el contrato de compraventa y la ley aplicable (por ejemplo, con reserva de dominio hasta el pago).",
  options: [
    opt("contrato", "Lo regulan el contrato de compraventa y la ley aplicable, no el Incoterm", "correcta", "Correcto: riesgo y propiedad son cosas distintas. Si quieres conservar la propiedad hasta cobrar, pacta una reserva de dominio en el contrato."),
    opt("con_riesgo", "En el mismo momento que el riesgo", "grave", "Es un error frecuente: el Incoterm solo regula el riesgo; la propiedad puede pasar antes o después según el contrato."),
    opt("al_pagar", "Cuando el comprador paga, porque así lo fija el Incoterm", "grave", "El Incoterm no regula el pago ni la propiedad: eso se pacta en el contrato."),
  ],
  best: "contrato", whyBest: "El Incoterm no transmite la propiedad: se pacta en el contrato.",
};

/**
 * Divisa de facturación (solo en casos con `fx`). El comprador pide factura en su moneda; el cobro llega semanas
 * después. Se califica la gestión del riesgo, no la suerte: dejar la posición abierta con un margen estrecho es
 * especular, aunque en otro escenario el tipo pudiera moverse a favor.
 */
export function currencyDecision(fx: FxSetup): Decision {
  const revenue = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;
  const cost = (c: FxChoice) => (ctx: DecisionCtx) => fxCost(fx, revenue(ctx), c);
  const result = (ctx: DecisionCtx, c: FxChoice) => { const o = fxOutcome(fx, revenue(ctx), c); return `Factura de ${o.invoice.toLocaleString("es-ES")} ${fx.currency}; cobras ${eur(o.collectedEur)} frente a ${eur(revenue(ctx))} previstos.`; };
  return {
    id: "currency", stage: "contrato", kind: "single", title: "Divisa de facturación",
    prompt: (ctx) => `El importador pide la factura en ${fx.currency}. Cobrarás dentro de unas semanas. Hoy el tipo es ${fmtFxRate(fx, fx.quoteRate)} y tu banco te ofrece un seguro de cambio a ${fmtFxRate(fx, fx.forwardRate)}. Tu margen objetivo es del ${ctx.scenario.targetMarginPct} %. ¿Cómo facturas?`,
    concept: "El riesgo de cambio aparece cuando cobras en una moneda distinta de la tuya: si el euro se aprecia antes del cobro, recibes menos euros. El seguro de cambio fija hoy el tipo al que venderás la divisa en la fecha de cobro; su tipo a plazo depende de la diferencia de tipos de interés entre las dos monedas.",
    options: [
      opt("divisa_cubierta", `Factura en ${fx.currency} con seguro de cambio`, "correcta", (ctx) => `Das al cliente lo que pide y fijas hoy los euros que cobrarás. ${result(ctx, "divisa_cubierta")}`, cost("divisa_cubierta")),
      opt("eur", "Factura en euros", "razonable", `Sin riesgo de cambio para ti, pero lo asume el importador, que pide un descuento del ${fx.buyerDiscountPct} % y puede preferir a un competidor que facture en su moneda.`, cost("eur")),
      opt("divisa", `Factura en ${fx.currency} sin cubrir el riesgo`, "grave", (ctx) => `Dejas abierta la posición: es especular con el margen de la operación. En este caso el euro se apreció hasta ${fmtFxRate(fx, fx.collectionRate)}. ${result(ctx, "divisa")}`, cost("divisa")),
    ],
    best: "divisa_cubierta", whyBest: "Facturar en la moneda del cliente ayuda a vender; cubrir el riesgo protege el margen. La cobertura se decide al ofertar, no al cobrar.",
  };
}
