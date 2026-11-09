import { fmtEur, round2, sum } from "../money";
import type { ImportAnswers, ImportScenario, SupplierOffer } from "./types";

/**
 * Coste puesto en almacén de una importación desde fuera de la UE. Reglas (comprobadas en las fuentes el 09/11/2026):
 * - VALOR EN ADUANA (Código Aduanero de la Unión, Reglamento (UE) 952/2013, arts. 70-72): precio realmente pagado por
 *   la mercancía + transporte, seguro y gastos de carga y manipulación HASTA EL LUGAR DE ENTRADA en la UE + cánones que
 *   el comprador deba pagar como condición de venta. NO incluye el transporte después de la entrada, las comisiones de
 *   compra ni los derechos e impuestos de importación.
 * - Los aranceles (convencional y antidumping) se calculan sobre el valor en aduana. El antidumping de las bicicletas
 *   de China se aplica al «precio neto franco frontera de la Unión, no despachado de aduana» (Reglamento de Ejecución
 *   (UE) 2019/1379, art. 1.2), que aquí coincide con el valor en aduana.
 * - BASE DEL IVA a la importación (Ley 37/1992, art. 83): valor en aduana + derechos de importación + gastos accesorios
 *   (comisiones, embalaje, transporte, seguro) hasta el primer lugar de destino en la Comunidad, que es el que figure en
 *   el documento de transporte. El IVA es recuperable para el importador empresario: no es coste, salvo el financiero de
 *   adelantarlo si no se difiere (Reglamento del IVA, art. 74.1: IVA diferido para quien liquida por meses).
 * - Importes y tipos SIMULADOS salvo que la ficha diga otra cosa.
 */
export interface ImportLine { key: string; label: string; amount: number; note: string }

export interface ImportResult {
  supplier: SupplierOffer;
  incoterm: string;
  lines: ImportLine[];
  customsValue: number;
  duty: number;
  antidumping: number;
  vatBase: number;
  vat: number;
  vatDeferred: boolean;
  landed: number;
  landedUnit: number;
  revenue: number;
  margin: number;
  marginPct: number;
}

const one = (a: ImportAnswers, k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);

export const supplierOf = (sc: ImportScenario, a: ImportAnswers): SupplierOffer =>
  sc.suppliers.find((s) => s.id === one(a, "proveedor")) ?? sc.suppliers[0];

/** Comisión bancaria del medio de pago, a cargo del importador (estimación didáctica). */
export const PAYMENT_FEE_PCT: Record<string, number> = { carta_credito: 0.8, cobro_documentario: 0.3, anticipo_30_70: 0, anticipado: 0 };

export function computeImport(sc: ImportScenario, a: ImportAnswers, extras: { label: string; amount: number; note: string }[] = []): ImportResult {
  const s = supplierOf(sc, a);
  const r = sc.rates;
  const units = sc.quantity.units;
  const incoterm = one(a, "incoterm") ?? "FOB";
  const goods = round2(s.fobUnit * units);
  const markup = 1 + r.supplierFreightMarkupPct / 100;
  const insuranceOn = (value: number, pct: number) => round2(value * 1.1 * pct / 100);
  const lines: ImportLine[] = [];
  const add = (key: string, label: string, amount: number, note: string) => { if (amount > 0) lines.push({ key, label, amount: round2(amount), note }); };

  // Lo que se paga al proveedor y lo que contrata el importador, según el Incoterm.
  let freightToEu = 0;
  let insuranceToEu = 0;
  let postEntryInPrice = 0;
  if (incoterm === "FOB") {
    add("compra", `Compra FOB ${s.port}`, goods, `${units} × ${s.fobUnit} €.`);
    freightToEu = s.freight;
    add("flete", `Flete marítimo ${s.port} → Valencia`, s.freight, "Lo contratas tú con tu transitario.");
    const ins = one(a, "seguro");
    if (ins === "a" || ins === "c") {
      insuranceToEu = insuranceOn(goods + s.freight, ins === "a" ? r.insuranceA : r.insuranceC);
      add("seguro", `Seguro del transporte principal (cláusulas ${ins.toUpperCase()})`, insuranceToEu, "Prima sobre el 110 % del valor CIF.");
    }
    add("descarga", "Descarga y manipulación en el puerto de Valencia", sc.destinationHandling, "Gastos en el puerto de llegada.");
    add("transporte_interior", "Transporte del puerto al almacén", sc.inlandTransport, "Camión hasta tu almacén.");
  } else if (incoterm === "CIF") {
    freightToEu = round2(s.freight * markup);
    insuranceToEu = insuranceOn(goods + freightToEu, r.insuranceC);
    add("compra", `Compra CIF Valencia (incluye flete y seguro mínimo del proveedor)`, goods + freightToEu + insuranceToEu,
      `Mercancía ${goods} € + flete con el sobreprecio del proveedor + seguro con cláusulas (C), la cobertura mínima de CIF.`);
    add("descarga", "Descarga y manipulación en el puerto de Valencia", sc.destinationHandling, "En CIF, los gastos en destino son del comprador.");
    add("transporte_interior", "Transporte del puerto al almacén", sc.inlandTransport, "Camión hasta tu almacén.");
  } else {
    // DAP almacén: el proveedor contrata todo el transporte hasta el almacén; el despacho de importación sigue siendo tuyo.
    freightToEu = round2(s.freight * markup);
    postEntryInPrice = round2((sc.destinationHandling + sc.inlandTransport) * markup);
    add("compra", "Compra DAP almacén de Paterna (incluye todo el transporte)", goods + freightToEu + postEntryInPrice,
      "El proveedor organiza el transporte hasta tu almacén y lo repercute con su sobreprecio; el despacho y los impuestos de importación siguen siendo tuyos.");
  }

  const royalty = round2(sc.royaltyUnit * units);
  add("canon", "Canon de licencia de la marca", royalty, "Lo pagas al titular de la marca como condición para que el proveedor te venda.");
  add("comision", "Comisión de tu agente de compras", goods * sc.buyingCommissionPct / 100, `${sc.buyingCommissionPct} % del precio FOB.`);
  const broker = one(a, "representacion") === "indirecta" ? sc.customsBrokerIndirect : sc.customsBrokerDirect;
  add("despacho", "Agente de aduanas (DUA de importación)", broker, one(a, "representacion") === "indirecta" ? "Representación indirecta: el agente responde contigo de la deuda y cobra más." : "Representación directa.");
  const feePct = PAYMENT_FEE_PCT[one(a, "pago") ?? ""] ?? 0;
  add("medio_pago", "Comisiones del medio de pago", goods * feePct / 100, `${feePct.toLocaleString("es-ES")} % del importe (estimación didáctica).`);

  const customsValue = round2(goods + freightToEu + insuranceToEu + royalty);
  const duty = round2(customsValue * r.conventionalDutyPct / 100);
  const antidumping = s.antidumping ? round2(customsValue * r.antidumpingPct / 100) : 0;
  add("arancel", `Arancel (${r.conventionalDutyPct} % del valor en aduana)`, duty, "Tipo simulado.");
  add("antidumping", `Derecho antidumping (${r.antidumpingPct} % del valor en aduana)`, antidumping, "Se aplica por el origen chino de las bicicletas o por enviarse desde un país al que se extendió la medida.");

  const postEntry = incoterm === "DAP" ? postEntryInPrice : sc.destinationHandling + sc.inlandTransport;
  const vatBase = round2(customsValue + duty + antidumping + postEntry);
  const vat = round2(vatBase * r.vatPct / 100);
  const vatDeferred = one(a, "iva_pago") === "diferido";
  if (!vatDeferred) add("iva_financiero", "Coste financiero de adelantar el IVA", vat * sc.vatAdvance.annualRatePct / 100 * sc.vatAdvance.days / 365,
    `El IVA (${fmtEur(vat)}) se paga al despachar y se recupera en la declaración: ${sc.vatAdvance.days} días a un ${sc.vatAdvance.annualRatePct} % anual (estimación).`);
  for (const e of extras) add("extra", e.label, e.amount, e.note);

  const landed = sum(lines.map((l) => l.amount));
  const revenue = round2(sc.resaleUnitPrice * units);
  const margin = round2(revenue - landed);
  return { supplier: s, incoterm, lines, customsValue, duty, antidumping, vatBase, vat, vatDeferred, landed, landedUnit: round2(landed / units), revenue, margin, marginPct: round2(margin / revenue * 100) };
}

/** Coste puesto en almacén por unidad de una oferta, con las decisiones estándar (FOB, cláusulas A, representación directa, IVA diferido). */
export function landedUnitFor(sc: ImportScenario, supplierId: string): number {
  return computeImport(sc, { proveedor: supplierId, incoterm: "FOB", seguro: "a", representacion: "directa", iva_pago: "diferido", pago: "carta_credito" }).landedUnit;
}
