import { round2, sum } from "../../../learning/money";
import { activeDeals, capacityKm, learn, registerClients, relate, transportKm, unlock, variablePerKm, weeklyFixed } from "../helpers";
import type { CampaignState, Decision } from "../model";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 1 · «El primer encargo» (operación guiada). Empiezas como autónomo con una furgoneta en renting. Tres clientes
 * te quieren, cada uno con su forma de responder al precio: fijas una tarifa para cada uno (o no trabajas con él) y la
 * cartera se ejecuta sola cada semana. Mecánica nueva: precio, volumen y capacidad. Cifras SIMULADAS.
 *
 * Estrategias válidas (medidas en tests/campaign.test.ts): «premium» (precios altos, capacidad libre para urgentes bien
 * pagados), «equilibrio» (mezcla) y «volumen» (furgoneta llena). La mala: tarifas económicas a todos (no te cabe).
 */
export const L1_CLIENTS = {
  flor: { name: "Floristería Malvarrosa (ficticia)", what: "envíos urgentes a tiendas; le importa más la rapidez que el precio" },
  fresh: { name: "Distribuciones Turia Fresh (ficticia)", what: "mucho volumen diario; compara precios con otros transportistas" },
  imprenta: { name: "Imprenta Russafa (ficticia)", what: "repartos regulares a oficinas; algo sensible al precio" },
} as const;
type C1 = keyof typeof L1_CLIENTS;

/** Km por semana que te da cada cliente según la tarifa: económica, estándar o premium. */
export const L1_TIERS: Record<C1, Record<"economica" | "estandar" | "premium", { km: number; rate: number }>> = {
  flor: { economica: { km: 300, rate: 0.6 }, estandar: { km: 300, rate: 0.8 }, premium: { km: 260, rate: 1.05 } },
  fresh: { economica: { km: 1_100, rate: 0.5 }, estandar: { km: 700, rate: 0.62 }, premium: { km: 250, rate: 0.85 } },
  imprenta: { economica: { km: 500, rate: 0.52 }, estandar: { km: 400, rate: 0.7 }, premium: { km: 250, rate: 0.95 } },
};
const TIER_LABEL = { economica: "Económica", estandar: "Estándar", premium: "Premium" } as const;
registerClients(Object.fromEntries(Object.entries(L1_CLIENTS).map(([k, v]) => [k, v.name])));

const eur = (v: number, d = 2) => `${v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const contribution = (s: CampaignState, km: number, rate: number) => round2(km * (rate - variablePerKm(s.company)));

function tierDecision(s: CampaignState, c: C1): Decision {
  const t = L1_TIERS[c], v = variablePerKm(s.company);
  return {
    id: `tarifa-${c}`, key: true, title: `Tarifa para ${L1_CLIENTS[c].name}`,
    prompt: `${L1_CLIENTS[c].name}: ${L1_CLIENTS[c].what}. Según la tarifa que le pongas, te dará más o menos trabajo cada semana.`,
    hint: `Tu furgoneta hace como mucho ${capacityKm(s.company).toLocaleString("es-ES")} km a la semana y cada km te cuesta ${v.toLocaleString("es-ES")} € en gasóleo y mantenimiento. Tus fijos son ${eur(weeklyFixed(s.company, s.abs))} a la semana, trabajes o no. ¿Cuánto aporta cada opción después del coste variable, y te cabe todo lo que aceptas?`,
    options: [
      ...(["economica", "estandar", "premium"] as const).map((k) => ({ id: k, label: `${TIER_LABEL[k]}: ${t[k].rate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km`, detail: `${t[k].km.toLocaleString("es-ES")} km a la semana → ${eur(t[k].km * t[k].rate, 0)} de facturación` })),
      { id: "no", label: "No trabajar con él", detail: "Dejas libres sus km para otros clientes o encargos urgentes" },
    ],
  };
}

export const LEVEL1: LevelDef = {
  n: 1, act: 1, actTitle: "Arranque", type: "Operación", title: "El primer encargo", weeks: 6,
  briefing: "Has dejado tu trabajo para montar tu propia empresa de transporte. Tienes una furgoneta en renting, 8.000 € en la cuenta y tres clientes interesados. Cada uno responde distinto al precio.",
  mechanic: "Precio, volumen y capacidad: tú fijas la tarifa de cada cliente y tu cartera trabaja sola cada semana. Además llegan encargos urgentes que solo puedes aceptar si te queda capacidad.",
  objectives: ["Cubrir costes: el resultado de las 6 semanas no puede ser negativo.", "Ganar al menos 1.200 € en el nivel.", "Servir todo lo comprometido y, además, llevar la furgoneta al 75 % o más, o ganar al menos 0,60 € por km."],
  strategies: ["Precios altos y capacidad libre para los urgentes, que pagan mejor.", "Una mezcla: tarifa premium al que no mira el precio y estándar al resto.", "Volumen: la furgoneta llena con el cliente grande a precio económico."],
  concepts: ["fijo-variable", "margen-contribucion", "punto-muerto", "elasticidad"],
  keyDecisions: ["tarifa-flor", "tarifa-fresh", "tarifa-imprenta", "rebaja-fresh"],
  start(s) { s.data.portfolioGraded = false; },
  decisionsAt(s) {
    const out: Decision[] = [];
    if (s.week === 1) out.push(tierDecision(s, "flor"), tierDecision(s, "fresh"), tierDecision(s, "imprenta"));
    const fresh = activeDeals(s.company, s.abs).find((d) => d.client === "fresh");
    if (s.week === 4 && fresh && fresh.rate! > L1_TIERS.fresh.economica.rate) out.push({
      id: "rebaja-fresh", key: true, title: "Turia Fresh pide una rebaja",
      prompt: `Distribuciones Turia Fresh te pide bajar un 10 % tu tarifa (${fresh.rate!.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km): otro transportista le ofrece menos. Si no, te dará la mitad de km.`,
      hint: "¿Cuánto aporta ese cliente después del coste variable con cada opción? ¿Qué harías con los km que te dejaría libres?",
      options: [{ id: "aceptar", label: "Aceptar el 10 % menos" }, { id: "contraoferta", label: "Ofrecerle un 5 % menos a cambio de mantener todo el volumen" }, { id: "mantener", label: "Mantener tu precio" }],
      data: { rate: fresh.rate!, km: fresh.km! },
    });
    out.push(...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    if (d.id.startsWith("tarifa-")) {
      const c = d.id.slice(7) as C1;
      if (op !== "no") {
        const t = L1_TIERS[c][op as "economica"];
        s.company.deals.push({ id: `l1-${c}`, client: c, kind: "transporte", km: t.km, rate: t.rate, payWeeks: 4, fromAbs: s.abs, missed: 0 });
        relate(s, c, op === "economica" ? 10 : op === "premium" ? -5 : 0);
      }
      if (["flor", "fresh", "imprenta"].every((x) => s.answers[`tarifa-${x}`])) gradePortfolio(s);
      return;
    }
    if (d.id === "rebaja-fresh") {
      const deal = s.company.deals.find((x) => x.client === "fresh" && !x.ended)!;
      const rate = Number(d.data!.rate), km = Number(d.data!.km), v = variablePerKm(s.company);
      const free = capacityKm(s.company) - transportKm(s.company, s.abs);
      if (op === "aceptar") deal.rate = round2(rate * 0.9);
      if (op === "contraoferta") deal.rate = round2(rate * 0.95);
      // Mantener el precio: la mitad de km (lo dijo); te queda capacidad para urgentes.
      if (op === "mantener") { deal.km = Math.round(km / 2 / 10) * 10; relate(s, "fresh", -10); }
      const keep = contribution(s, km, round2(rate * 0.95)), half = contribution(s, Math.round(km / 2 / 10) * 10, rate), cut = contribution(s, km, round2(rate * 0.9));
      const best = Math.max(keep, half, cut);
      const mine = op === "aceptar" ? cut : op === "contraoferta" ? keep : half;
      const grade = mine === best ? "correcta" : mine >= best * 0.85 ? "razonable" : "grave";
      learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, competences: ["0824-RA3", "0623-RA7"], key: true,
        feedback: `Aportación semanal de Turia Fresh después del gasóleo (${v.toLocaleString("es-ES")} €/km): con un 10 % menos, ${eur(cut)}; con un 5 % menos y todo el volumen, ${eur(keep)}; manteniendo el precio y con la mitad de km, ${eur(half)}, pero con ${Math.round(km / 2 / 10) * 10} km libres para urgentes (te quedaban unos ${Math.max(0, free)} libres). Negociar no es ceder o resistir: es comparar lo que aporta cada salida.` });
      unlock(s, "capacidad");
    }
  },
  stars(s) {
    const logs = s.logs.filter((l) => l.level === s.level);
    const result = round2(sum(logs.map((l) => l.result)));
    const allServed = logs.every((l) => l.kmServed >= l.kmDemand);
    const use = sum(logs.map((l) => l.kmServed)) / sum(logs.map((l) => l.kmCapacity));
    const perKm = sum(logs.map((l) => l.kmServed)) ? sum(logs.map((l) => l.revenue - l.variable)) / sum(logs.map((l) => l.kmServed)) : 0;
    return [result >= 0, result >= 1_200, allServed && (use >= 0.75 || perKm >= 0.6)];
  },
  debrief(s): DebriefQ[] {
    const deals = s.company.deals.filter((d) => d.id.startsWith("l1-"));
    const km = sum(deals.map((d) => d.km!)) || 1;
    const m = round2(sum(deals.map((d) => d.km! * (d.rate! - variablePerKm(s.company)))) / km);
    const fixed = weeklyFixed(s.company, s.abs);
    const pm = m > 0 ? Math.round(fixed / m) : 0;
    return [
      { id: "l1-punto-muerto", topic: "punto muerto", competences: ["0623-RA7"],
        prompt: `Tus fijos son ${eur(fixed)} a la semana y tu cartera aporta de media ${m.toLocaleString("es-ES")} € por km después del gasóleo. ¿Cuántos km a la semana necesitas para no perder dinero?`,
        options: [
          { id: "ok", label: `Unos ${pm.toLocaleString("es-ES")} km`, grade: "correcta", feedback: `Correcto: fijos ÷ margen de contribución por km = ${eur(fixed)} ÷ ${m.toLocaleString("es-ES")} € ≈ ${pm.toLocaleString("es-ES")} km.` },
          { id: "precio", label: `Unos ${Math.round(fixed / (m + variablePerKm(s.company))).toLocaleString("es-ES")} km`, grade: "razonable", feedback: "Has dividido entre el precio por km, no entre el margen: olvidas que cada km también cuesta gasóleo." },
          { id: "todo", label: `Unos ${Math.round(fixed * 4 / Math.max(m, 0.01)).toLocaleString("es-ES")} km`, grade: "grave", feedback: "Has usado los fijos del mes con el margen de una semana: compara siempre periodos iguales." },
        ] },
      { id: "l1-urgentes", topic: "coste de oportunidad", competences: ["0622-RA2"],
        prompt: "Tienes la furgoneta al 95 % con un cliente que paga 0,50 €/km. Te ofrecen encargos urgentes a 1,15 €/km que no te caben. ¿Qué es lo más razonable para las próximas semanas?",
        options: [
          { id: "liberar", label: "Renegociar o reducir el cliente barato para dejar capacidad a lo que paga mejor", grade: "correcta", feedback: "Correcto: cada km comprometido a 0,50 € te cuesta lo que dejas de ganar con el urgente (coste de oportunidad)." },
          { id: "aceptar", label: "Aceptar los urgentes igualmente y ya se verá", grade: "grave", feedback: "Fallarías a alguien: pierdes reputación y pagas penalizaciones. La capacidad no se estira." },
          { id: "nada", label: "Nada: un cliente fijo vale más que cualquier urgente", grade: "razonable", feedback: "La estabilidad vale algo, pero no infinito: compara lo que aporta cada km." },
        ] },
    ];
  },
};

/** Corrección de la cartera completa (las tres tarifas juntas): capacidad y punto muerto. */
function gradePortfolio(s: CampaignState) {
  const deals = activeDeals(s.company, s.abs).filter((d) => d.id.startsWith("l1-"));
  const km = sum(deals.map((d) => d.km!)), cap = capacityKm(s.company);
  const contrib = round2(sum(deals.map((d) => contribution(s, d.km!, d.rate!))));
  const fixed = weeklyFixed(s.company, s.abs);
  const grade = km > cap ? "grave" : contrib >= fixed ? "correcta" : "razonable";
  const fb = km > cap
    ? `Has comprometido ${km.toLocaleString("es-ES")} km y la furgoneta hace ${cap.toLocaleString("es-ES")}: alguien se quedará sin servicio y se irá. Aceptar más de lo que puedes hacer no es vender más, es fallar.`
    : contrib >= fixed
      ? `Tu cartera aporta ${eur(contrib)} a la semana después del gasóleo y tus fijos son ${eur(fixed)}: cubres costes con ${km.toLocaleString("es-ES")} de ${cap.toLocaleString("es-ES")} km. Lo que te queda libre (${(cap - km).toLocaleString("es-ES")} km) es para encargos urgentes.`
      : `Tu cartera aporta ${eur(contrib)} a la semana y tus fijos son ${eur(fixed)}: aún no cubres costes. Te quedan ${(cap - km).toLocaleString("es-ES")} km libres: los urgentes tendrán que cubrir la diferencia.`;
  learn(s, { id: "cartera-l1", what: "Tu primera cartera de clientes", answer: `${km.toLocaleString("es-ES")} km a la semana`, grade, feedback: fb, competences: ["0622-RA3", "0623-RA7"], key: false });
  s.data.portfolioGraded = true;
}
