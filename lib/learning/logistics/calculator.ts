import { MARKETS } from "@/lib/config/catalog";
import type { Party } from "@/lib/logistics/incoterms";
import { round2 } from "../money";
import { ESTIMACION, SUPUESTO, type Provenance } from "../provenance";
import { CONCEPT_LABEL, payerOf, type LogisticsConcept } from "./allocation";
import { airChargeableKg, containersNeeded, lclRevenueTons, roadChargeableKg, trucksNeeded } from "./capacity";
import { CAPACITY, RATES } from "./params";
import { addR, mid, mulR, R, ZERO, type Leg, type LogisticsCase, type Range, type RouteOption } from "./types";

/**
 * Presupuesto logístico de una ruta. Cada concepto aparece UNA vez, con un rango (mínimo–máximo) y quién lo paga según
 * el Incoterm (allocation.ts). Logística, aranceles e impuestos se presentan por separado; el IVA de importación
 * recuperable NO se suma como coste. Fórmulas principales:
 *   coste logístico total = suma de conceptos logísticos (los dos pagadores)
 *   coste por kg / t / palé / unidad = coste logístico total / peso bruto (kg o t) / palés / unidades
 *   % logístico = coste logístico total / valor de la mercancía × 100
 *   coste por unidad entregada = (valor + logística + aranceles e impuestos no recuperables) / unidades
 *   margen del vendedor = precio pactado × unidades − coste de producto − costes que paga el vendedor
 * El valor central de cada rango es el punto medio: se usa para comparar, nunca como cifra exacta.
 */
export interface QuoteLine { concept: LogisticsConcept; label: string; range: Range; payer: Party; note: string; prov: Provenance }
export interface ExtraLine { label: string; amount: number; payer: Party; note: string }
export interface Equipment { description: string; chargeable: string; units: number }

export interface Quote {
  routeId: string;
  incoterm: string;
  equipment: Equipment;
  lines: QuoteLine[];
  extras: ExtraLine[];
  logistics: { total: Range; seller: Range; buyer: Range };
  taxes: { duty: Range; vat: Range; vatRecoverable: boolean; vatPayer: Party } | null;
  transitDays: Range;
  deliveryDays: Range;
  perKg: Range; perTonne: Range; perPallet: Range; perUnit: Range;
  logisticsPct: Range;
  deliveredCostPerUnit: Range;
  margin: Range;
  marginPct: number;
}

export const isEuCase = (c: LogisticsCase) => MARKETS.find((m) => m.code === c.market)?.eu === true;
const roundR = (r: Range): Range => ({ min: round2(r.min), max: round2(r.max) });
const sumR = (rs: Range[]) => rs.reduce(addR, ZERO);

function truckJourney(km: number, trucks: number): Range {
  return mulR(addR(RATES.truckFixed, mulR(RATES.truckPerKm, km)), trucks);
}

/** Equipo y unidades de cobro de la modalidad, para el transporte principal y las terminales. */
export function equipmentFor(c: LogisticsCase, route: RouteOption): Equipment {
  const cg = c.cargo;
  switch (route.modality) {
    case "aereo": return { description: "carga aérea", chargeable: `${airChargeableKg(cg).toLocaleString("es-ES")} kg tasables (real ${cg.grossKg.toLocaleString("es-ES")} kg; volumétrico ${Math.round(cg.volumeM3 * 166.67).toLocaleString("es-ES")} kg)`, units: airChargeableKg(cg) };
    case "maritimo_lcl": return { description: "grupaje marítimo", chargeable: `${lclRevenueTons(cg).toLocaleString("es-ES")} toneladas-volumen (W/M)`, units: lclRevenueTons(cg) };
    case "maritimo_fcl": case "ferroviario": {
      const size = fclSize(c, route);
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
function fclSize(c: LogisticsCase, route: RouteOption): "20" | "40" {
  const p = route.legs.find((l) => l.pricing?.kind === "fcl")?.pricing;
  if (!p || p.kind !== "fcl") return "40";
  const cost20 = mid(p.per20) * containersNeeded(c.cargo, "20");
  const cost40 = mid(p.per40) * containersNeeded(c.cargo, "40");
  return cost20 <= cost40 ? "20" : "40";
}

function legCost(c: LogisticsCase, route: RouteOption, leg: Leg): Range {
  const cg = c.cargo;
  const p = leg.pricing;
  if (!p) return ZERO;
  switch (p.kind) {
    case "camion_completo": return truckJourney(p.km, trucksNeeded(cg));
    case "grupaje_carretera": return mulR(p.ratePer100Kg, roadChargeableKg(cg) / 100);
    case "ferry": return mulR(p.perTruck, trucksNeeded(cg));
    case "fcl": { const s = fclSize(c, route); return mulR(s === "20" ? p.per20 : p.per40, containersNeeded(cg, s)); }
    case "lcl": return mulR(p.perRevenueTon, lclRevenueTons(cg));
    case "aereo": return mulR(p.perChargeableKg, airChargeableKg(cg));
    case "tren": return mulR(p.perContainer40, containersNeeded(cg, "40"));
  }
}

/** Recogida o última milla sin tarifa propia: vehículo pequeño hasta 4 palés; si no, camiones completos. */
function shortHaul(c: LogisticsCase, leg: Leg | undefined, small: Range, truck: Range): Range {
  if (!leg) return ZERO;
  if (leg.pricing) return ZERO; // se cotiza en legCost
  return c.cargo.pallets <= RATES.smallLoadMaxPallets ? small : mulR(truck, trucksNeeded(c.cargo));
}

export function transitDays(route: RouteOption): Range {
  return route.legs.reduce((acc, l) => addR(acc, l.days), route.waitDays);
}

export function computeQuote(c: LogisticsCase, route: RouteOption, incoterm: string, extras: ExtraLine[] = []): Quote {
  const eu = isEuCase(c);
  const eq = equipmentFor(c, route);
  const lines: QuoteLine[] = [];
  const add = (concept: LogisticsConcept, range: Range, note: string, prov: Provenance = ESTIMACION) => {
    if (range.max <= 0) return;
    lines.push({ concept, label: CONCEPT_LABEL[concept], range: roundR(range), payer: payerOf(concept, incoterm), note, prov });
  };
  const pickupLegs = route.legs.filter((l) => l.role === "recogida");
  const mainLegs = route.legs.filter((l) => l.role === "principal");
  const lastLegs = route.legs.filter((l) => l.role === "ultima_milla");

  add("recogida", addR(sumR(pickupLegs.map((l) => legCost(c, route, l))), shortHaul(c, pickupLegs[0], RATES.pickupSmall, RATES.pickupTruck)),
    pickupLegs.length ? `${pickupLegs.map((l) => `${l.from} → ${l.to}`).join("; ")}.` : "Puerta a puerta: incluido en el transporte principal.");
  const termUnits = route.terminal.kind === "por_contenedor" ? eq.units : route.terminal.kind === "por_tonelada_volumen" ? lclRevenueTons(c.cargo)
    : route.terminal.kind === "por_kg_tasable" ? airChargeableKg(c.cargo) : route.terminal.kind === "por_palet" ? c.cargo.pallets : trucksNeeded(c.cargo);
  add("terminal_origen", mulR(route.terminal.origin, termUnits), "Carga, estiba y tasas de la terminal de salida.");
  if (!eu) add("despacho_exportacion", RATES.customsExport, "Agente de aduanas en España (DUA de exportación).");
  add("transporte_principal", sumR(mainLegs.map((l) => legCost(c, route, l))), `${mainLegs.map((l) => `${l.from} → ${l.to}`).join("; ")} · ${eq.chargeable}.`);
  if (route.transshipments.length && route.transshipmentCost)
    add("transbordos", mulR(route.transshipmentCost, eq.units * route.transshipments.length), `Transbordo en ${route.transshipments.join(", ")}.`);
  const insurance = mulR(RATES.insurancePct, (c.cargo.valueEur * 1.1) / 100);
  add("seguro", insurance, "Prima sobre el 110 % del valor de la mercancía (práctica habitual).");
  add("terminal_destino", mulR(route.terminal.destination, termUnits), "Descarga y tasas de la terminal de llegada.");
  add("gastos_destino", route.destinationCharges, "Documentación y entrega de la mercancía por la naviera, aerolínea o transportista.");
  if (!eu) add("despacho_importacion", RATES.customsImport, "Agente de aduanas en destino.");
  add("ultima_milla", addR(sumR(lastLegs.map((l) => legCost(c, route, l))), shortHaul(c, lastLegs[0], RATES.lastMileSmall, RATES.lastMileTruck)),
    lastLegs.length ? `${lastLegs.map((l) => `${l.from} → ${l.to}`).join("; ")}${incoterm === "DPU" ? " (incluye la descarga, que en DPU es del vendedor)" : ""}.` : "Puerta a puerta: incluido en el transporte principal.");

  const main = sumR(mainLegs.map((l) => legCost(c, route, l)));
  let taxes: Quote["taxes"] = null;
  if (!eu && c.dutyPct) {
    const customsValue = addR(addR({ min: c.cargo.valueEur, max: c.cargo.valueEur }, main), insurance);
    const duty = mulR(customsValue, c.dutyPct.preferential / 100);
    const vat = mulR(addR(customsValue, duty), (c.importVatPct ?? 0) / 100);
    const vatPayer = payerOf("iva_importacion", incoterm);
    taxes = { duty: roundR(duty), vat: roundR(vat), vatRecoverable: vatPayer === "comprador", vatPayer };
  }
  const logistic = (who?: Party) => sumR(lines.filter((l) => !who || l.payer === who).map((l) => l.range));
  const extraFor = (who?: Party) => extras.filter((e) => !who || e.payer === who).reduce((a, e) => a + e.amount, 0);
  const plus = (r: Range, k: number): Range => ({ min: r.min + k, max: r.max + k });
  const taxCost = (who?: Party): Range => {
    if (!taxes) return ZERO;
    const dutyPaid = !who || taxes.vatPayer === who ? taxes.duty : ZERO;
    const vatCost = taxes.vatRecoverable ? ZERO : !who || taxes.vatPayer === who ? taxes.vat : ZERO;
    return addR(dutyPaid, vatCost);
  };
  const total = roundR(plus(logistic(), extraFor()));
  const seller = roundR(plus(logistic("vendedor"), extraFor("vendedor")));
  const buyer = roundR(plus(logistic("comprador"), extraFor("comprador")));
  const cg = c.cargo;
  const revenue = c.agreed.unitPrice * cg.units;
  const productCost = c.unitCost * cg.units;
  const sellerAll = addR(seller, taxCost("vendedor"));
  const margin = roundR({ min: revenue - productCost - sellerAll.max, max: revenue - productCost - sellerAll.min });
  const transit = transitDays(route);
  return {
    routeId: route.id, incoterm, equipment: eq, lines, extras, taxes,
    logistics: { total, seller, buyer },
    transitDays: transit,
    deliveryDays: addR(transit, { min: c.prepDays, max: c.prepDays }),
    perKg: roundR(mulR(total, 1 / cg.grossKg)), perTonne: roundR(mulR(total, 1000 / cg.grossKg)), perPallet: roundR(mulR(total, 1 / cg.pallets)), perUnit: roundR(mulR(total, 1 / cg.units)),
    logisticsPct: roundR(mulR(total, 100 / cg.valueEur)),
    deliveredCostPerUnit: roundR(mulR(addR(addR({ min: cg.valueEur, max: cg.valueEur }, total), taxCost()), 1 / cg.units)),
    margin,
    marginPct: round2((mid(margin) / revenue) * 100),
  };
}

export { R, SUPUESTO };
