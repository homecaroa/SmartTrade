import { round2 } from "../../money";
import { RATES } from "../../logistics/params";
import { sellerDeliversAtDestination, sellerRiskInMainLeg } from "../../logistics/allocation";
import { computeOperation, routeOf } from "../costs";
import type { Decision, DecisionCtx, Grade } from "../types";
import { eur, mainVehicles, opt } from "./shared";

/**
 * Banco de incidencias de viaje (propuesta 3, 04/11/2026). Cada caso tiene VARIANTES (A, B, C…): la A es su incidencia
 * original y las demás salen de estos generadores. La variante se elige antes de empezar (alumno o profesor) y queda en
 * la sesión: no hay azar. Todas las consecuencias dependen de lo decidido antes (Incoterm, seguro, ruta) y sus importes
 * son SIMULADOS. Reglas:
 * - Daño en tránsito: lo soporta quien tiene el riesgo durante el transporte principal (vendedor solo en reglas D). Sin
 *   reservas concretas en el documento de transporte no se puede reclamar al transportista ni al seguro.
 * - Retraso: la penalización (0,5 % del valor por día, supuesto de los casos) solo la paga el vendedor si entrega en
 *   destino (reglas D). Una causa ajena notificada a tiempo se acoge a la cláusula de fuerza mayor del contrato (supuesto).
 * - Retirada tardía en destino: los costes extra por no recibir a tiempo son de quien los causa (el comprador), aunque
 *   la naviera los facture a quien contrató el flete; quien los paga los repercute con el contrato y las facturas.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;
const incotermCode = (ctx: DecisionCtx) => ctx.settings.incoterm ?? ctx.scenario.incoterms[0];
const sellerRisk = (ctx: DecisionCtx) => sellerRiskInMainLeg(incotermCode(ctx));
const sellerInsured = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).lines.some((l) => l.concept === "seguro" && l.payer === "vendedor");

/** Dónde se dejan las reservas al recibir: en carretera, en el propio CMR; en el resto, en el documento de entrega o por escrito al transportista. */
export function reservationPlace(ctx: DecisionCtx): string {
  const v = mainVehicles(ctx);
  return v.includes("barco") || v.includes("avion") || v.includes("tren") ? "en el documento de entrega o por escrito al transportista" : "en el CMR";
}

/** Franquicia de la póliza de transporte en los casos (supuesto). */
export const INSURANCE_DEDUCTIBLE = 300;

export function damageIncident(o: { variant: string; what: string; damagedPct: number; reshipCost: number }): Decision {
  const loss = (ctx: DecisionCtx) => round2(revenueOf(ctx) * o.damagedPct / 100);
  const whoBears = (ctx: DecisionCtx) => sellerRisk(ctx)
    ? `En ${incotermCode(ctx)} el riesgo del viaje era tuyo${sellerInsured(ctx) ? " y lo tenías asegurado" : " y NO lo aseguraste"}.`
    : `En ${incotermCode(ctx)} el riesgo ya era del comprador cuando se produjo el daño: le corresponde reclamar a él${incotermCode(ctx) === "CIP" ? ", con la póliza de cobertura amplia (cláusulas A) que contrataste a su favor" : incotermCode(ctx) === "CIF" ? ". La póliza mínima de CIF (cláusulas C) solo cubre riesgos mayores (incendio, naufragio, colisión…), no roturas por manipulación: salvo que se pactara más cobertura, el daño lo asume el comprador" : ""}.`;
  return {
    id: `incidencia_${o.variant.toLowerCase()}`, variant: o.variant, stage: "entrega", kind: "single", incident: true, title: "Incidencia: mercancía dañada en el viaje",
    prompt: (ctx) => `Al descargar en destino aparecen dañados el ${o.damagedPct} % de ${o.what} (valor ≈ ${eur(loss(ctx))}). El transportista pide firmar la recepción. ¿Qué indicas que se haga?`,
    concept: "Las reservas son anotaciones concretas al recibir la mercancía (qué bultos y qué daño): en el CMR por carretera; por mar o aire, en el documento de entrega o por escrito al transportista, en el plazo que fija el convenio aplicable. Sin ellas se presume que llegó en buen estado y se pierde la reclamación al transportista y al seguro. Quién soporta el daño depende de dónde pasó el riesgo según el Incoterm.",
    options: [
      opt("reservas", "Dejar reservas concretas por escrito al recibir, hacer fotos y reclamar al seguro y al transportista dentro de plazo", "correcta",
        (ctx) => `Reservas ${reservationPlace(ctx)}. ${whoBears(ctx)} ${sellerRisk(ctx) ? (sellerInsured(ctx) ? `El seguro paga el daño menos la franquicia (${eur(INSURANCE_DEDUCTIBLE)}).` : `Sin seguro solo puedes reclamar al transportista, cuya responsabilidad está limitada por convenio: asumes el daño.`) : "Tú no asumes coste."}`,
        (ctx) => !sellerRisk(ctx) ? null : { concept: "incidencia", label: sellerInsured(ctx) ? "Franquicia del seguro de transporte" : "Mercancía dañada sin seguro", amount: sellerInsured(ctx) ? INSURANCE_DEDUCTIBLE : loss(ctx), payer: "vendedor", note: sellerInsured(ctx) ? "Supuesto del caso: franquicia fija por siniestro." : `${o.damagedPct} % del pedido (simulado).` }),
      opt("reponer", "Reponer los bultos dañados sin reclamar a nadie, para no perder al cliente", (ctx): Grade => (sellerRisk(ctx) && !sellerInsured(ctx) ? "razonable" : "grave"),
        (ctx) => `${whoBears(ctx)} Reponer sin reclamar te hace pagar la mercancía y un nuevo envío (${eur(o.reshipCost)})${sellerRisk(ctx) && sellerInsured(ctx) ? " aunque el seguro lo habría cubierto" : !sellerRisk(ctx) ? " aunque el daño no era tuyo" : ""}.`,
        (ctx) => ({ concept: "incidencia", label: "Reposición de la mercancía dañada y nuevo envío", amount: round2(loss(ctx) + o.reshipCost), payer: "vendedor", note: `${o.damagedPct} % del pedido + envío de reposición (simulados).` })),
      opt("sin_reservas", "Firmar la entrega sin reservas y negociarlo después con el cliente", "grave",
        (ctx) => `Sin reservas se presume que la mercancía llegó bien: no hay reclamación posible. ${sellerRisk(ctx) ? "El daño era tuyo y lo pagas entero." : "El comprador, que no puede reclamar, te pide compartir la pérdida."}`,
        (ctx) => ({ concept: "incidencia", label: sellerRisk(ctx) ? "Mercancía dañada sin posibilidad de reclamar" : "Mitad del daño, compartida con el comprador", amount: round2(loss(ctx) * (sellerRisk(ctx) ? 1 : 0.5)), payer: "vendedor", note: "Sin reservas en el documento de transporte (simulado)." })),
    ],
    best: "reservas", whyBest: "Ante un daño: reservas concretas por escrito al recibir, pruebas y reclamación en plazo. Quién soporta el daño lo decide el Incoterm.",
  };
}

export function delayIncident(o: { variant: string; cause: (ctx: DecisionCtx) => string; days: number; urgentCost: number }): Decision {
  const perDay = (ctx: DecisionCtx) => round2(revenueOf(ctx) * RATES.latePenaltyPctPerDay / 100);
  const dRule = (ctx: DecisionCtx) => sellerDeliversAtDestination(incotermCode(ctx));
  return {
    id: `incidencia_${o.variant.toLowerCase()}`, variant: o.variant, stage: "entrega", kind: "single", incident: true, title: "Incidencia: retraso en el viaje",
    prompt: (ctx) => `${o.cause(ctx)} La mercancía llegará ${o.days} días tarde. El contrato prevé una penalización del ${RATES.latePenaltyPctPerDay} % del valor por día de retraso (${eur(perDay(ctx))}) y una cláusula de fuerza mayor si se notifica en 48 horas.`,
    concept: "Con reglas E, F y C el vendedor cumple al entregar en origen: el retraso del viaje es riesgo del comprador. Con reglas D se compromete a entregar en destino en una fecha. La fuerza mayor exige una causa ajena, imprevisible y notificada a tiempo.",
    options: [
      opt("notificar", "Notificar ya al comprador, con la causa documentada, y darle una nueva fecha", "correcta",
        (ctx) => dRule(ctx) ? "Causa ajena notificada a tiempo: se acoge a la fuerza mayor y no hay penalización." : `En ${incotermCode(ctx)} cumpliste al entregar en origen: no hay penalización, pero avisar le permite reorganizarse.`),
      opt("urgente", "Pagar un transporte alternativo urgente para la parte más necesaria del pedido", (ctx): Grade => (dRule(ctx) ? "razonable" : "grave"),
        (ctx) => dRule(ctx) ? `Reduces el retraso, pero pagas ${eur(o.urgentCost)} cuando avisar a tiempo ya te libraba de la penalización.` : `En ${incotermCode(ctx)} el viaje ya no era responsabilidad tuya: pagas ${eur(o.urgentCost)} que no te corresponden.`,
        () => ({ concept: "incidencia", label: "Transporte alternativo urgente", amount: o.urgentCost, payer: "vendedor", note: "Coste simulado." })),
      opt("esperar", "Esperar a que llegue y explicarlo entonces", (ctx): Grade => (dRule(ctx) ? "grave" : "razonable"),
        (ctx) => dRule(ctx) ? `Sin aviso en 48 horas pierdes la fuerza mayor: pagas ${o.days} días de penalización.` : "No te cuesta dinero porque el retraso era riesgo del comprador, pero callar daña la relación comercial.",
        (ctx) => dRule(ctx) ? { concept: "incidencia", label: `Penalización por retraso (${o.days} días)`, amount: round2(perDay(ctx) * o.days), payer: "vendedor", note: "Sin notificación a tiempo no se aplica la fuerza mayor." } : null),
    ],
    best: "notificar", whyBest: "Ante un retraso por causa ajena: notificar enseguida y documentar. Quién responde del plazo lo decide el Incoterm.",
  };
}

export function lateCollectionIncident(o: { variant: string; daysOver: number; perDay: number }): Decision {
  const unitsOf = (ctx: DecisionCtx) => { const r = routeOf(ctx.scenario, ctx.settings.transport); return r.modality === "maritimo_fcl" ? computeOperation(ctx.scenario, ctx.settings).quote.equipment.units : 1; };
  const isFcl = (ctx: DecisionCtx) => routeOf(ctx.scenario, ctx.settings.transport).modality === "maritimo_fcl";
  const amount = (ctx: DecisionCtx) => round2(o.daysOver * o.perDay * unitsOf(ctx));
  const what = (ctx: DecisionCtx) => isFcl(ctx) ? `demora del contenedor («demurrage»): ${eur(o.perDay)} por día y contenedor` : `almacenaje en la terminal: ${eur(o.perDay)} por día`;
  return {
    id: `incidencia_${o.variant.toLowerCase()}`, variant: o.variant, stage: "entrega", kind: "single", incident: true, title: "Incidencia: retirada tardía en destino",
    prompt: (ctx) => `El importador no tiene sitio en su almacén y tarda en recibir la mercancía: se superan en ${o.daysOver} días los días libres. La naviera cobra ${what(ctx)} (${eur(amount(ctx))} en total) y envía la factura a quien contrató el flete. ¿Qué haces?`,
    concept: "Los costes extra causados porque el comprador no recibe a tiempo son suyos, aunque la naviera los facture a quien contrató el transporte. Quien los paga los repercute con el contrato y las facturas. Los días libres y las tarifas de demora se pactan con la naviera.",
    options: [
      opt("repercutir", "Si la factura llega a ti, pagarla y repercutirla al importador con el contrato y la factura de la naviera", "correcta",
        "Correcto: el retraso lo causó el comprador. Pagas para no bloquear la mercancía y recuperas el importe: el coste neto para ti es cero."),
      opt("asumir", "Asumirla tú: el flete lo contrataste tú", "grave",
        (ctx) => `Contratar el flete no te hace responsable de un retraso que causó el comprador: pagas ${eur(amount(ctx))} que no te corresponden.`,
        (ctx) => ({ concept: "incidencia", label: "Demora en destino asumida sin repercutirla", amount: amount(ctx), payer: "vendedor", note: `${o.daysOver} días × ${eur(o.perDay)} (simulado).` })),
      opt("ignorar", "No pagar a la naviera hasta que el importador lo resuelva", "grave",
        (ctx) => `La naviera retiene la mercancía y los días siguen contando: al final pagas el doble (${eur(amount(ctx) * 2)}) y tienes que reclamarlo después.`,
        (ctx) => ({ concept: "incidencia", label: "Demora en destino duplicada por no pagar a tiempo", amount: round2(amount(ctx) * 2), payer: "vendedor", note: "Supuesto del caso: la retención duplica los días (simulado)." })),
    ],
    best: "repercutir", whyBest: "Paga quien causa el coste; quien lo adelanta lo repercute con documentos.",
  };
}

/** Causa del retraso según el medio principal de la ruta elegida (o la estándar si el transporte es del comprador). */
export const byVehicle = (texts: { barco?: string; avion?: string; ferry?: string; tren?: string; camion: string }) => (ctx: DecisionCtx) => {
  const v = mainVehicles(ctx);
  return (v.includes("avion") && texts.avion) || (v.includes("barco") && texts.barco) || (v.includes("ferry") && texts.ferry) || (v.includes("tren") && texts.tren) || texts.camion;
};
