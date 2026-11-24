import { round2, sum } from "../../../learning/money";
import { annuity, borrow, charge, clientName, debtOutstanding, invest, learn, registerClients, remember } from "../helpers";
import { leadDecisions } from "../leads";
import type { CampaignState, Decision, Grade } from "../model";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 9 · «El banco» (financiación). Un cliente de frío te ofrece un contrato de tres años si montas una cámara
 * frigorífica de 20.000 €. Mecánica nueva: financiar una inversión a largo plazo (préstamo a tipo fijo o variable, un
 * socio, o tu caja), lo que mira el banco (deuda frente a beneficio bruto) y la forma jurídica de tu empresa.
 *
 * Normativa (BOE, leída el 24/11/2026): Ley de Sociedades de Capital (RDLeg 1/2010, consolidada, actualización del
 * 03/01/2025): en la SL los socios «no responderán personalmente de las deudas sociales» (art. 1.2); su capital «no
 * podrá ser inferior a un euro» (art. 4.1) y, mientras no llegue a 3.000 €, se destina a reserva legal al menos el 20 %
 * del beneficio y «los socios responderán solidariamente de la diferencia entre el importe de tres mil euros y la cifra
 * del capital suscrito». El Código Civil (art. 1911, responsabilidad del deudor con todos sus bienes) NO se ha podido
 * leer en el BOE en esta versión y no se cita: del autónomo solo se dice que no tiene la separación del art. 1.2.
 * Tipos, cuotas, umbrales del banco, el socio y la cámara: SIMULADOS.
 *
 * Estrategias válidas: préstamo a tipo fijo con SL; préstamo variable con SL; socio capitalista. La mala: pagarlo con la
 * póliza (dinero a corto para una inversión a largo) y dejar de pagar cuotas.
 */
registerClients({ frio: "Congelados del Turia (ficticia)" });
/**
 * Medido el 24/11/2026: las empresas llegan al nivel 9 con 10.000-23.000 € de caja y una deuda de 0,4-0,7 veces su
 * EBITDA. Con una cámara de 20.000 € no había nada que decidir (se pagaba con la caja); con 45.000 € hace falta
 * financiarla de verdad.
 */
export const COLD = { cost: 45_000, lifeWeeks: 520, pallets: 100, palletRate: 6, opsWeek: 120, startIn: 2, contractWeeks: 156, lateWeeks: 4 };
export const LOANS = { fixed: { rate: 0.07, months: 60 }, variable: { rate: 0.05, months: 60, shock: 0.02 }, partner: { amount: 45_000, share: 40 }, noGuaranteeSpread: 0.015 };
/** Umbral del banco (deuda ÷ EBITDA), caja mínima de la ★★ y costes de constitución y carencia: decisiones documentadas, no medidas. */
export const BANKRULES = { maxRatio: 3, covenant: 3.5, slFees: 600, graceFee: 0.01, minCash: 5_000 };
/** Los tipos de interés llevan 4 decimales (8,5 % = 0,085): round2 los estropearía. */
const rate4 = (v: number) => Math.round(v * 10_000) / 10_000;
const eur = (v: number) => `${Math.round(v).toLocaleString("es-ES")} €`;
const pct = (v: number) => `${String(round2(v * 100)).replace(".", ",")} %`;

/** Beneficio antes de intereses y amortizaciones (EBITDA), anualizado con las últimas 8 semanas. */
export function ebitdaYear(s: CampaignState): number {
  const ls = s.logs.slice(-8);
  if (!ls.length) return 0;
  return round2(sum(ls.map((l) => l.revenue - l.variable - l.fixed - (l.staff ?? 0) - l.other)) * 52 / ls.length);
}
/** Deuda financiera: préstamos, leasing y lo dispuesto de la póliza. */
export const financialDebt = (s: CampaignState) => round2(debtOutstanding(s.company) + Math.max(0, -s.company.cash));
/** Deuda ÷ EBITDA: cuántos años de beneficio bruto harían falta para devolverla. Sin beneficio, infinito. */
export const debtRatio = (s: CampaignState, extra = 0) => { const e = ebitdaYear(s); const d = financialDebt(s) + extra; return d <= 0 ? 0 : e <= 0 ? Infinity : round2(d / e); };
const fmtRatio = (r: number) => (Number.isFinite(r) ? r.toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "sin beneficio");

function fund(s: CampaignState) {
  invest(s, COLD.cost, COLD.lifeWeeks);
  s.data.funded = true;
  s.company.deals.push({ id: "l9-frio", client: "frio", kind: "almacen", pallets: COLD.pallets, palletRate: COLD.palletRate, payWeeks: 4, fromAbs: s.abs + COLD.startIn, toAbs: s.abs + COLD.startIn + COLD.contractWeeks - 1, missed: 0, external: true });
}
const loan = (s: CampaignState) => (s.company.loans ?? []).find((l) => l.id === "l9-prestamo");

export const LEVEL9: LevelDef = {
  n: 9, act: 3, actTitle: "Crecimiento", type: "Financiación", title: "El banco", weeks: 8,
  briefing: `${clientName("frio")} te ofrece tres años de contrato para guardar ${COLD.pallets} palés de congelado si montas una cámara frigorífica: ${eur(COLD.cost)}. No los tienes. Toca hablar con el banco, o con alguien que ponga el dinero.`,
  mechanic: "Financiación: eliges cómo pagar una inversión a largo plazo y con qué forma jurídica. El banco mira cuántos años de beneficio bruto te costaría devolver tu deuda; un tipo variable puede subir.",
  objectives: ["Poner en marcha la cámara de frío sin quebrar y sin dejar de pagar una cuota.", `Acabar con al menos ${eur(BANKRULES.minCash)} en caja y una deuda de como mucho ${BANKRULES.maxRatio} veces tu beneficio bruto anual.`, "Que tu patrimonio personal quede separado del de la empresa: SL con 3.000 € de capital y sin aval personal."],
  strategies: ["Constituir una SL y pedir un préstamo a tipo fijo.", "Constituir una SL y pedir un préstamo a tipo variable, con colchón por si sube.", "Dar entrada a un socio que ponga el dinero a cambio de una parte."],
  concepts: ["responsabilidad-limitada", "fijo-variable", "deuda-ebitda", "plazo-financiacion"],
  keyDecisions: ["forma", "financiar", "aval", "cuota"],
  start(s) { s.data.ratio0 = Number.isFinite(debtRatio(s)) ? debtRatio(s) : -1; },
  decisionsAt(s) {
    const out: Decision[] = [];
    const c = s.company;
    if (s.week === 1 && !c.legal) out.push({ id: "forma", key: true, title: "¿Sigues como autónomo o constituyes una sociedad?",
      prompt: `Hasta ahora la empresa eres tú: trabajas como autónomo. Vas a firmar deudas de más de ${eur(COLD.cost)}. Constituir una sociedad limitada cuesta unos ${eur(BANKRULES.slFees)} de notaría y registro.`,
      hint: "¿Quién responde de las deudas de la empresa si las cosas van mal: la empresa o tú? ¿Cuánto capital mínimo pide una SL y qué pasa si pones menos de 3.000 €?",
      options: [
        { id: "sl-3000", label: "Constituir una SL con 3.000 € de capital" },
        { id: "sl-1", label: "Constituir una SL con 1 € de capital", detail: "La ley lo permite." },
        { id: "autonomo", label: "Seguir como autónomo" },
      ] });
    if (s.week === 1) {
      const r = debtRatio(s, COLD.cost);
      out.push({ id: "financiar", key: true, title: `Cómo pagas la cámara de ${eur(COLD.cost)}`, data: { ratio: Number.isFinite(r) ? r : -1 },
        prompt: `Tu beneficio bruto (EBITDA) va a un ritmo de ${eur(ebitdaYear(s))} al año y debes ${eur(financialDebt(s))}. Con el préstamo, tu deuda sería ${fmtRatio(r)} veces tu EBITDA; el banco pide como mucho ${BANKRULES.maxRatio} veces o un aval. Caja: ${eur(c.cash)}${c.credit ? `, póliza de ${eur(c.credit.limit)}` : ""}. La cámara te dejará unos ${eur((COLD.pallets * COLD.palletRate - COLD.opsWeek) * 52)} al año.`,
        hint: "Una inversión que dura diez años se paga mejor con dinero a largo plazo. ¿Qué pasa con tu cuota si sube el Euríbor? ¿Y qué cuesta un socio que no cobra intereses?",
        options: [
          { id: "fijo", label: `Préstamo a tipo fijo: ${pct(LOANS.fixed.rate)} a 5 años`, detail: `Cuota de ${eur(annuity(COLD.cost, LOANS.fixed.rate, LOANS.fixed.months))} al mes, siempre la misma.` },
          { id: "variable", label: `Préstamo a tipo variable: hoy ${pct(LOANS.variable.rate)} (Euríbor + diferencial) a 5 años`, detail: `Cuota de ${eur(annuity(COLD.cost, LOANS.variable.rate, LOANS.variable.months))} al mes mientras no cambie el Euríbor.` },
          { id: "socio", label: `Un socio pone ${eur(LOANS.partner.amount)} a cambio del ${LOANS.partner.share} % de tu empresa`, detail: "Sin cuotas ni intereses. Necesita una sociedad." },
          { id: "caja", label: "Pagarla con tu caja y la póliza" },
          { id: "renunciar", label: "Renunciar al contrato" },
        ] });
    }
    if (s.week === 6 && loan(s)) out.push({ id: "cuota", key: true, title: `${clientName("frio")} te paga tarde`,
      prompt: `${clientName("frio")} retrasa sus pagos ${COLD.lateWeeks} semanas y la cuota del préstamo (${eur(loan(s)!.monthly)}) vence pronto. Tienes ${eur(c.cash)} en caja.`,
      hint: "Una cuota impagada no se olvida: genera intereses de demora y el banco deja de fiarse. Si el problema es pasajero, ¿qué puedes negociar antes de que llegue?",
      options: [
        { id: "pagar", label: "Pagarla con la caja (y la póliza, si hace falta)" },
        { id: "carencia", label: `Pedir al banco tres meses de carencia (comisión del ${pct(BANKRULES.graceFee)})` },
        { id: "impagar", label: "No pagar este mes y ya se verá" },
      ] });
    out.push(...leadDecisions(s), ...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    const say = (grade: Grade, feedback: string, competences = ["0623-RA3", "0623-RA7"]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: true });
    const constitute = (capital: number) => { c.legal = { form: "sl", capital }; charge(s, "Constitución de la sociedad (notaría y registro, importe simulado)", BANKRULES.slFees); };
    if (d.id === "forma") {
      if (op === "sl-3000") { constitute(3_000); say("correcta", "En la SL, los socios no responden personalmente de las deudas sociales (Ley de Sociedades de Capital, art. 1.2): si la empresa no puede pagar, tu casa no está en juego, salvo que firmes un aval. Con 3.000 € de capital no se aplican las reglas especiales del art. 4.", ["0623-RA2", "0623-RA3"]); }
      if (op === "sl-1") { constitute(1); say("razonable", "Es legal: el capital de una SL no puede ser inferior a un euro (art. 4.1). Pero mientras no llegue a 3.000 €, tienes que destinar a reserva legal al menos el 20 % del beneficio y los socios responden solidariamente de la diferencia hasta 3.000 € (art. 4). Ahorras poco y te limitas.", ["0623-RA2", "0623-RA3"]); }
      if (op === "autonomo") { remember(s, "autonomo"); say("razonable", "Es más sencillo y barato, pero no hay una sociedad entre las deudas del negocio y tu patrimonio: la limitación de responsabilidad que da la SL (Ley de Sociedades de Capital, art. 1.2) no existe para el autónomo. Antes de endeudarte mucho, es lo primero que se mira.", ["0623-RA2", "0623-RA3"]); }
      return;
    }
    if (d.id === "financiar") {
      s.data.funding = op;
      const ratio = Number(d.data!.ratio);
      if (op === "fijo" || op === "variable") {
        // Política del banco (simulada): a una empresa pequeña le pide aval personal del socio, o un tipo más alto sin él.
        // Al autónomo no: el préstamo ya lo firma él.
        if (c.legal) { s.pending.unshift({ id: "aval", key: true, title: "El banco te pide un aval personal", prompt: `Tu deuda sería ${Number(d.data!.ratio) < 0 ? "mayor que lo que ganas en un año" : `${fmtRatio(Number(d.data!.ratio))} veces tu EBITDA`}. Para una empresa de tu tamaño, el banco pide que avales tú personalmente; sin aval, sube el tipo ${pct(LOANS.noGuaranteeSpread)}.`, hint: "Un aval personal hace que respondas tú si la sociedad no paga. ¿Cuánto vale tener tu patrimonio separado? ¿Hay otra forma de financiarte?",
          options: [{ id: "firmar", label: "Firmar el aval" }, { id: "sin-aval", label: `Sin aval, con el tipo ${pct(LOANS.noGuaranteeSpread)} más alto` }, { id: "socio", label: "Buscar un socio en su lugar" }, { id: "renunciar", label: "Renunciar al contrato" }] }); return; }
        takeLoan(s, op);
        say("razonable", `${op === "fijo" ? "Cuota fija: sabes lo que pagarás cinco años." : "Pagas menos hoy, con el riesgo de que suba el Euríbor."} Pero como autónomo no hay una sociedad entre esta deuda y tus bienes: si el negocio no paga, la deuda es tuya (la separación del art. 1.2 de la Ley de Sociedades de Capital es solo para las sociedades).`);
        return;
      }
      if (op === "socio") { partner(s); say("correcta", `Financias con capital, no con deuda: no hay cuotas ni intereses y tu ratio de deuda no empeora. A cambio cedes el ${LOANS.partner.share} % de la empresa: de cada euro que gane a partir de ahora, una parte es suya. Es el dinero más caro si la empresa va bien.`); return; }
      if (op === "caja") {
        fund(s);
        const left = c.cash + (c.credit?.limit ?? 0);
        say(left < 3_000 ? "grave" : "razonable", left < 3_000 ? `Una cámara que dura diez años pagada con la caja del día a día y la póliza: te quedan ${eur(left)} de margen para sueldos, gasóleo y cuotas. Financiar a largo plazo con dinero a corto deja la empresa sin fondo de maniobra.` : "Puedes permitírtelo sin deuda nueva, pero te quedas con menos colchón para imprevistos. Lo habitual es financiar una inversión larga con dinero a largo plazo.");
        return;
      }
      if (op === "renunciar") { remember(s, "renuncio-frio"); say("grave", `La cámara te dejaría unos ${eur((COLD.pallets * COLD.palletRate - COLD.opsWeek) * 52)} al año durante tres años y se paga en algo más de un año. Una inversión rentable que se deja pasar por no saber financiarla es una oportunidad perdida.`); }
      return;
    }
    if (d.id === "aval") {
      const kind = String(s.data.funding) as "fijo" | "variable";
      const choice = kind === "fijo" ? "Cuota fija: sabes lo que pagarás cinco años." : "Pagas menos hoy, pero si sube el Euríbor sube tu cuota: necesitas margen para aguantarlo.";
      if (op === "firmar") { c.legal!.avalPersonal = true; takeLoan(s, kind);
        say("razonable", `${choice} Con el aval respondes tú de esta deuda aunque tengas una SL: la separación de patrimonios del art. 1.2 de la Ley de Sociedades de Capital no protege lo que avalas personalmente.`, ["0623-RA2", "0623-RA3"]); }
      if (op === "sin-aval") { takeLoan(s, kind, LOANS.noGuaranteeSpread);
        say("correcta", `${choice} Pagas más tipo porque el banco asume más riesgo: es el precio de que tu patrimonio personal quede fuera. Financias a largo plazo una inversión que dura años.`, ["0623-RA2", "0623-RA3"]); }
      if (op === "socio") { s.data.funding = "socio"; partner(s); say("correcta", `Financias con capital, no con deuda: sin cuotas ni intereses y sin aval. A cambio cedes el ${LOANS.partner.share} % de la empresa: de lo que gane a partir de ahora, una parte es suya.`); }
      if (op === "renunciar") { s.data.funding = "renunciar"; remember(s, "renuncio-frio"); say("razonable", "Prudente si no ves claro devolverlo, pero dejas pasar una inversión rentable que podías financiar sin aval (pagando algo más) o con un socio."); }
      return;
    }
    if (d.id === "cuota") {
      const l = loan(s)!;
      if (op === "pagar") say("correcta", "La cuota se paga: el retraso del cliente es tu problema, no el del banco. Para eso está la póliza: cubrir desfases de caja pasajeros.");
      if (op === "carencia") { charge(s, "Comisión por la carencia del préstamo (simulada)", round2(l.principal * BANKRULES.graceFee)); l.nextAbs += 12; s.data.grace = true;
        say("correcta", "Negociar antes de impagar es lo correcto: durante la carencia no pagas cuota (en la realidad los intereses siguen corriendo; el juego lo simplifica aplazando la cuota). Te cuesta una comisión, pero el banco sigue confiando en ti."); }
      if (op === "impagar") { s.data.missedPayment = true; l.missed = (l.missed ?? 0) + 1; l.nextAbs += 4; l.annualRate = rate4(l.annualRate + 0.02); l.monthly = annuity(l.principal, l.annualRate, l.monthsLeft); remember(s, "impago-banco");
        say("grave", "Una cuota impagada genera intereses de demora y el banco te sube el coste de toda la deuda (en el juego, 2 puntos más: simulado). Además, quedará en tu historial y la próxima vez te costará conseguir financiación."); }
    }
  },
  beforeClose(s) {
    if (s.data.funded && s.abs >= Number(s.company.deals.find((d) => d.id === "l9-frio")?.fromAbs ?? Infinity)) charge(s, "Electricidad y mantenimiento de la cámara de frío", COLD.opsWeek);
  },
  afterWeek(s, notes) {
    if (s.week === 5) { const l = loan(s); if (l?.variable) { l.annualRate = rate4(l.annualRate + LOANS.variable.shock); l.monthly = annuity(l.principal, l.annualRate, l.monthsLeft); notes.push(`Sube el Euríbor: tu préstamo pasa al ${pct(l.annualRate)} y la cuota a ${eur(l.monthly)} al mes.`); } }
    if (s.week === 5 && s.data.funded) s.data.late_frio = COLD.lateWeeks;
    if (s.week === 8) { const r = debtRatio(s); s.data.ratioEnd = Number.isFinite(r) ? r : -1; if (loan(s) && (r > BANKRULES.covenant || !Number.isFinite(r))) notes.push(`Tu deuda es ${fmtRatio(r)} veces tu EBITDA: el banco revisará tus condiciones.`); }
  },
  stars(s) {
    const ok = s.status !== "quiebra";
    const r = Number(s.data.ratioEnd ?? -1);
    const c = s.company;
    return [ok && !!s.data.funded && !s.data.missedPayment, ok && !!s.data.funded && r >= 0 && r <= BANKRULES.maxRatio && c.cash >= BANKRULES.minCash, ok && c.legal?.form === "sl" && c.legal.capital >= 3_000 && !c.legal.avalPersonal];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l9-sl", topic: "responsabilidad en la SL", competences: ["0623-RA2"], prompt: "Una SL con 3.000 € de capital no puede pagar un préstamo. Su socio único no firmó ningún aval. ¿Responde con su casa?",
        options: [
          { id: "ok", label: "No: los socios de una SL no responden personalmente de las deudas sociales", grade: "correcta", feedback: "Correcto: Ley de Sociedades de Capital, art. 1.2. Si hubiera firmado un aval, respondería como avalista." },
          { id: "si", label: "Sí, siempre responde el dueño", grade: "grave", feedback: "Es justo lo que evita la sociedad de capital (art. 1.2), salvo que se haya avalado personalmente." },
          { id: "capital", label: "Solo hasta 3.000 €", grade: "razonable", feedback: "La regla de responder hasta 3.000 € es para SL con menos de 3.000 € de capital (art. 4); con 3.000 € ya no se aplica." },
        ] },
      { id: "l9-variable", topic: "tipo fijo o variable", competences: ["0623-RA3"], prompt: "¿Cuándo tiene sentido un préstamo a tipo variable?",
        options: [
          { id: "ok", label: "Cuando puedes aguantar una subida de la cuota y crees que los tipos no van a subir mucho", grade: "correcta", feedback: "Correcto: el variable suele empezar más barato y traslada el riesgo de tipos a ti." },
          { id: "siempre", label: "Siempre, porque es más barato", grade: "grave", feedback: "Es más barato al principio; si sube el Euríbor, puede salir más caro que el fijo." },
          { id: "nunca", label: "Nunca", grade: "razonable", feedback: "Puede convenir si tienes margen y los tipos bajan o se mantienen." },
        ] },
    ];
  },
};

function takeLoan(s: CampaignState, kind: "fijo" | "variable", spread = 0) {
  const t = kind === "fijo" ? LOANS.fixed : LOANS.variable;
  borrow(s, { id: "l9-prestamo", label: "el préstamo de la cámara", kind: "prestamo", amount: COLD.cost, annualRate: rate4(t.rate + spread), months: t.months, ...(kind === "variable" ? { variable: true } : {}) });
  fund(s);
}
function partner(s: CampaignState) {
  const c = s.company;
  if (!c.legal) { c.legal = { form: "sl", capital: 3_000 }; charge(s, "Constitución de la sociedad para que entre el socio (importe simulado)", BANKRULES.slFees); }
  c.cash = round2(c.cash + LOANS.partner.amount); c.capital = round2(c.capital + LOANS.partner.amount);
  c.partnerShare = Math.min(90, c.partnerShare + LOANS.partner.share);
  remember(s, "socio-frio");
  fund(s);
}
