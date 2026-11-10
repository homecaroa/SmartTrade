import { round2 } from "../learning/money";
import { clientOf, weeklyRevenue } from "./market";
import type { Contract, Grade, Incident, IncidentOption, SimState } from "./model";
import { CLAIMS } from "./params";
import { intIn, stream } from "./rng";

/**
 * Reclamaciones con base legal (reglas v4; docs/simulador.md §17 septies). Tres incidencias que no dependen solo del azar:
 * lo que hiciste antes (el recibo de entrega firmado, por ejemplo) cambia cuál es la respuesta correcta.
 * - «dano»: avería de la mercancía transportada. Con reservas escritas al entregar, respondes hasta el límite legal
 *   (Ley 15/2009, arts. 47 y 57.1). Si la reclamación llega pasados 7 días sin reservas, se presume que entregaste bien
 *   (art. 60.1), pero hay que poder probar la entrega: ahí cuenta el recibo firmado (art. 12).
 * - «retraso»: el perjuicio probado, como mucho el precio del transporte (arts. 56 y 57.2), salvo que el retraso venga
 *   de algo que no pudiste evitar (art. 48.1). Las reservas por retraso llegan dentro de los 21 días (art. 60.3).
 * - «plazo»: un cliente de almacenaje quiere prorrogar su contrato si le dejas pagar a 90 días. Por pacto, nunca más de
 *   60 días (Ley 3/2004, art. 4.3).
 * Cifras SIMULADAS en CLAIMS (params.ts). Solo en partidas con reglas v4 o posteriores: las guardadas no cambian.
 */
const CLAIM_KINDS = ["dano", "retraso", "plazo"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const isClaim = (kind: string): kind is ClaimKind => (CLAIM_KINDS as readonly string[]).includes(kind);

/** Límite legal por avería por kg, redondeado para mostrarlo: un tercio del IPREM/día (art. 57.1). IPREM no comprobado en el BOE (ver CLAIMS). */
export const LIMIT_PER_KG = round2(CLAIMS.ipremMonthly / 30 / 3);

const activeIn = (c: Contract, w: number) => c.startWeek <= w && w <= c.endWeek && !(c.cancelledWeek !== undefined && w >= c.cancelledWeek);
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Semana elegida por la semilla dentro de la ventana, y el resto de sorteos de la reclamación (misma secuencia). */
function draw(seed: number, kind: ClaimKind) {
  const r = stream(seed, 0, `reclamacion-${kind}`);
  const win = CLAIMS[kind].window;
  return { week: intIn(r, win.from, win.to), r };
}

/** Contrato afectado: uno de los que cumplen la condición esa semana, elegido por la semilla. */
function pickContract(s: SimState, kind: ClaimKind, ok: (c: Contract) => boolean): Contract | null {
  const xs = s.contracts.filter((c) => activeIn(c, s.week) && ok(c)).sort((a, b) => a.id.localeCompare(b.id));
  if (!xs.length) return null;
  return xs[Math.floor(stream(s.seed, s.week, `reclamacion-${kind}-contrato`)() * xs.length)];
}

/** Reclamaciones que tocan esta semana (como mucho una de cada tipo por temporada). */
export function claimIncidents(s: SimState): Incident[] {
  if (s.version < CLAIMS.fromVersion) return [];
  const w = s.week;
  const out: Incident[] = [];
  const due = (kind: ClaimKind) => { const d = draw(s.seed, kind); return !s.answers[kind] && w >= d.week && w <= CLAIMS[kind].window.to ? d : null; };

  const dano = due("dano");
  const cd = dano && pickContract(s, "dano", (c) => c.kind !== "almacenaje");
  if (dano && cd) {
    const r = dano.r;
    const late = r() < CLAIMS.dano.lateChance;
    const kg = intIn(r, CLAIMS.dano.kg.min, CLAIMS.dano.kg.max, 50);
    const claim = kg * intIn(r, CLAIMS.dano.valuePerKg.min, CLAIMS.dano.valuePerKg.max);
    const limit = round2(kg * CLAIMS.ipremMonthly / 30 / 3); // se redondea al final, no por kilo
    const receipt = !!cd.docs?.includes("recibo");
    const name = clientOf(cd.clientId).name;
    out.push({ id: "dano", kind: "dano", week: w, title: "Reclamación por mercancía dañada",
      concept: "El transportista responde de las averías desde que recibe la mercancía hasta que la entrega (Ley 15/2009, art. 47), con un límite por kilo (art. 57.1). Las reservas se hacen por escrito al entregar, o en 7 días si el daño no se ve; sin reservas, se presume que la mercancía llegó bien (art. 60.1).",
      prompt: late
        ? `${name} reclama ${eur(claim)} por ${kg} kg de mercancía dañada que entregaste hace ${CLAIMS.dano.lateDays} días. En la entrega no hizo ninguna reserva. ${receipt ? "Tienes el recibo de entrega firmado, sin reservas." : "No preparaste recibo de entrega firmado: no puedes probar cuándo ni cómo entregaste."}`
        : `${name} reclama ${eur(claim)} por ${kg} kg de mercancía dañada. Al recibirla escribió sus reservas en el recibo de entrega describiendo los daños.`,
      data: { contract: cd.id, client: cd.clientId, kg, claim, limit, variant: late ? (receipt ? "tardia_con_recibo" : "tardia_sin_recibo") : "reservas" } });
  }

  const retraso = due("retraso");
  const cr = retraso && pickContract(s, "retraso", (c) => c.kind !== "almacenaje");
  if (retraso && cr) {
    const r = retraso.r;
    const own = r() < CLAIMS.retraso.ownFaultChance;
    const price = round2(weeklyRevenue(cr) + (cr.kind === "puntual" && cr.withBackhaul && cr.backhaul ? cr.backhaul.price : 0));
    const claim = Math.round(price * (CLAIMS.retraso.claimFactor.min + r() * (CLAIMS.retraso.claimFactor.max - CLAIMS.retraso.claimFactor.min)));
    const name = clientOf(cr.clientId).name;
    out.push({ id: "retraso", kind: "retraso", week: w, title: "Reclamación por retraso en la entrega",
      concept: "El transportista responde del perjuicio que el retraso cause y se pruebe, con un máximo del precio del transporte (Ley 15/2009, arts. 56 y 57.2). No responde si el retraso vino de circunstancias que no pudo evitar ni cuyas consecuencias pudo impedir (art. 48.1). Las reservas por retraso deben llegar por escrito en 21 días (art. 60.3).",
      prompt: `${name} te envía por escrito, dentro de plazo, una reclamación de ${eur(claim)} por un retraso de un día en su entrega de esta semana. El precio de ese transporte es ${eur(price)}. ${own ? "El retraso fue tuyo: no planificaste el descanso obligatorio del conductor y tuvo que parar a mitad de ruta." : "El retraso no dependió de ti: la carretera estuvo cortada seis horas por el accidente de otro vehículo y no había alternativa."}`,
      data: { contract: cr.id, client: cr.clientId, price, claim, variant: own ? "propia" : "ajena" } });
  }

  const plazo = due("plazo");
  const cp = plazo && pickContract(s, "plazo", (c) => c.kind === "almacenaje" && c.endWeek === w);
  if (plazo && cp) {
    const name = clientOf(cp.clientId).name;
    out.push({ id: "plazo", kind: "plazo", week: w, title: "Un cliente quiere pagar a 90 días",
      concept: "Entre empresas, el plazo de pago es de 30 días si no se pacta otro, y por pacto nunca puede pasar de 60 días (Ley 3/2004, art. 4.3). Aceptar más es dar crédito gratis a tu cliente con tu caja.",
      prompt: `${name} termina esta semana su almacenaje de ${cp.pallets} palés a ${eur(cp.palletRate!)}/palé/semana. Te ofrece prorrogarlo ${CLAIMS.plazo.extensionWeeks} semanas más con una condición: pagar cada factura a 90 días.`,
      data: { contract: cp.id, client: cp.clientId } });
  }
  return out;
}

/** Opciones de una reclamación, calificadas según su caso (el mismo texto para todos los casos, para no dar pistas). */
export function claimOptions(inc: Incident): IncidentOption[] {
  const v = String(inc.data.variant ?? "");
  const opt = (id: string, label: string, grade: Grade, feedback: string): IncidentOption => ({ id, label, grade, feedback });
  if (inc.kind === "dano") {
    const limit = eur(Number(inc.data.limit)), claim = eur(Number(inc.data.claim));
    const lim = `El límite legal es un tercio del IPREM/día por kilo (art. 57.1): ${limit} (IPREM no comprobado en el BOE, cifra simulada).`;
    if (v === "reservas") return [
      opt("limite", "Reconocer la avería y pagar la indemnización hasta el límite legal por kilo", "correcta", `Hubo reservas por escrito al entregar (art. 60.1): respondes de la avería (art. 47), pero solo hasta el límite. ${lim}`),
      opt("rechazar", "Rechazar la reclamación", "grave", `Con reservas escritas en la entrega, la avería ocurrió bajo tu custodia y respondes de ella (art. 47). El cliente te lleva a la Junta Arbitral del Transporte: pagas el límite legal (${limit}) más ${eur(CLAIMS.dano.costs)} de costas, y deja de trabajar contigo.`),
      opt("todo", "Pagar todo lo que reclama para no perder al cliente", "razonable", `Conservas al cliente, pero pagas ${claim} cuando la ley te obliga como mucho a ${limit} (art. 57.1). Solo se responde por encima si el cargador declaró el valor de la mercancía y pagó el suplemento (art. 61).`),
    ];
    if (v === "tardia_con_recibo") return [
      opt("limite", "Reconocer la avería y pagar la indemnización hasta el límite legal por kilo", "razonable", `Pagas ${limit} que probablemente no debías: sin reservas en la entrega ni en los 7 días siguientes, se presume que la mercancía llegó bien (art. 60.1), y tu recibo firmado lo prueba.`),
      opt("rechazar", "Rechazar la reclamación", "correcta", `Correcto: no hubo reservas al entregar ni en los 7 días siguientes, así que se presume que entregaste la mercancía en buen estado (art. 60.1). Tu recibo de entrega firmado (art. 12) lo prueba.`),
      opt("todo", "Pagar todo lo que reclama para no perder al cliente", "grave", `Pagas ${claim} por un daño del que no respondes: la reclamación llegó tarde y sin reservas (art. 60.1), y aun respondiendo el máximo sería ${limit} (art. 57.1).`),
    ];
    return [
      opt("limite", "Reconocer la avería y pagar la indemnización hasta el límite legal por kilo", "correcta", `La ley presume que entregaste bien si no hubo reservas en 7 días (art. 60.1), pero sin recibo firmado no puedes probar cuándo ni cómo entregaste. Cerrar el asunto dentro del límite legal es lo prudente. ${lim}`),
      opt("rechazar", "Rechazar la reclamación", "razonable", `La ley estaba de tu parte (art. 60.1), pero sin recibo de entrega firmado (art. 12) era tu palabra contra la suya: pierdes en la Junta Arbitral y pagas el límite legal (${limit}) más ${eur(CLAIMS.dano.lostCaseCosts)} de costas. El recibo cuesta una firma.`),
      opt("todo", "Pagar todo lo que reclama para no perder al cliente", "grave", `Pagas ${claim}: aun respondiendo, el máximo legal era ${limit} (art. 57.1).`),
    ];
  }
  if (inc.kind === "retraso") {
    const price = eur(Number(inc.data.price)), claim = eur(Number(inc.data.claim));
    if (v === "propia") return [
      opt("limite", "Pagar el perjuicio que acredite, hasta el precio del transporte", "correcta", `El retraso fue culpa tuya y respondes del perjuicio probado (art. 56), pero nunca por encima del precio del transporte: ${price} (art. 57.2).`),
      opt("todo", "Pagar todo lo que reclama", "razonable", `Pagas ${claim} cuando el máximo legal por retraso es el precio del transporte, ${price} (art. 57.2).`),
      opt("exonerar", "Rechazar la reclamación: un retraso de un día es normal en carretera", "grave", `Planificar el descanso del conductor es cosa tuya: no es una circunstancia que no pudieras evitar (art. 48.1). El cliente reclama en la Junta Arbitral: pagas ${price} más ${eur(CLAIMS.retraso.costs)} de costas y deja de trabajar contigo.`),
    ];
    return [
      opt("limite", "Pagar el perjuicio que acredite, hasta el precio del transporte", "razonable", `Pagas ${price} sin deberlo: un corte de carretera por el accidente de otro es una circunstancia que no podías evitar ni cuyas consecuencias podías impedir (art. 48.1).`),
      opt("todo", "Pagar todo lo que reclama", "grave", `Pagas ${claim} por un retraso del que no respondes (art. 48.1), y además por encima del máximo legal, el precio del transporte (art. 57.2).`),
      opt("exonerar", "Rechazar la reclamación explicando la causa del retraso", "correcta", `Correcto: el corte de carretera por un accidente ajeno es una causa que no podías evitar (art. 48.1). Respondes por escrito explicando la causa; conviene guardar la prueba (el aviso de la DGT, por ejemplo).`),
    ];
  }
  return [
    opt("aceptar", "Aceptar: 90 días a cambio de 4 semanas más de trabajo", "grave", "Por pacto, el plazo de pago nunca puede pasar de 60 días (Ley 3/2004, art. 4.3). Además, financias a tu cliente con tu caja: cobrarás cada factura tres meses después de hacer el trabajo."),
    opt("legal", "Proponer el máximo que permite la ley: 60 días", "correcta", "Correcto: 60 días es el máximo pactable (Ley 3/2004, art. 4.3). Puede que el cliente lo acepte o se vaya, pero no prestas tu caja más allá de lo que permite la ley."),
    opt("rechazar", "Rechazar la prórroga", "razonable", "No asumes riesgos, pero pierdes 4 semanas de facturación sin probar una contraoferta legal: 60 días."),
  ];
}

/** Consecuencias de la decisión: costes que se cargan al cerrar la semana, contratos que se cancelan o se prorrogan. */
export function applyClaimDecision(s: SimState, inc: Incident, option: string) {
  const w = s.week;
  const c = s.contracts.find((x) => x.id === inc.data.contract)!;
  const name = clientOf(c.clientId).name;
  const charge = (label: string, amount: number, note: string) => { if (amount > 0) (s.claims ??= []).push({ label, amount: round2(amount), note }); };
  const leave = () => { for (const x of s.contracts) if (x.clientId === c.clientId && activeIn(x, w + 1)) x.cancelledWeek = w + 1; };
  if (inc.kind === "dano") {
    const limit = Number(inc.data.limit), claim = Number(inc.data.claim), v = inc.data.variant;
    if (option === "limite") charge(`Indemnización por avería a ${name}`, limit, `Indemnizas a ${name} por la mercancía dañada: ${eur(limit)}.`);
    if (option === "todo") charge(`Indemnización por avería a ${name}`, claim, `Pagas a ${name} todo lo que reclamaba: ${eur(claim)}.`);
    if (option === "rechazar" && v === "reservas") { charge(`Laudo y costas: avería de ${name}`, limit + CLAIMS.dano.costs, `La Junta Arbitral da la razón a ${name}: indemnización y costas.`); leave(); }
    if (option === "rechazar" && v === "tardia_sin_recibo") charge(`Laudo y costas: avería de ${name}`, limit + CLAIMS.dano.lostCaseCosts, `Sin recibo de entrega no pudiste probarlo: la Junta Arbitral da la razón a ${name}.`);
    return;
  }
  if (inc.kind === "retraso") {
    const price = Number(inc.data.price), claim = Number(inc.data.claim);
    if (option === "limite") charge(`Indemnización por retraso a ${name}`, price, `Indemnizas a ${name} por el retraso hasta el precio del transporte: ${eur(price)}.`);
    if (option === "todo") charge(`Indemnización por retraso a ${name}`, claim, `Pagas a ${name} todo lo que reclamaba por el retraso: ${eur(claim)}.`);
    if (option === "exonerar" && inc.data.variant === "propia") { charge(`Laudo y costas: retraso con ${name}`, price + CLAIMS.retraso.costs, `La Junta Arbitral da la razón a ${name}: el retraso fue por tu planificación.`); leave(); }
    return;
  }
  // Plazo: la prórroga empieza la semana siguiente, con el plazo de pago pactado.
  const extend = (payWeeks: number) => {
    const { cancelledWeek: _drop, ...base } = c;
    // La documentación es la del contrato original; su posible consecuencia ya se jugó en él (docPenalized).
    s.contracts.push({ ...base, id: `${c.id}-prorroga`, week: w + 1, startWeek: w + 1, endWeek: w + CLAIMS.plazo.extensionWeeks, weeks: CLAIMS.plazo.extensionWeeks, payWeeks, docPenalized: true });
  };
  if (option === "aceptar") extend(CLAIMS.plazo.askedWeeks);
  if (option === "legal") {
    if (stream(s.seed, w, "reclamacion-plazo-respuesta")() < CLAIMS.plazo.acceptsLegalChance) { extend(CLAIMS.plazo.legalMaxWeeks); (s.claims ??= []).push({ label: "", amount: 0, note: `${name} acepta la prórroga a 60 días.` }); }
    else (s.claims ??= []).push({ label: "", amount: 0, note: `${name} no acepta 60 días y se lleva sus palés a otro almacén.` });
  }
}
