import { INCOTERMS, type Incoterm } from "@/lib/logistics/incoterms";
import { MARKETS } from "@/lib/config/catalog";
import { round2, sum } from "../money";
import { ESTIMACION, SUPUESTO, type Provenance } from "../provenance";
import { paymentTerm } from "../payments";
import type { ExportScenario, ExtraCost, Party, Settings } from "./types";

/**
 * Cálculo económico de la operación. Reglas:
 * - Cada concepto aparece UNA vez y lo paga UNA parte, según el Incoterm (tabla de /logistica): así no se cuenta dos veces.
 * - El IVA de importación recuperable NO es coste: se muestra aparte. Solo cuenta como coste si quien lo paga no puede
 *   recuperarlo (vendedor en DDP sin registro de IVA en destino).
 * - Todos los importes son SIMULADOS (supuestos o estimaciones didácticas), nunca tarifas oficiales.
 */
export type CostConcept = "embalaje" | "carga" | "despacho_exportacion" | "transporte" | "seguro" | "despacho_importacion" | "arancel" | "iva_importacion" | "descarga" | "medio_pago" | "incidencia" | "ajuste_comercial";

export interface CostLine { concept: CostConcept; label: string; amount: number; payer: Party; prov: Provenance; note: string }

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

interface LineInput { incoterm: Incoterm; transport: string; packing: string; insurance: boolean; originProof: boolean }

function logisticLines(sc: ExportScenario, x: LineInput): { lines: CostLine[]; customsValue: number | null; vat: OperationResult["vat"] } {
  const eu = isEu(sc);
  const t = sc.transport.find((o) => o.id === x.transport) ?? sc.transport[0];
  const p = sc.packing.find((o) => o.id === x.packing) ?? sc.packing[0];
  const lines: CostLine[] = [];
  const add = (concept: CostConcept, label: string, amount: number, payer: Party, note: string, prov: Provenance = SUPUESTO) => { if (amount > 0) lines.push({ concept, label, amount: round2(amount), payer, prov, note }); };

  add("embalaje", `Embalaje: ${p.label}`, p.cost, "vendedor", "Preparar la mercancía para el viaje es siempre del vendedor.");
  add("carga", "Carga en origen", sc.fees.loading, x.incoterm.code === "EXW" ? "comprador" : "vendedor", x.incoterm.code === "EXW" ? "En EXW el vendedor ni siquiera carga." : "El vendedor carga la mercancía en sus instalaciones.");
  if (!eu) add("despacho_exportacion", "Despacho de exportación (agente de aduanas)", sc.fees.exportClearance, x.incoterm.exportClearance, `Según ${x.incoterm.code}, despacha la exportación el ${x.incoterm.exportClearance}.`);
  add("transporte", `Transporte principal: ${t.label}`, t.cost, x.incoterm.carriage, `Según ${x.incoterm.code}, contrata y paga el transporte principal el ${x.incoterm.carriage}.`);
  const insuranceAmount = round2((sc.fees.insuranceRatePct / 100) * exwValue(sc) * 1.1);
  if (sellerMustInsure(x.incoterm)) add("seguro", "Seguro de la mercancía (obligatorio en esta regla)", insuranceAmount, "vendedor", `${x.incoterm.code} obliga al vendedor a asegurar a favor del comprador. Se asegura el 110 % del valor (práctica habitual).`, ESTIMACION);
  else if (x.insurance && sellerBearsTransitRisk(x.incoterm)) add("seguro", "Seguro de la mercancía (decisión propia)", insuranceAmount, "vendedor", `En ${x.incoterm.code} el riesgo del viaje es del vendedor: asegurar es su decisión.`, ESTIMACION);

  let customsValue: number | null = null;
  let vat: OperationResult["vat"] = null;
  if (!eu && sc.duty) {
    add("despacho_importacion", "Despacho de importación (agente en destino)", sc.fees.importClearance, x.incoterm.importClearance, `Según ${x.incoterm.code}, despacha la importación el ${x.incoterm.importClearance}.`);
    customsValue = round2(exwValue(sc) + t.cost + insuranceAmount);
    const rate = x.originProof ? sc.duty.preferentialRatePct : sc.duty.generalRatePct;
    const duty = round2((rate / 100) * customsValue);
    add("arancel", `Arancel simulado (${rate} % sobre el valor en aduana${x.originProof ? ", con origen preferencial acreditado" : ", sin prueba de origen"})`, duty, x.incoterm.importClearance, "Valor en aduana aproximado = mercancía + transporte + seguro hasta destino. Tipo SIMULADO: el real se consulta en Access2Markets.", ESTIMACION);
    if (sc.importVatRatePct !== null) {
      const amount = round2((sc.importVatRatePct / 100) * (customsValue + duty));
      const payer = x.incoterm.importClearance;
      const recoverable = payer === "comprador" ? true : sc.sellerVatRegisteredAtDestination;
      vat = { amount, payer, recoverable, note: recoverable
        ? `Lo adelanta el ${payer} al importar y lo recupera en su declaración de impuestos: no es un coste definitivo. Tipo simulado (${sc.importVatRatePct} %).`
        : `Lo adelanta el vendedor y NO puede recuperarlo porque no está registrado a efectos de IVA en destino: se convierte en coste. Tipo simulado (${sc.importVatRatePct} %).` };
      if (!recoverable) add("iva_importacion", "IVA de importación no recuperable", amount, payer, vat.note, ESTIMACION);
    }
  }
  add("descarga", "Descarga en destino", sc.fees.unloading, x.incoterm.code === "DPU" ? "vendedor" : "comprador", x.incoterm.code === "DPU" ? "DPU es la única regla en que descarga el vendedor." : "La descarga en destino es del comprador.");
  return { lines, customsValue, vat };
}

/**
 * Escandallo: precio por unidad para un Incoterm = precio EXW + costes logísticos estándar que asume el vendedor en esa
 * regla, repartidos por unidad. Se calcula con las opciones estándar del escenario y con el origen acreditado.
 */
export function priceForIncoterm(sc: ExportScenario, code: string): number {
  const inc = incotermOf(code);
  const { lines } = logisticLines(sc, { incoterm: inc, transport: sc.standard.transport, packing: sc.standard.packing, insurance: sellerBearsTransitRisk(inc), originProof: true });
  const extra = sum(lines.filter((l) => l.payer === "vendedor" && l.concept !== "embalaje").map((l) => l.amount));
  return round2(sc.exwUnitPrice + extra / sc.quantity.units);
}

export function computeOperation(sc: ExportScenario, s: Settings, extras: ExtraCost[] = []): OperationResult {
  const incoterm = incotermOf(s.incoterm ?? sc.incoterms[0]);
  const originProof = !!sc.duty && (s.documents ?? []).includes(sc.duty.originProofDoc);
  const { lines, customsValue, vat } = logisticLines(sc, { incoterm, transport: s.transport ?? sc.standard.transport, packing: s.packing ?? sc.standard.packing, insurance: s.insurance === "si", originProof });
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
  return { incoterm, unitPrice, revenue, productCost, lines, sellerCosts, buyerCosts, margin, marginPct: revenue > 0 ? round2((margin / revenue) * 100) : 0, customsValue, vat, buyerLanded: round2(revenue + buyerCosts) };
}
