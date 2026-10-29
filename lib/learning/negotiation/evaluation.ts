import { round2 } from "../money";
import { RISK_MULTIPLIER, defaultProbability, PAYMENT_TERMS } from "../payments";
import { deliveredPrice, utility } from "./buyer-engine";
import { floorPrice, sellerEconomics, type SellerEconomics } from "./economics";
import { simulateStrategy, type NegotiationSession } from "./session";
import type { NegotiationScenario, Offer } from "./types";

/**
 * Evaluación de la negociación. Cinco dimensiones por separado (0–100, con su explicación), y además:
 * - NOTA DE CONOCIMIENTOS: preparación + calidad del proceso negociador (criterios visibles).
 * - RESULTADO ECONÓMICO: margen y riesgo del acuerdo. No se premia sin más el precio más alto: la rentabilidad deja de
 *   sumar al llegar al margen objetivo, y adecuación, riesgo y cumplimiento pesan tanto como ella.
 */
export interface Dimension { key: string; label: string; score: number | null; explain: string }
export interface ProcessCriterion { label: string; points: number; max: number; explain: string }
export interface PrepReview { id: string; title: string; answer: string; grade: "correcta" | "razonable" | "grave"; feedback: string; best: string }

export interface NegotiationEvaluation {
  dimensions: Dimension[];
  prep: PrepReview[];
  process: ProcessCriterion[];
  knowledge: { points: number; max: number; pct: number };
  economics: SellerEconomics | null;
  errors: string[];
  recommendations: string[];
  reference: { label: string; explanation: string; session: NegotiationSession; economics: SellerEconomics | null; buyerFit: number | null };
  hiddenReveal: string[];
}

const POINTS = { correcta: 10, razonable: 6, grave: 0 } as const;
const MAX_DEFAULT = Math.max(...PAYMENT_TERMS.map((p) => p.baseDefault)) * RISK_MULTIPLIER.alto;

export function gradeWalkaway(sc: NegotiationScenario, value: number): PrepReview {
  const q = sc.prep.find((p) => p.kind === "walkaway");
  if (!q || q.kind !== "walkaway") throw new Error("El escenario no tiene pregunta de punto de retirada.");
  const floor = floorPrice(sc, q.basis.incoterm, q.basis.payment, q.basis.guarantee);
  const best = `${floor.toLocaleString("es-ES", { minimumFractionDigits: 2 })} € por ${sc.unit}`;
  if (value < floor) return { id: q.id, title: q.title, answer: `${value} €`, grade: "grave", best, feedback: "Por debajo de tu coste real: aceptar ese precio daría pérdidas. Recuerda sumar logística, garantía, financiación, comisión y riesgo de impago." };
  if (value <= floor * 1.03) return { id: q.id, title: q.title, answer: `${value} €`, grade: "correcta", best, feedback: "Bien calculado: es el precio por debajo del cual la operación deja de compensar." };
  if (value <= floor * 1.15) return { id: q.id, title: q.title, answer: `${value} €`, grade: "razonable", best, feedback: "Prudente, pero algo alto: podrías rechazar acuerdos que aún serían rentables. Repasa qué costes has incluido." };
  return { id: q.id, title: q.title, answer: `${value} €`, grade: "grave", best, feedback: "Demasiado alto: confundes el punto de retirada (mínimo aceptable) con el precio objetivo, y te cerrarías a acuerdos buenos." };
}

function prepReview(sc: NegotiationScenario, s: NegotiationSession): PrepReview[] {
  return sc.prep.filter((q) => s.prepConfirmed.includes(q.id)).map((q) => {
    if (q.kind === "walkaway") return gradeWalkaway(sc, Number(s.prep[q.id]));
    const o = q.options.find((x) => x.id === s.prep[q.id]);
    const best = q.options.find((x) => x.id === q.best);
    return { id: q.id, title: q.title, answer: o?.label ?? "—", grade: o?.grade ?? "grave", feedback: o?.feedback ?? "", best: `${best?.label ?? q.best}. ${q.why}` };
  });
}

/** Condiciones que mejoran para el vendedor entre dos ofertas suyas (lo que obtuvo «a cambio» de una concesión). */
function gains(sc: NegotiationScenario, prev: Offer, next: Offer): string[] {
  const g: string[] = [];
  if (next.quantity > prev.quantity) g.push("más cantidad");
  if (defaultProbability(next.payment, sc.buyer.risk) < defaultProbability(prev.payment, sc.buyer.risk)) g.push("menos riesgo de cobro");
  if (next.deliveryDays > prev.deliveryDays) g.push("más plazo");
  if (prev.guarantee === "ampliada" && next.guarantee === "estandar") g.push("menos garantía");
  if (prev.exclusivity && !next.exclusivity) g.push("sin exclusividad");
  if ((sc.seller.logisticsPerUnit[next.incoterm] ?? 0) < (sc.seller.logisticsPerUnit[prev.incoterm] ?? 0)) g.push("menos costes logísticos");
  return g;
}

function processCriteria(sc: NegotiationScenario, s: NegotiationSession): ProcessCriterion[] {
  // Aceptar una contraoferta más barata también es una concesión: cuenta como el último movimiento del alumno.
  const offers = [...s.rounds.map((r) => r.offer), ...(s.outcome?.how === "alumno_acepta" && s.outcome.final ? [s.outcome.final] : [])];
  const out: ProcessCriterion[] = [];
  if (!offers.length) return out;
  const first = offers[0];
  const e1 = sellerEconomics(sc, first);
  out.push(e1.marginPct >= sc.seller.targetMarginPct
    ? { label: "Oferta inicial", points: 10, max: 10, explain: "Abriste con un precio que cubre tu margen objetivo y deja espacio para negociar." }
    : e1.margin >= 0
      ? { label: "Oferta inicial", points: 6, max: 10, explain: "Abriste con beneficio, pero por debajo de tu objetivo: te quedó poco margen para conceder." }
      : { label: "Oferta inicial", points: 0, max: 10, explain: "Tu primera oferta ya daba pérdidas." });

  const conc = offers.slice(1).map((o, i) => ({ drop: round2(deliveredPrice(sc, offers[i]) - deliveredPrice(sc, o)), gained: gains(sc, offers[i], o) })).filter((c) => c.drop > 0);
  const decreasing = conc.every((c, i) => i === 0 || c.drop <= conc[i - 1].drop + 0.001);
  out.push(conc.length < 2
    ? { label: "Ritmo de concesiones", points: 10, max: 10, explain: conc.length ? "Una sola concesión de precio (contando la contraoferta que aceptaste)." : "No necesitaste bajar el precio." }
    : decreasing
      ? { label: "Ritmo de concesiones", points: 10, max: 10, explain: "Tus rebajas fueron cada vez menores: transmites que te acercas a tu límite." }
      : { label: "Ritmo de concesiones", points: 5, max: 10, explain: "Alguna rebaja fue mayor que la anterior: el comprador puede pensar que aún tienes mucho margen." });

  const traded = conc.filter((c) => c.gained.length).length;
  out.push(conc.length === 0
    ? { label: "Concesiones con contrapartida", points: 10, max: 10, explain: "No hiciste concesiones de precio." }
    : { label: "Concesiones con contrapartida", points: round2((10 * traded) / conc.length), max: 10, explain: `${traded} de ${conc.length} rebajas de precio obtuvieron algo a cambio (${[...new Set(conc.flatMap((c) => c.gained))].join(", ") || "nada"}). Conceder no es malo si se intercambia.` });

  const final = s.outcome?.final;
  if (final) {
    const ok = sellerEconomics(sc, final).margin >= 0;
    out.push(ok ? { label: "Respeto del punto de retirada", points: 10, max: 10, explain: "El acuerdo no da pérdidas." } : { label: "Respeto del punto de retirada", points: 0, max: 10, explain: "Cerraste un acuerdo con pérdidas." });
    const giftExclusive = final.exclusivity && (!sc.hidden.exclusivity.wants || final.quantity < sc.hidden.desiredQty + sc.hidden.exclusivity.extraQty);
    out.push(giftExclusive
      ? { label: "Exclusividad", points: 0, max: 10, explain: sc.hidden.exclusivity.wants ? "Concediste exclusividad sin conseguir el volumen adicional que el comprador estaba dispuesto a comprometer." : "Concediste exclusividad a un comprador que no la valoraba: es un coste para ti sin nada a cambio." }
      : { label: "Exclusividad", points: 10, max: 10, explain: final.exclusivity ? "La exclusividad se intercambió por más volumen." : "No regalaste exclusividad." });
  } else {
    // Rechazar una contraoferta con pérdidas es una buena decisión; rechazar una rentable, no tanto.
    const lastCounter = s.rounds.at(-1)?.response.counter ?? null;
    const counterProfitable = !!lastCounter && sellerEconomics(sc, lastCounter).margin >= 0;
    out.push(s.outcome?.how === "alumno_rechaza"
      ? counterProfitable
        ? { label: "Cierre", points: 5, max: 10, explain: "Rechazaste una propuesta que todavía era rentable. Puede ser legítimo, pero revisa si compensaba." }
        : { label: "Cierre", points: 10, max: 10, explain: "Rechazaste una propuesta que te daba pérdidas: decisión correcta." }
      : { label: "Cierre", points: 3, max: 10, explain: "El comprador se retiró de la negociación: había margen para un acuerdo y no se encontró." });
  }
  return out;
}

export function evaluateNegotiation(sc: NegotiationScenario, s: NegotiationSession): NegotiationEvaluation {
  const prep = prepReview(sc, s);
  const process = processCriteria(sc, s);
  const points = prep.reduce((a, p) => a + POINTS[p.grade], 0) + process.reduce((a, p) => a + p.points, 0);
  const max = prep.length * 10 + process.reduce((a, p) => a + p.max, 0);
  const final = s.outcome?.final ?? null;
  const economics = final ? sellerEconomics(sc, final) : null;
  const dims: Dimension[] = [];
  if (final && economics) {
    const fit = utility(sc, final);
    const p = economics.defaultProb;
    const unfeasible = sc.seller.unfeasibleIncoterms[final.incoterm];
    let compliance = 100;
    const cNotes: string[] = [];
    if (final.deliveryDays < sc.seller.minDeliveryDays) { compliance -= 50; cNotes.push(`prometiste ${final.deliveryDays} días y necesitas ${sc.seller.minDeliveryDays}`); }
    if (final.guarantee !== sc.hidden.requiredGuarantee && final.guarantee !== "ampliada") { compliance -= 30; cNotes.push("la garantía no cubre lo que el comprador exigía"); }
    if (unfeasible) { compliance -= 40; cNotes.push("tu empresa no puede cumplir el Incoterm pactado"); }
    dims.push(
      { key: "rentabilidad", label: "Rentabilidad", score: Math.round(Math.max(0, Math.min(1, economics.marginPct / sc.seller.targetMarginPct)) * 100), explain: `Margen del ${economics.marginPct.toLocaleString("es-ES")} % frente a un objetivo del ${sc.seller.targetMarginPct} %. Por encima del objetivo no suma más: no se premia el precio por sí solo.` },
      { key: "adecuacion", label: "Adecuación a las necesidades del comprador", score: Math.round(fit * 100), explain: "Cuánto encaja el acuerdo con las prioridades del comprador (precio puesto en su almacén, pago, plazo, cantidad, garantías y entrega)." },
      { key: "riesgo", label: "Riesgo de impago", score: Math.round((1 - p / MAX_DEFAULT) * 100), explain: `Probabilidad de impago estimada del ${(p * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} % según la forma de pago y el perfil del comprador (estimación didáctica). Más puntos = menos riesgo.` },
      { key: "cumplimiento", label: "Plazos y requisitos", score: Math.max(0, compliance), explain: cNotes.length ? `Problemas: ${cNotes.join("; ")}.` : "Lo pactado se puede cumplir y cubre los requisitos del comprador." },
    );
  } else {
    dims.push({ key: "rentabilidad", label: "Rentabilidad", score: null, explain: "No hubo acuerdo: no hay operación que valorar." });
  }
  dims.push({ key: "estrategia", label: "Estrategia negociadora", score: max ? Math.round((points / max) * 100) : 0, explain: "Preparación y proceso: punto de retirada, apertura, concesiones con contrapartida y cierre." });

  const errors = [...prep.filter((p) => p.grade === "grave").map((p) => `${p.title}: ${p.feedback}`), ...process.filter((p) => p.points === 0).map((p) => `${p.label}: ${p.explain}`)];
  const recommendations: string[] = [];
  if (economics && economics.marginPct < sc.seller.targetMarginPct) recommendations.push("Antes de bajar el precio, prueba a ceder en algo barato para ti y valioso para el comprador (plazo de pago asegurado, Incoterm, cantidad).");
  if (economics && economics.defaultProb >= 0.03) recommendations.push("Si concedes aplazamiento de pago, cubre el riesgo (seguro de crédito, cobro documentario).");
  if (!final) recommendations.push("Revisa la estrategia de referencia: muestra que había un acuerdo rentable posible.");
  if (process.some((p) => p.label === "Concesiones con contrapartida" && p.points < 10)) recommendations.push("Cada concesión debería ir acompañada de una petición: «si bajo el precio, ¿subís la cantidad?».");

  const marginPctOf = (o: Offer) => sellerEconomics(sc, o).marginPct;
  const refSession = simulateStrategy(sc, sc.reference.offers, marginPctOf);
  const refFinal = refSession.outcome?.final ?? null;
  const h = sc.hidden;
  return {
    dimensions: dims, prep, process,
    knowledge: { points: round2(points), max, pct: max ? round2((points / max) * 100) : 0 },
    economics, errors, recommendations,
    reference: { label: sc.reference.label, explanation: sc.reference.explanation, session: refSession, economics: refFinal ? sellerEconomics(sc, refFinal) : null, buyerFit: refFinal ? utility(sc, refFinal) : null },
    hiddenReveal: [
      `Precio objetivo del comprador, puesto en su almacén: ${h.targetPrice} € por ${sc.unit}; máximo que podía pagar: ${h.maxPrice} €.`,
      `Cantidad: entre ${h.minQty} y ${h.maxQty}, idealmente ${h.desiredQty}.`,
      `Plazo máximo de entrega: ${h.maxDeliveryDays} días.`,
      h.exclusivity.wants ? `Quería exclusividad y estaba dispuesto a comprometer ${h.exclusivity.extraQty} ${sc.unit}s más a cambio.` : "No le interesaba la exclusividad.",
      `Aceptaba a partir de una valoración global del ${Math.round(h.acceptAt * 100)} % según sus prioridades.`,
    ],
  };
}
