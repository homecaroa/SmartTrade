import { round2, sum } from "../../../learning/money";
import { activeDeals, charge, clientName, learn, registerClients, relate, remember } from "../helpers";
import type { CampaignState, Decision, Grade } from "../model";
import { BANK, LATE } from "../params";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 3 · «El cliente que paga tarde» (tesorería). Ganas dinero, pero la caja se tensa: Bazar quiere pagar más tarde,
 * tu cliente más grande se retrasa y llega una avería. Mecánica nueva: ciclo de caja y financiación del circulante.
 *
 * Normativa comprobada en el BOE el 23/11/2026: Ley 3/2004 (texto consolidado, actualización del 01/10/2014): plazo de
 * 30 días y nunca más de 60 por pacto (art. 4.1 y 4.3); mora automática (art. 5); interés de demora = tipo del BCE + 8
 * puntos (art. 7; el tipo del semestre NO se ha comprobado, el del juego es simulado); 40 € fijos por costes de cobro
 * (art. 8); nulas las cláusulas que los excluyen (art. 9). Banco, descuentos y avería: cifras SIMULADAS.
 *
 * Estrategias válidas: póliza de crédito y aguantar; sin póliza, cobrando antes (pronto pago o descuento de facturas);
 * austeridad y reclamar a tiempo. La mala: aceptar plazos ilegales y aplazar pagos sin pactarlos.
 */
const eur = (v: number, d = 0) => `${v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
registerClients({ vecina: "Empresa vecina (subarriendo, ficticia)" });
export const REPAIR = 1_400;
/** Coste financiero máximo para la ★★ (calibrado con las estrategias: la que paga tarde y descuenta todo lo supera). */
export const FIN_LIMIT = 150;
/** Subarriendo de espacio libre: palés, precio por palé y semana, y fianza de dos meses que te entrega el subarrendatario. */
export const SUBLET = { pallets: 150, rate: 1.6 };

/** Coste financiero del nivel: intereses y comisiones de la póliza, descuentos por pronto pago y del factoring. */
export const financialCost = (s: CampaignState) => round2(Number(s.data.finCost ?? 0) + sum(s.logs.filter((l) => l.level === s.level).map((l) => l.financial)));

/** Periodo medio de cobro (días): lo pendiente de cobro sobre lo facturado en las últimas 4 semanas. */
export function collectionDays(s: CampaignState): number {
  const pending = sum(s.company.invoices.filter((i) => i.paidAbs === undefined && !i.factored).map((i) => i.amount));
  const last4 = s.logs.slice(-4);
  const billed = sum(last4.map((l) => l.revenue));
  return billed ? Math.round(pending / billed * 28) : 0;
}

/** El cliente de transporte más grande (el que se retrasará). */
const biggest = (s: CampaignState) => [...activeDeals(s.company, s.abs).filter((d) => d.kind === "transporte" && d.client !== "bazar")].sort((a, b) => b.km! * b.rate! - a.km! * a.rate!)[0];

export const LEVEL3: LevelDef = {
  n: 3, act: 1, actTitle: "Arranque", type: "Tesorería", title: "El cliente que paga tarde", weeks: 8,
  briefing: "Tu empresa ya gana dinero, pero los cobros llegan tarde y los pagos no esperan. En las próximas semanas, un cliente se retrasará, Bazar querrá pagar más tarde y tendrás una avería.",
  mechanic: "Ciclo de caja: cobras más tarde de lo que pagas. Puedes financiarte con el banco, cobrar antes con un coste o reclamar lo que te deben.",
  objectives: ["Aguantar las 8 semanas sin quedarte sin caja.", `Que todo lo que pagues por financiarte (intereses, comisiones y descuentos) no pase de ${FIN_LIMIT} €.`, "Terminar con un periodo medio de cobro de 40 días o menos y sin haber pagado tarde a ningún proveedor."],
  strategies: ["Abrir una póliza y aguantar los desfases sin descontar nada.", "Sin póliza: cobrar antes con un descuento por pronto pago o adelantando facturas.", "Austeridad: reclamar los impagos a tiempo, no aceptar plazos largos, pactar los pagos y sacar rendimiento al espacio que no usas."],
  concepts: ["ciclo-caja", "plazos-legales", "poliza", "pronto-pago", "factoring"],
  keyDecisions: ["poliza", "plazo-bazar", "mora", "subarriendo", "averia", "pronto-pago", "factoring"],
  start(s) {
    s.data.finCost = 0;
    const b = biggest(s);
    if (b) { s.data.lateClient = b.client; s.data[`late_${b.client}`] = 3; }
  },
  decisionsAt(s) {
    const out: Decision[] = [];
    const c = s.company, L = s.week;
    if (L === 1) {
      out.push({ id: "poliza", key: true, title: "El banco te ofrece una póliza de crédito",
        prompt: `Límite de ${eur(BANK.creditLimit)}, ${eur(BANK.creditLimit * BANK.openingFee)} de comisión de apertura y un ${(BANK.annualRate * 100).toLocaleString("es-ES")} % anual solo sobre lo que uses. Tienes ${eur(c.cash)} en caja.`,
        hint: "Una póliza cubre desfases entre cobros y pagos, no pérdidas. ¿Vas a tener desfases en las próximas semanas?",
        options: [{ id: "si", label: "Abrir la póliza" }, { id: "no", label: "No, por ahora" }] });
      if (activeDeals(c, s.abs).some((d) => d.client === "bazar")) out.push({ id: "plazo-bazar", key: true, title: "Bazar quiere pagarte más tarde",
        prompt: "Bazar Levante pide pagar el almacenaje a 90 días en vez de a 30. Si no, «se lo pensará».",
        hint: "¿Hasta cuántos días se puede pactar el pago entre empresas? ¿Y qué le pasa a tu caja si cobras dos meses más tarde?",
        options: [{ id: "90", label: "Aceptar 90 días" }, { id: "60", label: "Ofrecer 60 días" }, { id: "no", label: "Mantener 30 días" }] });
    }
    const lc = String(s.data.lateClient ?? "");
    const overdue = lc && c.invoices.some((i) => i.client === lc && i.paidAbs === undefined && i.dueAbs < s.abs);
    if (overdue && !s.answers["mora"]) out.push({ id: "mora", key: true, title: "Un cliente no te paga",
      prompt: `${clientName(lc)} no ha pagado facturas ya vencidas (${eur(sum(c.invoices.filter((i) => i.client === lc && i.paidAbs === undefined && i.dueAbs < s.abs).map((i) => i.amount)))}).`,
      hint: "Entre empresas, quien no paga a su vencimiento entra en mora sin necesidad de aviso. ¿Qué te da la ley y qué te juegas con el cliente?",
      options: [{ id: "reclamar", label: "Reclamar por escrito el pago, los intereses de demora y los 40 € de costes de cobro" }, { id: "esperar", label: "Esperar: es un buen cliente" }, { id: "cortar", label: "Dejar de servirle hasta que pague" }] });
    const freePallets = c.facility ? c.facility.pallets - sum(activeDeals(c, s.abs).filter((d) => d.kind === "almacen").map((d) => d.pallets!)) : 0;
    if (L === 2 && freePallets >= SUBLET.pallets) out.push({ id: "subarriendo", key: true, title: "Te piden espacio en tu nave",
      prompt: `Una empresa vecina quiere ${SUBLET.pallets} de tus ${freePallets} palés libres a ${SUBLET.rate.toLocaleString("es-ES")} € por palé y semana, y te entrega una fianza de dos meses (${eur(SUBLET.pallets * SUBLET.rate * 8)}).`,
      hint: "El espacio que pagas y no usas es dinero parado. ¿Lo vas a necesitar pronto? ¿Qué es la fianza que recibes: tuya o una deuda?",
      options: [{ id: "si", label: "Subarrendar ese espacio" }, { id: "no", label: "Guardarlo para crecer" }] });
    if (L === 4) out.push({ id: "averia", key: true, title: "Avería de la furgoneta",
      prompt: `La reparación cuesta ${eur(REPAIR)} y el taller quiere cobrar al entregarla.`,
      hint: "Retrasar un pago también es financiarse, pero no gratis ni sin pactarlo. ¿Qué dice la ley de los plazos de pago entre empresas?",
      options: [{ id: "pagar", label: "Pagar ahora" }, { id: "pactar", label: "Pactar con el taller pagarle a 30 días" }, { id: "retrasar", label: "Pagar «cuando se pueda», sin decir nada" }] });
    if (L === 3 && activeDeals(c, s.abs).some((d) => d.client === "bazar")) out.push({ id: "pronto-pago", key: true, title: "¿Ofreces un descuento por pronto pago?",
      prompt: "Podrías ofrecer a Bazar un 2 % de descuento si te paga a 10 días en vez de a su plazo.",
      hint: "Un 2 % por cobrar unos 50 días antes equivale a pagar cerca de un 15 % anual. ¿Cuánto te cuesta la otra forma de financiarte que tengas?",
      options: [{ id: "si", label: "Ofrecer el 2 % por pagar a 10 días" }, { id: "no", label: "No ofrecerlo" }] });
    if (L === 2 && c.invoices.some((i) => i.paidAbs === undefined && !i.factored && i.dueAbs > s.abs)) out.push({ id: "factoring", key: true, title: "¿Adelantas el cobro de tus facturas?",
      prompt: `El banco te adelanta hoy lo que te deben en facturas aún no vencidas (${eur(sum(c.invoices.filter((i) => i.paidAbs === undefined && !i.factored && i.dueAbs > s.abs).map((i) => i.amount)))}) a cambio de un ${(BANK.factoringFee * 100).toLocaleString("es-ES")} %.`,
      hint: "Convierte en caja lo que te deben, pero no gana dinero: lo cuesta. ¿Lo necesitas?",
      options: [{ id: "si", label: "Adelantar el cobro de todas" }, { id: "no", label: "No" }] });
    out.push(...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    const say = (grade: Grade, feedback: string, competences: string[]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: true });
    if (d.id === "poliza") {
      if (op === "si") { c.credit = { limit: BANK.creditLimit, annualRate: BANK.annualRate }; charge(s, "Comisión de apertura de la póliza", BANK.creditLimit * BANK.openingFee); s.data.finCost = round2(Number(s.data.finCost) + BANK.creditLimit * BANK.openingFee); }
      say(op === "si" ? "correcta" : c.cash < 6_000 ? "razonable" : "correcta", op === "si" ? `Pagas ${eur(BANK.creditLimit * BANK.openingFee)} por tener ${eur(BANK.creditLimit)} disponibles y solo pagarás intereses de lo que uses. Es un seguro contra los desfases de caja, no contra las pérdidas.` : `Te ahorras la comisión. Con ${eur(c.cash)} en caja ${c.cash < 6_000 ? "vas justo para lo que viene: si se retrasan cobros, no tendrás colchón" : "tienes colchón, pero no hay red si se juntan varios golpes"}.`, ["0623-RA3", "0623-RA5"]);
      return;
    }
    if (d.id === "plazo-bazar") {
      const deal = c.deals.find((x) => x.client === "bazar" && x.kind === "almacen" && !x.ended);
      if (deal && op === "60") deal.payWeeks = 8;
      if (deal && op === "90") deal.payWeeks = 12;
      if (op === "no") relate(s, "bazar", -10);
      if (op === "90") remember(s, "acepto-plazo-ilegal");
      say(op === "60" ? "correcta" : op === "no" ? "razonable" : "grave", op === "90" ? "Entre empresas, el plazo pactado nunca puede pasar de 60 días (Ley 3/2004, art. 4.3): ese pacto no vale, y además financias tú a tu cliente tres meses. Un cliente que te pide eso hoy te pedirá más mañana." : op === "60" ? "60 días es el máximo que permite pactar la ley entre empresas (Ley 3/2004, art. 4.3). Conservas al cliente, pero tu caja lo nota: cobras un mes más tarde." : "Mantienes los 30 días que la ley fija si no se pacta otra cosa (Ley 3/2004, art. 4.1). Tu caja lo agradece; la relación, algo menos.", ["0623-RA5", "0824-RA3"]);
      return;
    }
    if (d.id === "mora") {
      const lc = String(s.data.lateClient);
      if (op === "reclamar") { s.data[`late_${lc}`] = 1; for (const i of c.invoices) if (i.client === lc && i.paidAbs === undefined && i.payAbs > s.abs + 1) i.payAbs = s.abs + 1; charge(s, "Costes de cobro reclamados (Ley 3/2004, art. 8)", -LATE.recoveryFee); relate(s, lc, -5); }
      if (op === "cortar") { for (const x of c.deals) if (x.client === lc && !x.ended) { x.ended = true; x.toAbs = s.abs - 1; } for (const i of c.invoices) if (i.client === lc && i.paidAbs === undefined) i.payAbs = Math.max(i.payAbs, s.abs + 2); relate(s, lc, -40); }
      say(op === "reclamar" ? "correcta" : op === "esperar" ? "razonable" : "grave", op === "reclamar" ? "Entra en mora automáticamente al no pagar a su vencimiento (Ley 3/2004, art. 5): debe intereses de demora (el tipo del BCE más 8 puntos, art. 7) y 40 € fijos por costes de cobro (art. 8). Reclamar por escrito y a tiempo acelera el cobro: paga la semana que viene." : op === "esperar" ? "Conservas la relación, pero financias tú a tu cliente: seguirá pagando tarde y tu caja lo sufre." : "Cortar sin más te deja sin el cliente y no cobras antes: pierdes su facturación futura. Primero se reclama.", ["0623-RA5"]);
      return;
    }
    if (d.id === "averia") {
      if (op === "pagar") charge(s, "Reparación de la furgoneta", REPAIR);
      if (op === "pactar") charge(s, "Reparación de la furgoneta (a pagar a 30 días)", REPAIR, false);
      if (op === "retrasar") { charge(s, "Reparación de la furgoneta (pagada tarde)", REPAIR, false); charge(s, "Intereses de demora y costes de cobro del taller", LATE.recoveryFee + round2(REPAIR * LATE.lateInterestAnnual * 4 / 52)); remember(s, "mal-pagador"); s.data.finCost = round2(Number(s.data.finCost) + LATE.recoveryFee + round2(REPAIR * LATE.lateInterestAnnual * 4 / 52)); }
      say(op === "pactar" ? "correcta" : op === "pagar" ? (c.cash > REPAIR + 2_000 ? "correcta" : "razonable") : "grave", op === "pactar" ? "Pactar el plazo es financiación gratis y legal: hasta 60 días por acuerdo (Ley 3/2004, art. 4.3)." : op === "pagar" ? `Pagas y sigues: ${c.cash > REPAIR + 2_000 ? "tenías caja de sobra" : "pero te quedas con poco margen para lo que viene"}.` : "No pagar a tiempo sin pactarlo te pone a ti en mora: debes intereses de demora y 40 € de costes de cobro (Ley 3/2004, arts. 5, 7 y 8). Y los proveedores recuerdan quién les paga mal.", ["0623-RA5"]);
      return;
    }
    if (d.id === "pronto-pago") {
      // El descuento rebaja lo que factura Bazar desde ya (es menos ingreso, no un gasto) y cobras a 10 días.
      if (op === "si") { for (const x of c.deals) if (x.client === "bazar" && !x.ended) { x.payWeeks = 2; if (x.rate) x.rate = round2(x.rate * 0.98); if (x.palletRate) x.palletRate = round2(x.palletRate * 0.98); } s.data.bazarDiscount = true; }
      const hasCredit = !!c.credit;
      say(op === "si" ? (hasCredit ? "razonable" : "correcta") : hasCredit ? "correcta" : c.cash < 2_000 ? "razonable" : "correcta", `Un 2 % por cobrar unos 50 días antes equivale a pagar cerca de un ${round2(2 * 365 / 50).toLocaleString("es-ES")} % anual. ${hasCredit ? `Tu póliza cuesta un ${(BANK.annualRate * 100).toLocaleString("es-ES")} %: financiarte con ella es más barato que el descuento.` : "Sin otra forma de financiarte, puede valer la pena si la caja aprieta."}`, ["0623-RA3", "0623-RA5"]);
      return;
    }
    if (d.id === "subarriendo") {
      if (op === "si") {
        c.deals.push({ id: "l3-subarriendo", client: "vecina", kind: "almacen", pallets: SUBLET.pallets, palletRate: SUBLET.rate, payWeeks: 4, fromAbs: s.abs, missed: 0 });
        const dep = round2(SUBLET.pallets * SUBLET.rate * 8);
        c.cash = round2(c.cash + dep);
        c.payables.push({ id: "fianza-recibida", label: "Fianza recibida del subarrendatario (se devuelve al terminar)", amount: dep, dueAbs: 100_000 });
      }
      say(op === "si" ? "correcta" : "razonable", op === "si" ? `Ingresas ${eur(SUBLET.pallets * SUBLET.rate)} a la semana por un espacio que ya pagabas, y hoy entra en caja la fianza. Ojo: la fianza no es un ingreso, es una deuda con el subarrendatario (se la devolverás).` : "Guardas el espacio para crecer, pero mientras tanto lo pagas sin usarlo.", ["0625-RA3", "0623-RA5"]);
      return;
    }
    if (d.id === "factoring") {
      let fee = 0;
      if (op === "si") for (const i of c.invoices) if (i.paidAbs === undefined && !i.factored && i.dueAbs > s.abs) { i.factored = true; c.cash = round2(c.cash + i.amount); fee += i.amount * BANK.factoringFee; }
      if (fee) { charge(s, "Comisión del descuento de facturas", fee); s.data.finCost = round2(Number(s.data.finCost) + fee); }
      say(op === "si" ? (c.credit ? "razonable" : "correcta") : "correcta", op === "si" ? `Cobras hoy a cambio de ${eur(fee, 2)} de comisión. Mejora tu caja, no tu beneficio: lo empeora en la comisión. ${c.credit ? "Con la póliza abierta, solo compensa si de verdad la necesitas." : ""}` : `No adelantas nada: tus facturas (${eur(sum(c.invoices.filter((i) => i.paidAbs === undefined && !i.factored && i.dueAbs > s.abs).map((i) => i.amount)))}) se cobrarán a su vencimiento, sin comisión. Si no necesitas la caja hoy, no pagas por tenerla antes; si la necesitaras, compara el ${(BANK.factoringFee * 100).toLocaleString("es-ES")} % con lo que te costaría la póliza.`, ["0623-RA3"]);
    }
  },
  afterWeek(s) {
    // Lo que cuesta el descuento por pronto pago: el 2 % que Bazar deja de pagarte cada semana (para la estrella ★★).
    if (s.data.bazarDiscount) {
      const billed = sum(s.company.invoices.filter((i) => i.client === "bazar" && i.issuedAbs === s.abs).map((i) => i.amount));
      if (billed) s.data.finCost = round2(Number(s.data.finCost) + billed / 0.98 * 0.02);
    }
  },
  stars(s) {
    return [s.status !== "quiebra", financialCost(s) <= FIN_LIMIT, collectionDays(s) <= 40 && !s.company.memory.includes("mal-pagador")];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l3-pronto-pago", topic: "coste del descuento por pronto pago", competences: ["0623-RA3"], prompt: "Un cliente te pagaría a 10 días en vez de a 60 si le haces un 2 % de descuento. ¿Qué tipo anual aproximado te cuesta ese dinero?",
        options: [
          { id: "ok", label: "Alrededor de un 15 %", grade: "correcta", feedback: "Correcto: 2 % por adelantar 50 días → 2 × 365 ÷ 50 ≈ 14,6 % anual. Más caro que muchas pólizas." },
          { id: "dos", label: "Un 2 %", grade: "grave", feedback: "El 2 % es por 50 días, no por un año: anualizado sale cerca del 15 %." },
          { id: "cero", label: "Nada: no pagas intereses", grade: "grave", feedback: "Cobras menos: ese descuento es el precio de tener el dinero antes." },
        ] },
      { id: "l3-mora", topic: "plazos y mora", competences: ["0623-RA5"], prompt: "Un cliente (empresa) no te paga a los 30 días sin haber pactado otro plazo. ¿Qué te corresponde?",
        options: [
          { id: "ok", label: "Intereses de demora desde el vencimiento, sin necesidad de avisar, y 40 € fijos por costes de cobro", grade: "correcta", feedback: "Correcto (Ley 3/2004, arts. 5, 7 y 8): la mora es automática; el interés es el tipo del BCE más 8 puntos y los 40 € se añaden sin pedirlos." },
          { id: "aviso", label: "Nada hasta que le mandes un requerimiento formal", grade: "razonable", feedback: "Reclamar por escrito ayuda a cobrar, pero la mora es automática: no hace falta aviso (art. 5)." },
          { id: "nada", label: "Nada: el plazo lo decide quien paga", grade: "grave", feedback: "No: sin pacto, el plazo es de 30 días, y por pacto nunca más de 60 (art. 4)." },
        ] },
    ];
  },
};

