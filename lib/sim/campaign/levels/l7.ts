import { round2, sum } from "../../../learning/money";
import { stream } from "../../rng";
import { activeDeals, activeStaff, charge, clientName, learn, personWeekly, relate, remember, variablePerKm } from "../helpers";
import { leadDecisions } from "../leads";
import type { CampaignState, Deal, Decision, Grade } from "../model";
import { LABOR } from "../params";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 7 · «Llega la competencia» (estrategia comercial). Una empresa nueva entra en tu zona con precios un 15 % por
 * debajo de los tuyos. Mecánica nueva: cada cliente puede irse con ella cada semana; la probabilidad sube con la
 * diferencia de precio y baja con tu relación con él y con tu servicio. Cómo respondes decide a quién conservas y a
 * qué precio.
 *
 * Normativa (BOE, leída el 24/11/2026):
 * - Ley 15/2007, de Defensa de la Competencia (consolidada, actualización del 28/12/2023), art. 1.1: se prohíbe todo
 *   acuerdo entre competidores que tenga por objeto «la fijación, de forma directa o indirecta, de precios» (a) o «el
 *   reparto del mercado» (c); las infracciones muy graves (entre ellas, las conductas del art. 1: art. 62.4.a) se
 *   multan con «hasta el 10 por ciento del volumen de negocios total mundial» del ejercicio anterior (art. 63.1.c). La
 *   multa del juego es SIMULADA (dentro de ese máximo); el procedimiento, simplificado.
 * - Ley 3/1991, de Competencia Desleal (consolidada, actualización del 27/12/2025), art. 17: «la fijación de precios es
 *   libre» (17.1); la venta bajo coste se reputa desleal en tres casos, entre ellos cuando «forme parte de una
 *   estrategia encaminada a eliminar a un competidor» (17.2.c).
 * La empresa rival, sus precios, las probabilidades y los importes: SIMULADOS.
 *
 * Estrategias válidas: diferenciarse por servicio; fidelizar con contratos de permanencia; bajar precios con cabeza.
 * La mala: pactar precios con el rival.
 */
const RIVAL = "TransRápido Levante (ficticia)";
export const COMPETITION = {
  /** Cuánto más barato entra el rival, y cuánto tras subir precios (no cubría costes) o al responder a tu bajada. */
  cut: { entry: 0.15, after: 0.03, war: 0.22 },
  /** Probabilidad semanal de perder un cliente = K × diferencia de precio × (1,5 − relación/100) × factor de servicio. */
  churnK: 0.6,
  serviceWeekly: 250, serviceFactor: 0.4, serviceRelation: 10,
  warCut: 0.12, war2Cut: 0.1,
  contractDiscount: 0.05, contractWeeks: 52, contractAccept: 0.6,
  fine: 4_000,
};
const eur = (v: number) => `${Math.round(v).toLocaleString("es-ES")} €`;
const rate2 = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Clientes de transporte que la competencia puede quitarte: fijos, sin plazo cerrado ni permanencia vigente. */
const exposed = (s: CampaignState) => activeDeals(s.company, s.abs).filter((d) => d.kind === "transporte" && d.client !== "urgentes" && d.toAbs === undefined && !((d.lockedUntilAbs ?? 0) >= s.abs));
const weeklyValue = (d: Deal) => round2(d.km! * d.rate!);
const initialIds = (s: CampaignState) => String(s.data.initial ?? "").split(",").filter(Boolean);
/** Facturación semanal que conservas de los clientes que tenías al empezar el nivel. */
export const retainedShare = (s: CampaignState) => {
  const ids = new Set(initialIds(s));
  const now = sum(activeDeals(s.company, s.abs).filter((d) => ids.has(d.id)).map(weeklyValue));
  return Number(s.data.initialRevenue) > 0 ? round2(now / Number(s.data.initialRevenue)) : 1;
};
const rivalRate = (s: CampaignState, d: Deal) => round2(Number(s.data[`orig_${d.id}`] ?? d.rate) * (1 - Number(s.data.rivalCut)));
/** Probabilidad de que un cliente se vaya esta semana. */
export function churnChance(s: CampaignState, d: Deal): number {
  if (s.data.pact && !s.data.caught) return 0;
  const gap = Math.max(0, (d.rate! - rivalRate(s, d)) / d.rate!);
  const rel = s.company.relation[d.client] ?? 50;
  return Math.min(0.9, COMPETITION.churnK * gap * (1.5 - rel / 100) * (s.data.response === "servicio" ? COMPETITION.serviceFactor : 1));
}
const endingTemporaries = (s: CampaignState) => activeStaff(s.company).filter((p) => p.contract === "temporal" && p.role === "conductor" && p.endAbs !== undefined && p.endAbs < s.abs + 8);
const biggest = (s: CampaignState) => [...exposed(s)].filter((d) => !d.sub).sort((a, b) => weeklyValue(b) - weeklyValue(a) || a.id.localeCompare(b.id))[0];
const lose = (s: CampaignState, d: Deal, notes: string[], why: string) => {
  d.ended = true; d.toAbs = s.abs;
  s.data.lost = `${s.data.lost ? `${s.data.lost},` : ""}${d.id}`;
  notes.push(`${clientName(d.client)} se va con ${RIVAL}: ${why}.`);
};
/** Probabilidad de que el cliente atacado se quede si defiendes el valor de tu servicio sin bajar el precio. */
export const defendChance = (s: CampaignState, d: Deal) => Math.min(0.95, 0.35 + (s.company.relation[d.client] ?? 50) / 200 + (s.data.response === "servicio" ? 0.25 : 0) + (s.company.reputation.fiabilidad >= 90 ? 0.1 : 0));

export const LEVEL7: LevelDef = {
  n: 7, act: 2, actTitle: "Consolidación", type: "Estrategia comercial", title: "Llega la competencia", weeks: 8,
  briefing: `${RIVAL} abre en tu zona con precios un 15 % por debajo de los tuyos y empieza a llamar a tus clientes. Puedes perderlos uno a uno. ¿Bajas precios, compites por servicio o los atas con contratos?`,
  mechanic: "Competencia: cada semana cada cliente puede irse con el rival. Cuanto más cara seas y peor sea la relación, más probable. Tu respuesta cambia esas probabilidades y lo que ganas con cada cliente.",
  objectives: ["Conservar al menos el 70 % de la facturación semanal de tus clientes, sin quebrar y sin saltarte la ley.", "Que el resultado del nivel sea positivo.", "Perder como mucho un cliente y acabar con la fiabilidad en 90 o más."],
  strategies: ["Diferenciarte por servicio: seguimiento, ventanas horarias, un interlocutor fijo.", "Fidelizar con contratos de permanencia a cambio de un pequeño descuento.", "Bajar precios, con cuidado de no vender por debajo de tu coste."],
  concepts: ["competencia-precios", "carteles", "fidelizacion", "propuesta-valor"],
  keyDecisions: ["respuesta", "ataque", "guerra2", "recuperar"],
  start(s) {
    const ds = exposed(s);
    s.data.initial = ds.map((d) => d.id).join(",");
    s.data.initialRevenue = round2(sum(ds.map(weeklyValue)));
    for (const d of ds) s.data[`orig_${d.id}`] = d.rate!;
    s.data.rivalCut = COMPETITION.cut.entry; s.data.lost = "";
  },
  decisionsAt(s) {
    const out: Decision[] = [];
    if (s.week === 1) {
      const v = variablePerKm(s.company);
      out.push({ id: "respuesta", key: true, title: `Cómo respondes a ${RIVAL}`,
        prompt: `Tienes ${initialIds(s).length} clientes de reparto expuestos que te facturan ${eur(Number(s.data.initialRevenue))} a la semana. El rival les ofrece un 15 % menos. Tu coste variable es de ${rate2(v)} €/km, sin contar la furgoneta, la nave ni la plantilla.`,
        hint: "Un cliente que se queda solo por precio se irá con el siguiente que baje más. ¿Qué tienes tú que no tenga el rival? ¿Y qué no puedes hacer nunca con un competidor?",
        options: [
          { id: "servicio", label: "Competir por servicio", detail: `Seguimiento de envíos, ventanas horarias e interlocutor fijo: ${COMPETITION.serviceWeekly} € a la semana. Mejora la relación con todos.` },
          { id: "contratos", label: "Ofrecer contratos de permanencia", detail: `Un año sin poder irse a cambio de un ${COMPETITION.contractDiscount * 100} % de descuento. No todos firman.` },
          { id: "guerra", label: "Bajar tus precios un 12 %", detail: "A todos los clientes expuestos, desde esta semana." },
          { id: "pacto", label: "Proponer al rival repartiros los clientes y no bajar precios", detail: "Su gerente te ha dejado caer que «hay sitio para los dos»." },
        ] });
    }
    // Un conductor temporal del nivel 4 cuyo contrato acaba en este nivel: si no decides, se va y pierdes su capacidad.
    if (s.week === 1) for (const p of endingTemporaries(s)) out.push({ id: `renovar-${p.id}`, key: false, title: `El contrato de ${p.name} acaba en la semana ${p.endAbs! - s.abs + 1}`, data: { person: p.id },
      prompt: `${p.name} lleva casi seis meses con contrato temporal y hace ${p.kmBonus ?? 0} km a la semana más con la furgoneta. Te cuesta ${eur(personWeekly(p))} a la semana.`,
      hint: "¿Cuánto puede durar un contrato por circunstancias de la producción? Si sigues necesitando a la persona, ¿es temporal la necesidad?",
      options: [{ id: "indefinido", label: "Hacerle un contrato indefinido" }, { id: "acabar", label: "Dejar que el contrato acabe" }] });
    if (s.week === 3 && !s.data.pact) {
      const d = biggest(s);
      if (d) {
        const p = defendChance(s, d);
        out.push({ id: "ataque", key: true, title: `${RIVAL} va a por ${clientName(d.client)}`, data: { deal: d.id, p: round2(p) },
          prompt: `Tu cliente más grande expuesto (${d.km} km a la semana a ${rate2(d.rate!)} €/km, ${eur(weeklyValue(d))} a la semana) tiene una oferta del rival a ${rate2(rivalRate(s, d))} €/km. Te pide que la iguales.`,
          hint: `Calcula lo que te deja cada km a cada precio después del coste variable (${rate2(variablePerKm(s.company))} €/km). ¿Qué te diferencia? ¿Cuánto cuesta conseguir un cliente nuevo que lo sustituya?`,
          options: [
            { id: "igualar", label: `Igualar su precio (${rate2(rivalRate(s, d))} €/km)` },
            { id: "valor", label: "Mantener el precio y defender tu servicio", detail: "Reunión con su jefe de logística: tus datos de puntualidad, tus incidencias resueltas." },
            { id: "dejar", label: "Dejarlo ir y usar esa capacidad en otros clientes" },
          ] });
      }
    }
    if (s.week === 5 && s.data.response === "guerra") out.push({ id: "guerra2", key: true, title: `${RIVAL} responde bajando más`,
      prompt: "Has bajado un 12 % y el rival ha bajado otra vez: ahora va un 22 % por debajo de tus precios de antes. Tus clientes vuelven a llamarte.",
      hint: "Bajar precios es libre, pero ¿hasta dónde? Compara tu precio con tu coste completo por km, no solo con el variable. ¿Quién aguanta más una guerra de precios?",
      options: [
        { id: "bajar", label: "Bajar otro 10 %" },
        { id: "parar", label: "Parar aquí y pasar a competir por servicio", detail: `${COMPETITION.serviceWeekly} € a la semana desde ahora.` },
        { id: "mantener", label: "Mantener el precio que tienes" },
      ] });
    if (s.week === 6 && s.data.rivalUp && String(s.data.lost)) {
      const n = String(s.data.lost).split(",").length;
      out.push({ id: "recuperar", key: true, title: "Los clientes que se fueron están descontentos",
        prompt: `${RIVAL} ha subido sus precios: los de lanzamiento no le cubrían costes. ${n === 1 ? "El cliente que perdiste te llama" : `${n} de los clientes que perdiste te llaman`} para volver.`,
        hint: "Recuperar un cliente que ya te conoce suele costar menos que conseguir uno nuevo. ¿A qué precio? ¿Te cabe?",
        options: [{ id: "si", label: "Ofrecerles volver con un 5 % de descuento durante tres meses" }, { id: "precio", label: "Que vuelvan a tu precio de siempre" }, { id: "no", label: "No: ya has llenado esa capacidad" }] });
    }
    out.push(...leadDecisions(s), ...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    const say = (grade: Grade, feedback: string, competences = ["0623-RA1", "0622-RA2"]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: true });
    if (d.id.startsWith("renovar-")) {
      const p = (c.staff ?? []).find((x) => x.id === d.data!.person)!;
      if (op === "indefinido") { p.contract = "indefinido"; delete p.endAbs; }
      else { const years = (p.endAbs! - p.startAbs + 1) / 52; charge(s, `Indemnización por fin de contrato de ${p.name} (12 días por año)`, round2(p.salaryMonthly / 30 * LABOR.endOfTemporaryDays * years)); }
      learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade: op === "indefinido" ? "correcta" : "razonable", competences: ["0625-RA2"], key: false,
        feedback: op === "indefinido" ? "El contrato por circunstancias de la producción dura como mucho 6 meses (Estatuto de los Trabajadores, art. 15.2): si el trabajo sigue, la necesidad no era temporal y lo que toca es un indefinido. Además cotiza menos por desempleo." : `Al acabar le pagas 12 días de salario por año trabajado (art. 49.1.c) y pierdes ${p.kmBonus ?? 0} km de capacidad a la semana: comprueba que no fallas a ningún cliente.` });
      return;
    }
    if (d.id === "respuesta") {
      s.data.response = op;
      if (op === "servicio") { for (const x of exposed(s)) relate(s, x.client, COMPETITION.serviceRelation); remember(s, "servicio-diferenciado");
        say("correcta", `Compites en lo que el rival recién llegado no puede copiar rápido: fiabilidad y trato. Cuesta ${COMPETITION.serviceWeekly} € a la semana, pero la probabilidad de que un cliente se vaya baja a menos de la mitad.`); }
      if (op === "contratos") {
        const r = stream(s.seed, s.abs, "campana-l7-contratos");
        let signed = 0;
        for (const x of exposed(s)) if (r() < COMPETITION.contractAccept + ((c.relation[x.client] ?? 50) - 50) / 200) { x.rate = round2(x.rate! * (1 - COMPETITION.contractDiscount)); x.lockedUntilAbs = s.abs + COMPETITION.contractWeeks - 1; signed++; }
        s.data.signed = signed;
        say("correcta", `Firman ${signed} de ${initialIds(s).length}. Un contrato de permanencia sube el coste de cambiar de proveedor: el cliente no se puede ir aunque le ofrezcan menos. A cambio cedes un ${COMPETITION.contractDiscount * 100} % y quien no firma sigue expuesto.`);
      }
      if (op === "guerra") { for (const x of exposed(s)) x.rate = round2(x.rate! * (1 - COMPETITION.warCut));
        say("razonable", "Fijar tus precios es libre (Ley 3/1991, de Competencia Desleal, art. 17.1) y casi nadie se irá por precio. Pero pierdes un 12 % de margen con TODOS, también con los que no pensaban irse, y el rival puede responder bajando más."); }
      if (op === "pacto") { s.data.pact = true; s.data.rivalCut = 0; remember(s, "cartel");
        say("grave", "Es un cártel: la Ley de Defensa de la Competencia prohíbe los acuerdos entre competidores para fijar precios o repartirse el mercado (Ley 15/2007, art. 1.1, letras a y c). Da igual que la empresa sea pequeña o que «nadie se entere»: es una infracción muy grave, con multa de hasta el 10 % del volumen de negocios (art. 63.1.c), y te expones a perder la reputación.", ["0623-RA1"]); }
      return;
    }
    if (d.id === "ataque") {
      const deal = c.deals.find((x) => x.id === d.data!.deal)!;
      const p = Number(d.data!.p);
      const margin = (rate: number) => round2(rate - variablePerKm(c));
      if (op === "igualar") { const before = deal.rate!; deal.rate = rivalRate(s, deal); relate(s, deal.client, 5);
        say("razonable", `Lo conservas, pero cada km te deja ${rate2(margin(deal.rate))} € en vez de ${rate2(margin(before))} € antes del resto de costes, y le enseñas que presionar funciona: lo volverá a hacer.`); }
      if (op === "valor") {
        const stays = stream(s.seed, s.abs, "campana-l7-ataque")() < p;
        s.data.attackOutcome = stays ? "se-queda" : "se-va";
        if (stays) relate(s, deal.client, 10); else s.data.attackLeaves = deal.id;
        say(p >= 0.6 ? "correcta" : "razonable", `Con tu relación con él y tu servicio, tenías un ${Math.round(p * 100)} % de que se quedara sin bajar el precio. ${stays ? "Se queda: valora más tu fiabilidad que 15 céntimos por km." : "Se va: el precio pesó más. Con más relación o mejor servicio la probabilidad habría sido mayor."}`);
      }
      if (op === "dejar") { s.data.attackLeaves = deal.id;
        say(deal.rate! < 0.9 ? "correcta" : "razonable", deal.rate! < 0.9 ? `Era un cliente barato (${rate2(deal.rate!)} €/km): liberas ${deal.km} km para encargos y clientes mejor pagados.` : `Liberas ${deal.km} km, pero le cobrabas bien (${rate2(deal.rate!)} €/km): sustituirlo exige encontrar clientes nuevos, y eso cuesta tiempo.`); }
      return;
    }
    if (d.id === "guerra2") {
      if (op === "bajar") { for (const x of exposed(s)) x.rate = round2(x.rate! * (1 - COMPETITION.war2Cut));
        say("grave", "Ya cobras alrededor de un 21 % menos que al empezar: muchos de tus km no cubren su parte de la furgoneta, la nave y la plantilla. Y bajar de coste para echar a un competidor puede ser competencia desleal (Ley 3/1991, art. 17.2.c). En una guerra de precios gana quien tiene más caja, no quien tiene razón."); }
      if (op === "parar") { s.data.response = "servicio"; for (const x of exposed(s)) relate(s, x.client, COMPETITION.serviceRelation);
        say("correcta", "Sales de la guerra antes de que te arruine y compites en lo que el rival no puede bajar: el servicio."); }
      if (op === "mantener") say("razonable", "Conservas el margen que te queda, pero tus clientes vuelven a tener un 10 % de diferencia con el rival: alguno se irá.");
      return;
    }
    if (d.id === "recuperar") {
      const r = stream(s.seed, s.abs, "campana-l7-vuelta");
      let back = 0;
      for (const id of String(s.data.lost).split(",")) {
        const old = c.deals.find((x) => x.id === id)!;
        if (op === "no" || r() >= (op === "si" ? 0.8 : 0.45)) continue;
        c.deals.push({ ...old, id: `${old.id}-vuelve`, rate: round2(Number(s.data[`orig_${old.id}`] ?? old.rate) * (op === "si" ? 0.95 : 1)), fromAbs: s.abs + 1, toAbs: undefined, ended: undefined, missed: 0 });
        back++;
      }
      s.data.back = back;
      say(op === "no" ? "razonable" : "correcta", op === "no" ? "Si de verdad has llenado esa capacidad, bien; si no, recuperar a quien ya te conoce cuesta menos que buscar clientes nuevos." : `Vuelven ${back}. Un cliente que ya conoce tu servicio y ha probado el del rival es el más fácil de recuperar.${op === "si" ? " El descuento temporal lo facilita." : ""}`);
    }
  },
  beforeClose(s, notes) {
    // El cártel se descubre en la semana 4 (antes del cierre, para que la multa cuente en esta semana).
    if (s.week === 4 && s.data.pact) {
      s.data.caught = true; s.data.rivalCut = COMPETITION.cut.entry;
      charge(s, "Multa por acuerdo de precios con un competidor (importe simulado)", COMPETITION.fine);
      s.company.reputation.fiabilidad = Math.max(0, s.company.reputation.fiabilidad - 25);
      for (const d of exposed(s)) relate(s, d.client, -20);
      notes.push("Un cliente denuncia el acuerdo con el rival ante la autoridad de competencia: expediente, multa y tus clientes ya no se fían. El rival vuelve a bajar precios.");
    }
    if (s.data.response === "servicio") charge(s, "Servicio diferenciado (seguimiento, ventanas horarias)", COMPETITION.serviceWeekly);
  },
  afterWeek(s, notes) {
    const r = stream(s.seed, s.abs, "campana-l7-fuga");
    if (s.data.attackLeaves) { const d = s.company.deals.find((x) => x.id === s.data.attackLeaves); if (d && !d.ended) lose(s, d, notes, "ha aceptado su oferta"); s.data.attackLeaves = ""; }
    if (s.week >= 2) for (const d of exposed(s)) if (r() < churnChance(s, d)) lose(s, d, notes, `le ofrece ${rate2(rivalRate(s, d))} €/km`);
    if (s.week === 4 && !s.data.pact) {
      if (s.data.response === "guerra") { s.data.rivalCut = COMPETITION.cut.war; notes.push(`${RIVAL} responde a tu bajada: ahora va un 22 % por debajo de tus precios de antes.`); }
      else { s.data.rivalCut = COMPETITION.cut.after; s.data.rivalUp = true; notes.push(`${RIVAL} sube sus precios: los de lanzamiento no le cubrían costes. Ahora solo va un 3 % por debajo.`); }
    }
  },
  stars(s) {
    const ok = s.status !== "quiebra" && !s.data.pact;
    const lost = String(s.data.lost).split(",").filter(Boolean).length - Number(s.data.back ?? 0);
    return [ok && retainedShare(s) >= 0.7, ok && levelResultOf(s) >= 0, ok && lost <= 1 && s.company.reputation.fiabilidad >= 90];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l7-cartel", topic: "acuerdos entre competidores", competences: ["0623-RA1"], prompt: "Dos empresas de transporte de la misma zona acuerdan no bajar de 1 €/km y no quitarse clientes. ¿Es legal?",
        options: [
          { id: "ok", label: "No: es un acuerdo prohibido para fijar precios y repartirse el mercado", grade: "correcta", feedback: "Correcto: Ley 15/2007, de Defensa de la Competencia, art. 1.1, letras a) y c)." },
          { id: "peque", label: "Sí, si son empresas pequeñas", grade: "grave", feedback: "La prohibición del art. 1.1 se refiere al acuerdo, no al tamaño de quien lo firma." },
          { id: "escrito", label: "Solo es ilegal si se firma por escrito", grade: "grave", feedback: "El art. 1.1 prohíbe también la «práctica concertada o conscientemente paralela»: no hace falta un papel." },
        ] },
      { id: "l7-guerra", topic: "guerra de precios", competences: ["0623-RA1"], prompt: "¿Por qué una guerra de precios suele ser mala idea para una empresa pequeña?",
        options: [
          { id: "ok", label: "Porque bajas el margen con todos los clientes, el rival puede responder y gana quien más caja tiene", grade: "correcta", feedback: "Correcto. Por eso las empresas pequeñas suelen competir por diferenciación o por nicho." },
          { id: "ilegal", label: "Porque bajar precios está prohibido", grade: "grave", feedback: "Fijar precios es libre (Ley 3/1991, art. 17.1). Solo la venta bajo coste es desleal en casos concretos (art. 17.2)." },
          { id: "nunca", label: "No lo es: el que baja más siempre gana", grade: "grave", feedback: "Gana quien aguanta más tiempo perdiendo dinero, que suele ser el más grande." },
        ] },
    ];
  },
};
const levelResultOf = (s: CampaignState) => round2(sum(s.logs.filter((l) => l.level === s.level).map((l) => l.result)));
