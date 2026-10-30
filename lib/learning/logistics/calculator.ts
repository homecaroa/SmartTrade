import { MARKETS } from "@/lib/config/catalog";
import type { Party } from "@/lib/logistics/incoterms";
import { round2 } from "../money";
import { ESTIMACION, type Provenance } from "../provenance";
import { CONCEPT_LABEL, payerOf, type LogisticsConcept } from "./allocation";
import { airChargeableKg, containersNeeded, lclRevenueTons, roadChargeableKg, trucksNeeded } from "./capacity";
import { CAPACITY, RATES } from "./params";
import { addR, mid, mulR, ZERO, type Leg, type Range, type RouteOption, type Shipment } from "./types";

/**
 * Presupuesto logístico de una ruta. Cada concepto aparece UNA vez, con un rango (mínimo–máximo) y quién lo paga según
 * el Incoterm (allocation.ts). Logística, aranceles e impuestos se presentan por separado; el IVA de importación
 * recuperable NO se suma como coste. Fórmulas principales:
 *   coste logístico total = suma de conceptos logísticos (los dos pagadores)
 *   coste por kg / t / palé / unidad = coste logístico total / peso bruto (kg o t) / palés / unidades
 *   % logístico = coste logístico total / valor de la mercancía × 100
 *   valor en aduana ≈ mercancía + transporte principal + seguro; arancel = tipo × valor en aduana;
 *   impuesto de importación = tipo × (valor en aduana + arancel)
 *   coste puesto en destino por unidad = (valor + logística + aranceles e impuestos no recuperables) / unidades
 * El valor central de cada rango es el punto medio: sirve para comparar rutas y para la liquidación de la operación
 * (rotulado como tal), nunca como cifra exacta.
 */
/** Conceptos logísticos del presupuesto (aranceles e impuestos van aparte, en `taxes`). */
export type QuoteConcept = Exclude<LogisticsConcept, "aranceles" | "iva_importacion">;
export interface QuoteLine { concept: QuoteConcept; label: string; range: Range; payer: Party; note: string; prov: Provenance }
export interface Equipment { description: string; chargeable: string; units: number }

export interface QuoteOptions {
  /** Incluir el seguro de la mercancía (en la operación: obligatorio en CIF/CIP o decisión del vendedor en reglas D). */
  insurance?: boolean;
  /** Origen preferencial acreditado: arancel preferencial; si no, el general. */
  originProof?: boolean;
  /** ¿Está el vendedor registrado a efectos de IVA en destino? Decide si en DDP recupera el impuesto. */
  sellerVatRegistered?: boolean;
}

export interface Quote {
  routeId: string;
  incoterm: string;
  equipment: Equipment;
  lines: QuoteLine[];
  logistics: { total: Range; seller: Range; buyer: Range };
  taxes: { customsValue: Range; dutyPct: number; preferential: boolean; duty: Range; vatPct: number | null; vat: Range; vatRecoverable: boolean; payer: Party } | null;
  transitDays: Range;
  deliveryDays: Range;
  perKg: Range; perTonne: Range; perPallet: Range; perUnit: Range;
  logisticsPct: Range;
  deliveredCostPerUnit: Range;
}

export const isEuShipment = (s: Shipment) => MARKETS.find((m) => m.code === s.market)?.eu === true;
const roundR = (r: Range): Range => ({ min: round2(r.min), max: round2(r.max) });
const sumR = (rs: Range[]) => rs.reduce(addR, ZERO);
const fixed = (v: number): Range => ({ min: v, max: v });

function truckJourney(km: number, trucks: number): Range {
  return mulR(addR(RATES.truckFixed, mulR(RATES.truckPerKm, km)), trucks);
}

/** Equipo y unidades de cobro de la modalidad, para el transporte principal y las terminales. */
export function equipmentFor(s: Shipment, route: RouteOption): Equipment {
  const cg = s.cargo;
  switch (route.modality) {
    case "aereo": return { description: "carga aérea", chargeable: `${airChargeableKg(cg).toLocaleString("es-ES")} kg tasables (real ${cg.grossKg.toLocaleString("es-ES")} kg; volumétrico ${Math.round(cg.volumeM3 * 166.67).toLocaleString("es-ES")} kg)`, units: airChargeableKg(cg) };
    case "maritimo_lcl": return { description: "grupaje marítimo", chargeable: `${lclRevenueTons(cg).toLocaleString("es-ES")} toneladas-volumen (W/M)`, units: lclRevenueTons(cg) };
    case "maritimo_fcl": case "ferroviario": {
      const size = fclSize(s, route);
      const n = containersNeeded(cg, size);
      return { description: `${n} × ${size === "20" ? CAPACITY.container20.label : CAPACITY.container40.label}`, chargeable: `${n} contenedor(es)`, units: n };
    }
    default: {
      const grupaje = route.legs.some((l) => l.pricing?.kind === "grupaje_carretera");
      if (grupaje) return { description: "grupaje por carretera", chargeable: `${roadChargeableKg(cg).toLocaleString("es-ES")} kg tasables`, units: roadChargeableKg(cg) };
      const n = trucksNeeded(cg);
      return { description: `${n} × ${CAPACITY.truck.label}`, chargeable: `${n} camión(es)`, units: n };
    }
  }
}

/** 20' o 40': el equipo más barato para el volumen y el peso (en tren se usan contenedores de 40'). */
function fclSize(s: Shipment, route: RouteOption): "20" | "40" {
  const p = route.legs.find((l) => l.pricing?.kind === "fcl")?.pricing;
  if (!p || p.kind !== "fcl") return "40";
  const cost20 = mid(p.per20) * containersNeeded(s.cargo, "20");
  const cost40 = mid(p.per40) * containersNeeded(s.cargo, "40");
  return cost20 <= cost40 ? "20" : "40";
}

function legCost(s: Shipment, route: RouteOption, leg: Leg): Range {
  const cg = s.cargo;
  const p = leg.pricing;
  if (!p) return ZERO;
  switch (p.kind) {
    case "camion_completo": return truckJourney(p.km, trucksNeeded(cg));
    case "grupaje_carretera": return mulR(p.ratePer100Kg, roadChargeableKg(cg) / 100);
    case "ferry": return mulR(p.perTruck, trucksNeeded(cg));
    case "fcl": { const z = fclSize(s, route); return mulR(z === "20" ? p.per20 : p.per40, containersNeeded(cg, z)); }
    case "lcl": return mulR(p.perRevenueTon, lclRevenueTons(cg));
    case "aereo": return mulR(p.perChargeableKg, airChargeableKg(cg));
    case "tren": return mulR(p.perContainer40, containersNeeded(cg, "40"));
  }
}

/** Recogida o última milla sin tarifa propia: vehículo pequeño hasta 4 palés; si no, camiones completos. */
function shortHaul(s: Shipment, leg: Leg | undefined, small: Range, truck: Range): Range {
  if (!leg) return ZERO;
  if (leg.pricing) return ZERO; // se cotiza en legCost
  return s.cargo.pallets <= RATES.smallLoadMaxPallets ? small : mulR(truck, trucksNeeded(s.cargo));
}

export function transitDays(route: RouteOption): Range {
  return route.legs.reduce((acc, l) => addR(acc, l.days), route.waitDays);
}

export function computeQuote(s: Shipment, route: RouteOption, incoterm: string, opts: QuoteOptions = {}): Quote {
  const { insurance = true, originProof = true, sellerVatRegistered = false } = opts;
  const eu = isEuShipment(s);
  const eq = equipmentFor(s, route);
  const lines: QuoteLine[] = [];
  const add = (concept: QuoteConcept, range: Range, note: string) => {
    if (range.max <= 0) return;
    lines.push({ concept, label: CONCEPT_LABEL[concept], range: roundR(range), payer: payerOf(concept, incoterm), note, prov: ESTIMACION });
  };
  const pickupLegs = route.legs.filter((l) => l.role === "recogida");
  const mainLegs = route.legs.filter((l) => l.role === "principal");
  const lastLegs = route.legs.filter((l) => l.role === "ultima_milla");

  add("recogida", addR(sumR(pickupLegs.map((l) => legCost(s, route, l))), shortHaul(s, pickupLegs[0], RATES.pickupSmall, RATES.pickupTruck)),
    pickupLegs.length ? `${pickupLegs.map((l) => `${l.from} → ${l.to}`).join("; ")}.` : "Puerta a puerta: incluido en el transporte principal.");
  const termUnits = route.terminal.kind === "por_contenedor" ? eq.units : route.terminal.kind === "por_tonelada_volumen" ? lclRevenueTons(s.cargo)
    : route.terminal.kind === "por_kg_tasable" ? airChargeableKg(s.cargo) : route.terminal.kind === "por_palet" ? s.cargo.pallets : trucksNeeded(s.cargo);
  add("terminal_origen", mulR(route.terminal.origin, termUnits), "Carga, estiba y tasas de la terminal de salida.");
  if (!eu) add("despacho_exportacion", RATES.customsExport, "Agente de aduanas en España (DUA de exportación).");
  const main = sumR(mainLegs.map((l) => legCost(s, route, l)));
  add("transporte_principal", main, `${mainLegs.map((l) => `${l.from} → ${l.to}`).join("; ")} · ${eq.chargeable}.`);
  if (route.transshipments.length && route.transshipmentCost)
    add("transbordos", mulR(route.transshipmentCost, eq.units * route.transshipments.length), `Transbordo en ${route.transshipments.join(", ")}.`);
  const insuranceCost = mulR(RATES.insurancePct, (s.cargo.valueEur * 1.1) / 100);
  if (insurance) add("seguro", insuranceCost, "Prima sobre el 110 % del valor de la mercancía (práctica habitual).");
  add("terminal_destino", mulR(route.terminal.destination, termUnits), "Descarga y tasas de la terminal de llegada.");
  add("gastos_destino", route.destinationCharges, "Documentación y entrega de la mercancía por la naviera, aerolínea o transportista.");
  if (!eu) add("despacho_importacion", RATES.customsImport, "Agente de aduanas en destino.");
  add("ultima_milla", addR(sumR(lastLegs.map((l) => legCost(s, route, l))), shortHaul(s, lastLegs[0], RATES.lastMileSmall, RATES.lastMileTruck)),
    lastLegs.length ? `${lastLegs.map((l) => `${l.from} → ${l.to}`).join("; ")}${incoterm === "DPU" ? " (incluye la descarga, que en DPU es del vendedor)" : ""}.` : "Puerta a puerta: incluido en el transporte principal.");

  let taxes: Quote["taxes"] = null;
  if (!eu && s.duty) {
    // El valor en aduana incluye el seguro aunque nadie lo contrate: la aduana lo estima igualmente (simplificación).
    const customsValue = addR(addR(fixed(s.cargo.valueEur), main), insuranceCost);
    const dutyPct = originProof ? s.duty.preferential : s.duty.general;
    const duty = mulR(customsValue, dutyPct / 100);
    const vat = mulR(addR(customsValue, duty), (s.importVatPct ?? 0) / 100);
    const payer = payerOf("iva_importacion", incoterm);
    taxes = { customsValue: roundR(customsValue), dutyPct, preferential: originProof && s.duty.preferential < s.duty.general, duty: roundR(duty), vatPct: s.importVatPct, vat: roundR(vat), vatRecoverable: payer === "comprador" || sellerVatRegistered, payer };
  }
  const logistic = (who?: Party) => sumR(lines.filter((l) => !who || l.payer === who).map((l) => l.range));
  const total = roundR(logistic());
  const nonRecoverableTaxes = taxes ? addR(taxes.duty, taxes.vatRecoverable ? ZERO : taxes.vat) : ZERO;
  const cg = s.cargo;
  const transit = transitDays(route);
  return {
    routeId: route.id, incoterm, equipment: eq, lines, taxes,
    logistics: { total, seller: roundR(logistic("vendedor")), buyer: roundR(logistic("comprador")) },
    transitDays: transit,
    deliveryDays: addR(transit, fixed(s.prepDays)),
    perKg: roundR(mulR(total, 1 / cg.grossKg)), perTonne: roundR(mulR(total, 1000 / cg.grossKg)), perPallet: roundR(mulR(total, 1 / cg.pallets)), perUnit: roundR(mulR(total, 1 / cg.units)),
    logisticsPct: roundR(mulR(total, 100 / cg.valueEur)),
    deliveredCostPerUnit: roundR(mulR(addR(addR(fixed(cg.valueEur), total), nonRecoverableTaxes), 1 / cg.units)),
  };
}
