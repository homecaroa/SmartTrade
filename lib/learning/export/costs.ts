import { INCOTERMS, type Incoterm } from "@/lib/logistics/incoterms";
import { MARKETS } from "@/lib/config/catalog";
import { round2, sum } from "../money";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import type { LogisticsConcept } from "../logistics/allocation";
import { computeQuote, type Quote } from "../logistics/calculator";
import { fmtRangeEur } from "../logistics/format";
import { mid, type Range, type RouteOption, type Shipment } from "../logistics/types";
import { ESTIMACION, SUPUESTO, type Provenance } from "../provenance";
import { paymentTerm } from "../payments";
import type { ExportScenario, ExtraCost, Party, Settings } from "./types";

/**
 * Cálculo económico de la operación. Reglas:
 * - Cada concepto aparece UNA vez y lo paga UNA parte, según el Incoterm (tabla de /logistica): así no se cuenta dos veces.
 * - El IVA de importación recuperable NO es coste: se muestra aparte. Solo cuenta como coste si quien lo paga no puede
 *   recuperarlo (vendedor en DDP sin registro de IVA en destino).
 * - Todos los importes son SIMULADOS (supuestos o estimaciones didácticas), nunca tarifas oficiales.
 * - La logística (fletes, terminales, despachos, seguro, aranceles) sale del presupuesto de lib/learning/logistics, que
 *   trabaja en rangos; la liquidación usa el valor central de cada rango y lo dice en la nota. Antes (hasta el
 *   30/10/2026) cada caso tenía su propia lista de transportes con un coste exacto: había dos modelos de transporte que
 *   podían contradecirse y se unificaron en uno.
 */
export type CostConcept = "embalaje" | Exclude<LogisticsConcept, "aranceles"> | "arancel" | "medio_pago" | "incidencia" | "ajuste_comercial";

/** `range`: estimación de la que sale el importe (se liquida con su valor central). */
export interface CostLine { concept: CostConcept; label: string; amount: number; payer: Party; prov: Provenance; note: string; range?: Range }

export interface OperationResult {
  incoterm: Incoterm;
  unitPrice: number;
  revenue: number;
  productCost: number;
  lines: CostLine[];
  sellerCosts: number;
  buyerCosts: number;
  margin: number;
  marginPct: number;
  customsValue: number | null;
  vat: { amount: number; payer: Party; recoverable: boolean; note: string } | null;
  /** Coste total para el comprador hasta su almacén (precio + lo que paga él), sin IVA recuperable. */
  buyerLanded: number;
  /** Presupuesto logístico de la ruta usada, en rangos (el detalle que la liquidación resume con valores centrales). */
  quote: Quote;
}

export const isEu = (sc: ExportScenario) => MARKETS.find((m) => m.code === sc.destination)?.eu === true;

export function incotermOf(code: string): Incoterm {
  const i = INCOTERMS.find((x) => x.code === code);
  if (!i) throw new Error(`Incoterm desconocido: ${code}`);
  return i;
}

/** ¿El vendedor está obligado a asegurar (CIF/CIP)? */
export const sellerMustInsure = (i: Incoterm) => i.insurance !== "no obligatorio";
/** ¿El riesgo del transporte principal es del vendedor (reglas D)? */
export const sellerBearsTransitRisk = (i: Incoterm) => ["DAP", "DPU", "DDP"].includes(i.code);

const exwValue = (sc: ExportScenario) => round2(sc.exwUnitPrice * sc.quantity.units);

/** El envío del caso para el motor logístico: la carga física del caso con su valor EXW y sus tipos simulados. */
export function shipmentOf(sc: ExportScenario): Shipment {
  const L = sc.logistics;
  return {
    origin: L.origin, destination: L.destinationPlace, market: sc.destination,
    cargo: { ...L.cargo, product: HS_CATALOG.find((e) => e.code === sc.hs6)?.name ?? `HS ${sc.hs6}`, hs6: sc.hs6, units: sc.quantity.units, unit: sc.quantity.unit, valueEur: exwValue(sc) },
    deadlineDays: sc.deadlineDays, prepDays: sc.prepDays, routes: L.routes, infeasible: L.infeasible, geographyNote: L.geographyNote, decisiveReason: L.decisiveReason,
    duty: sc.duty ? { general: sc.duty.generalRatePct, preferential: sc.duty.preferentialRatePct } : null,
    importVatPct: sc.importVatRatePct,
  };
}

/** Ruta elegida o, si no se eligió (transporte del comprador), la estándar del caso. */
export const routeOf = (sc: ExportScenario, id?: string): RouteOption =>
  sc.logistics.routes.find((r) => r.id === id) ?? sc.logistics.routes.find((r) => r.id === sc.standard.transport)!;

interface LineInput { incoterm: Incoterm; transport?: string; packing: string; insurance: boolean; originProof: boolean }

/**
 * Líneas de coste de la operación a partir del presupuesto logístico (computeQuote): cada concepto se liquida con el
 * VALOR CENTRAL de su rango y lo indica en la nota. El seguro solo se incluye si la regla obliga (CIF/CIP) o si el
 * vendedor decidió asegurar un riesgo que es suyo (reglas D).
 */
function logisticLines(sc: ExportScenario, x: LineInput): { lines: CostLine[]; customsValue: number | null; vat: OperationResult["vat"]; quote: Quote } {
  const p = sc.packing.find((o) => o.id === x.packing) ?? sc.packing[0];
  const quote = computeQuote(shipmentOf(sc), routeOf(sc, x.transport), x.incoterm.code, { insurance: x.insurance, originProof: x.originProof, sellerVatRegistered: sc.sellerVatRegisteredAtDestination });
  const lines: CostLine[] = [];
  const central = (r: Range) => round2(mid(r));
  const add = (l: Omit<CostLine, "amount">, amount: number) => { if (amount > 0) lines.push({ ...l, amount: round2(amount) }); };

  add({ concept: "embalaje", label: `Embalaje: ${p.label}`, payer: "vendedor", prov: SUPUESTO, note: "Preparar la mercancía para el viaje es siempre del vendedor." }, p.cost);
  for (const l of quote.lines) {
    const label = l.concept === "seguro" ? (sellerMustInsure(x.incoterm) ? "Seguro de la mercancía (obligatorio en esta regla)" : "Seguro de la mercancía (decisión propia)") : l.label;
    add({ concept: l.concept, label, payer: l.payer, prov: l.prov, range: l.range, note: `${l.note} Valor central de la estimación ${fmtRangeEur(l.range)}.` }, central(l.range));
  }
  let customsValue: number | null = null;
  let vat: OperationResult["vat"] = null;
  const t = quote.taxes;
  if (t) {
    customsValue = central(t.customsValue);
    add({ concept: "arancel", label: `Arancel simulado (${t.dutyPct} % sobre el valor en aduana${sc.duty && sc.duty.generalRatePct === sc.duty.preferentialRatePct ? ", sin acuerdo preferencial" : x.originProof ? ", con origen preferencial acreditado" : ", sin prueba de origen"})`, payer: t.payer, prov: ESTIMACION, range: t.duty,
      note: `Valor en aduana aproximado = mercancía + transporte principal + seguro (${fmtRangeEur(t.customsValue)}). Tipo SIMULADO: el real se consulta en Access2Markets.` }, central(t.duty));
    if (t.vatPct !== null) {
      const amount = central(t.vat);
      vat = { amount, payer: t.payer, recoverable: t.vatRecoverable, note: t.vatRecoverable
        ? `Lo adelanta el ${t.payer} al importar y lo recupera en su declaración de impuestos: no es un coste definitivo. Tipo simulado (${t.vatPct} %).`
        : `Lo adelanta el vendedor y NO puede recuperarlo porque no está registrado a efectos de IVA en destino: se convierte en coste. Tipo simulado (${t.vatPct} %).` };
      if (!t.vatRecoverable) add({ concept: "iva_importacion", label: "IVA de importación no recuperable", payer: t.payer, prov: ESTIMACION, range: t.vat, note: vat.note }, amount);
    }
  }
  return { lines, customsValue, vat, quote };
}

/**
 * Escandallo: precio por unidad para un Incoterm = precio EXW + costes logísticos estándar que asume el vendedor en esa
 * regla, repartidos por unidad. Se calcula con las opciones estándar del escenario y con el origen acreditado.
 */
export function priceForIncoterm(sc: ExportScenario, code: string): number {
  const inc = incotermOf(code);
  const { lines } = logisticLines(sc, { incoterm: inc, transport: sc.standard.transport, packing: sc.standard.packing, insurance: sellerMustInsure(inc) || sellerBearsTransitRisk(inc), originProof: true });
  const extra = sum(lines.filter((l) => l.payer === "vendedor" && l.concept !== "embalaje").map((l) => l.amount));
  return round2(sc.exwUnitPrice + extra / sc.quantity.units);
}

export function computeOperation(sc: ExportScenario, s: Settings, extras: ExtraCost[] = []): OperationResult {
  const incoterm = incotermOf(s.incoterm ?? sc.incoterms[0]);
  const originProof = !!sc.duty && (s.documents ?? []).includes(sc.duty.originProofDoc);
  const insurance = sellerMustInsure(incoterm) || (sellerBearsTransitRisk(incoterm) && s.insurance === "si");
  const { lines, customsValue, vat, quote } = logisticLines(sc, { incoterm, transport: s.transport, packing: s.packing ?? sc.standard.packing, insurance, originProof });
  const unitPrice = priceForIncoterm(sc, incoterm.code);
  const revenue = round2(unitPrice * sc.quantity.units);
  if (s.payment) {
    const term = paymentTerm(s.payment);
    if (term.feePct > 0) lines.push({ concept: "medio_pago", label: `Coste del medio de cobro: ${term.label}`, amount: round2(term.feePct * revenue), payer: "vendedor", prov: ESTIMACION, note: "Comisión bancaria o prima del seguro de crédito (estimación didáctica)." });
  }
  for (const e of extras) if (e.amount !== 0) lines.push({ concept: e.concept, label: e.label, amount: round2(e.amount), payer: e.payer, prov: SUPUESTO, note: e.note });
  const productCost = round2(sc.unitCost * sc.quantity.units);
  const sellerCosts = sum(lines.filter((l) => l.payer === "vendedor").map((l) => l.amount));
  const buyerCosts = sum(lines.filter((l) => l.payer === "comprador").map((l) => l.amount));
  const margin = round2(revenue - productCost - sellerCosts);
  return { incoterm, unitPrice, revenue, productCost, lines, sellerCosts, buyerCosts, margin, marginPct: revenue > 0 ? round2((margin / revenue) * 100) : 0, customsValue, vat, buyerLanded: round2(revenue + buyerCosts), quote };
}
