import { round2, sum } from "../../../learning/money";
import { stream } from "../../rng";
import { activeDeals, capacityKm, charge, learn, palletCapacity, registerClients, relate, remember, transportKm, variablePerKm } from "../helpers";
import { leadDecisions } from "../leads";
import type { CampaignState, Decision, Grade } from "../model";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 5 · «El gran cliente» (negociación). Una cadena de tiendas te ofrece un acuerdo marco de 6 meses. Se negocia
 * un PAQUETE: precio por km y por palé, plazo de pago del almacenaje, penalización por servicio, exclusividad y volumen
 * garantizado. Tienes una alternativa a la vista (tu mejor alternativa a un acuerdo) y puedes levantarte de la mesa.
 * Lo que firmes tiene consecuencias en las semanas siguientes. Empresas, cifras y preferencias del cliente: SIMULADAS.
 * Plazo de pago: entre empresas, por pacto nunca más de 60 días (Ley 3/2004, art. 4.3, comprobada el 23/11/2026); en el
 * transporte, mora a los 30 días (Ley 15/2009, art. 41).
 *
 * Estrategias válidas: paquete equilibrado; concesiones cruzadas (exclusividad a cambio de precio y volumen
 * garantizado); no firmar e irse a la alternativa. La mala: aceptar su primera oferta tal cual.
 */
registerClients({ hiper: "Grupo Hiper Levante (ficticia)", alternativa: "Distribuciones Camp de Túria (ficticia)" });
export const HIPER = { km: 500, pallets: 120, weeks: 24 };
export const ALT = { km: 300, rate: 0.95, weeks: 12 };
interface Terms { rate: number; palletRate: number; payDays: 30 | 45 | 60; penalty: number; exclusive: boolean; guaranteed: boolean }
export const PACKAGES: Record<string, Terms & { label: string }> = {
  suya: { label: "Aceptar su oferta tal cual", rate: 0.9, palletRate: 2.0, payDays: 60, penalty: 0.05, exclusive: true, guaranteed: false },
  agresivo: { label: "Apertura alta: 1,15 €/km, 2,60 €/palé, 30 días, sin penalización ni exclusividad", rate: 1.15, palletRate: 2.6, payDays: 30, penalty: 0, exclusive: false, guaranteed: false },
  equilibrado: { label: "Equilibrado: 1,02 €/km, 2,30 €/palé, 45 días, 2 % de penalización y volumen garantizado", rate: 1.02, palletRate: 2.3, payDays: 45, penalty: 0.02, exclusive: false, guaranteed: true },
  cruzado: { label: "Concesiones cruzadas: exclusividad y 60 días a cambio de 1,10 €/km, 2,40 €/palé y volumen garantizado", rate: 1.1, palletRate: 2.4, payDays: 60, penalty: 0.02, exclusive: true, guaranteed: true },
};
const COUNTER: Terms = { rate: 1.0, palletRate: 2.2, payDays: 45, penalty: 0.03, exclusive: true, guaranteed: false };
const eur = (v: number, d = 0) => `${v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const describe = (t: Terms) => `${t.rate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km, ${t.palletRate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/palé, almacenaje a ${t.payDays} días, ${t.penalty ? `${Math.round(t.penalty * 100)} % de penalización por punto de servicio bajo el 97 %` : "sin penalización"}, ${t.exclusive ? "con exclusividad" : "sin exclusividad"}, ${t.guaranteed ? "con volumen garantizado" : "sin volumen garantizado"}`;

/** Precio máximo que aceptaría el cliente (oculto): depende de la semilla y sube si le das exclusividad. */
const reservation = (s: CampaignState, exclusive: boolean) => round2(1.0 + stream(s.seed, 0, "campana-l5-reserva")() * 0.08 + (exclusive ? 0.06 : 0));

function sign(s: CampaignState, t: Terms) {
  const c = s.company, w = s.abs + 1;
  s.data.signed = "hiper"; s.data.terms = JSON.stringify(t); s.data.signedAbs = w;
  c.deals.push({ id: "l5-hiper-reparto", client: "hiper", kind: "transporte", km: HIPER.km, rate: t.rate, payWeeks: 4, fromAbs: w, toAbs: w + HIPER.weeks - 1, missed: 0 });
  if (c.facility) c.deals.push({ id: "l5-hiper-almacen", client: "hiper", kind: "almacen", pallets: HIPER.pallets, palletRate: t.palletRate, payWeeks: ({ 30: 4, 45: 6, 60: 8 } as const)[t.payDays], fromAbs: w, toAbs: w + HIPER.weeks - 1, missed: 0 });
  if (t.exclusive) remember(s, "exclusividad-hiper");
}
function takeAlternative(s: CampaignState) {
  s.data.signed = "alternativa";
  s.company.deals.push({ id: "l5-alternativa", client: "alternativa", kind: "transporte", km: ALT.km, rate: ALT.rate, payWeeks: 4, fromAbs: s.abs + 1, toAbs: s.abs + ALT.weeks, missed: 0 });
}
const terms = (s: CampaignState): Terms | null => (s.data.terms ? JSON.parse(String(s.data.terms)) as Terms : null);

export const LEVEL5: LevelDef = {
  n: 5, act: 2, actTitle: "Consolidación", type: "Negociación", title: "El gran cliente", weeks: 8,
  briefing: `Grupo Hiper Levante (ficticia), una cadena de tiendas, quiere un acuerdo marco de 6 meses: ${HIPER.km} km de reparto a la semana y ${HIPER.pallets} palés en almacén si tienes nave. Es el cliente más grande que has tenido. Tienes una alternativa: Distribuciones Camp de Túria (ficticia) te ofrece ${ALT.km} km a ${ALT.rate.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km durante ${ALT.weeks} semanas, sin condiciones.`,
  mechanic: "Negociación por paquetes: no se negocia solo el precio. Plazo, penalizaciones, exclusividad y volumen garantizado valen dinero, y lo que concedes en una cosa puedes pedirlo en otra. Lo que firmes se cumple después.",
  objectives: ["Cerrar un acuerdo (con Hiper o con tu alternativa) y terminar el nivel sin quiebra.", "Que el resultado del nivel sea positivo.", "Que ningún cliente pase del 50 % de tu facturación en la última semana y no pagar penalizaciones."],
  strategies: ["Un paquete equilibrado: precio razonable a cambio de penalización baja y volumen garantizado.", "Concesiones cruzadas: das lo que el cliente valora (exclusividad, plazo) a cambio de precio y garantía.", "No firmar: si lo que te ofrecen no supera tu alternativa, te levantas."],
  concepts: ["batna", "paquete", "concentracion", "penalizaciones"],
  keyDecisions: ["apertura", "ronda2", "capacidad", "recorte"],
  start(s) { s.data.round = 1; },
  decisionsAt(s) {
    const out: Decision[] = [];
    const L = s.week, c = s.company;
    const free = capacityKm(c) - transportKm(c, s.abs);
    if (L === 1) out.push({ id: "apertura", key: true, title: "Tu propuesta a Grupo Hiper Levante",
      prompt: `Su oferta: ${describe(PACKAGES.suya)}. Te quedan unos ${Math.max(0, free).toLocaleString("es-ES")} km libres a la semana${c.facility ? ` y ${Math.max(0, palletCapacity(c, s.abs) - sum(activeDeals(c, s.abs).filter((d) => d.kind === "almacen").map((d) => d.pallets!)))} palés libres` : ""}. Tu alternativa aporta unos ${eur(ALT.km * (ALT.rate - variablePerKm(c)))} a la semana durante ${ALT.weeks} semanas.`,
      hint: "Antes de proponer, ten claro tu límite: ¿qué acuerdo es peor que tu alternativa? Y piensa qué cosas te cuestan poco y el cliente valora mucho.",
      options: Object.entries(PACKAGES).map(([id, p]) => ({ id, label: p.label })).concat([{ id: "alternativa", label: "No negociar: quedarte con tu alternativa" }]) });
    if (L === 2 && s.data.round === 2) out.push({ id: "ronda2", key: true, title: "Contraoferta de Hiper",
      prompt: `Hiper no acepta tu apertura y propone: ${describe(COUNTER)}.`,
      hint: "Compara su contraoferta con tu alternativa. ¿Puedes pedir algo a cambio de lo que te piden, en vez de ceder sin más?",
      options: [{ id: "aceptar", label: "Aceptar su contraoferta" }, { id: "garantia", label: "Aceptar si añade volumen garantizado" }, { id: "alternativa", label: "Levantarte e irte a tu alternativa" }] });
    // Justo después de firmar: ¿te cabe? Comprometerse más allá de tu capacidad se paga en penalizaciones.
    if (s.data.signed === "hiper" && !s.answers["capacidad"] && s.abs >= Number(s.data.signedAbs ?? 0)) {
      const hk = HIPER.km, kmFree = capacityKm(c) - transportKm(c, s.abs) + (activeDeals(c, s.abs).some((x) => x.id === "l5-hiper-reparto") ? hk : 0);
      const pFree = c.facility ? palletCapacity(c, s.abs) - sum(activeDeals(c, s.abs).filter((d) => d.kind === "almacen" && !d.external && d.client !== "hiper").map((d) => d.pallets!)) : 0;
      const shortKm = Math.max(0, hk - kmFree), shortPal = c.facility ? Math.max(0, HIPER.pallets - pFree) : 0;
      if (shortKm > 0 || shortPal > 0) out.push({ id: "capacidad", key: true, title: "Te falta capacidad para Hiper",
        prompt: `Para cumplir el acuerdo te faltan ${shortKm ? `${shortKm.toLocaleString("es-ES")} km a la semana` : ""}${shortKm && shortPal ? " y " : ""}${shortPal ? `sitio para ${shortPal} palés` : ""}. Si no lo resuelves, fallarás y pagarás penalizaciones.`,
        hint: "Compara lo que cuesta cada salida con lo que aporta el acuerdo. Lo ideal era comprobarlo antes de firmar.",
        options: [{ id: "externo", label: `Subcontratar los km que faltan (1,05 €/km)${shortPal ? " y alquilar espacio externo para los palés (2,00 € por palé y semana)" : ""}` }, { id: "renegociar", label: "Pedir a Hiper empezar con menos volumen" }, { id: "nada", label: "Arreglártelas con lo que tienes" }],
        data: { shortKm, shortPal } });
      else s.data.capacityOk = true;
    }
    if (L === 5 && s.data.signed === "hiper" && !s.answers["recorte"]) {
      const t = terms(s)!;
      out.push({ id: "recorte", key: true, title: "Hiper recorta pedidos",
        prompt: `Hiper avisa de que las próximas semanas mandará un 40 % menos de km por una bajada de ventas. ${t.guaranteed ? "Tu acuerdo tiene volumen garantizado." : "Tu acuerdo no garantiza volumen."}`,
        hint: "Lo firmado obliga a las dos partes. ¿Qué dice tu contrato y qué te conviene hacer con la capacidad que se queda libre?",
        options: t.guaranteed ? [{ id: "exigir", label: "Exigir que pague el mínimo garantizado" }, { id: "ceder", label: "No exigir nada para cuidar la relación" }] : [{ id: "rellenar", label: "Buscar trabajo para la capacidad que queda libre" }, { id: "aguantar", label: "Aguantar y esperar a que vuelva" }] });
    }
    if (!(s.data.signed === "hiper" && terms(s)?.exclusive)) out.push(...leadDecisions(s));
    out.push(...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const say = (grade: Grade, feedback: string, competences = ["0824-RA3", "0623-RA7"]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: true });
    const c = s.company, v = variablePerKm(c);
    const altValue = round2(ALT.km * (ALT.rate - v) * ALT.weeks);
    const value = (t: Terms) => round2((HIPER.km * (t.rate - v) + (c.facility ? HIPER.pallets * t.palletRate : 0)) * HIPER.weeks);
    if (d.id === "apertura") {
      if (op === "alternativa") { takeAlternative(s); say("razonable", `Te quedas con lo seguro: ${eur(altValue)} de margen en ${ALT.weeks} semanas. Sin explorar la negociación no sabes si Hiper valía más: la alternativa es tu suelo, no tu objetivo.`); return; }
      const t = PACKAGES[op];
      const res = reservation(s, t.exclusive);
      const accepts = op === "suya" || t.rate <= res;
      if (accepts) { sign(s, t); s.data.round = 0; }
      else s.data.round = 2;
      say(op === "suya" ? "grave" : accepts ? "correcta" : "razonable", op === "suya"
        ? `Aceptas su primera oferta sin negociar: 0,90 €/km, cobrar el almacén a 60 días, 5 % de penalización por cada punto bajo el 97 % y exclusividad, sin garantía de volumen. Todo el riesgo es tuyo. Su primera oferta casi nunca es su límite.`
        : accepts ? `Acepta: ${describe(t)}. Vale unos ${eur(value(t))} de margen en 6 meses frente a ${eur(altValue)} de tu alternativa. ${t.exclusive ? "Le has dado lo que más valora (exclusividad) a cambio de precio y garantía: eso es una concesión cruzada." : "Has pedido lo que necesitas sin dar lo que no te cuesta."}`
        : "Tu apertura queda por encima de lo que puede pagar: te hace una contraoferta. Abrir alto está bien si dejas margen para negociar; ahora decide con tu alternativa en la mano.");
      return;
    }
    if (d.id === "ronda2") {
      if (op === "aceptar") sign(s, COUNTER);
      if (op === "garantia") { const ok = stream(s.seed, s.abs, "campana-l5-garantia")() < 0.75; if (ok) sign(s, { ...COUNTER, guaranteed: true }); else takeAlternative(s); s.data.garantiaOk = ok; }
      if (op === "alternativa") takeAlternative(s);
      s.data.round = 0;
      const counterV = value(COUNTER);
      say(op === "garantia" ? "correcta" : op === "aceptar" ? (counterV > altValue ? "razonable" : "grave") : counterV > altValue ? "razonable" : "correcta",
        `Su contraoferta vale unos ${eur(counterV)} de margen en 6 meses; tu alternativa, ${eur(altValue)} en 3. ${op === "garantia" ? (s.data.garantiaOk ? "Acepta: has convertido una concesión (su exclusividad) en una protección para ti." : "No acepta la garantía y te quedas con tu alternativa: pedir algo a cambio tiene ese riesgo.") : op === "aceptar" ? "Aceptas sin pedir nada a cambio de la exclusividad y la penalización del 3 %." : "Te levantas. Si la contraoferta valía más que tu alternativa, has dejado dinero en la mesa."}`);
      return;
    }
    if (d.id === "capacidad") {
      const shortKm = Number(d.data!.shortKm), shortPal = Number(d.data!.shortPal);
      const rd = c.deals.find((x) => x.id === "l5-hiper-reparto"), sd = c.deals.find((x) => x.id === "l5-hiper-almacen");
      if (op === "externo") {
        if (shortKm && rd) { rd.km = HIPER.km - shortKm; c.deals.push({ ...rd, id: "l5-hiper-sub", km: shortKm, sub: true }); }
        if (shortPal && sd) { s.data.externalPallets = shortPal; sd.pallets = HIPER.pallets - shortPal; c.deals.push({ ...sd, id: "l5-hiper-externo", pallets: shortPal, external: true }); }
      }
      if (op === "renegociar") { if (rd && shortKm) rd.km = Math.max(0, HIPER.km - shortKm); if (sd && shortPal) sd.pallets = Math.max(0, HIPER.pallets - shortPal); relate(s, "hiper", -10); }
      say(op === "externo" ? "correcta" : op === "renegociar" ? "razonable" : "grave", op === "externo" ? "Cubres lo que te falta con medios ajenos: cuesta margen, pero cumples lo firmado. Lo ideal habría sido calcularlo antes de firmar." : op === "renegociar" ? "Empezar con menos es sensato, pero renegociar justo después de firmar resta credibilidad." : "Has firmado más de lo que puedes hacer: cada semana fallarás y pagarás la penalización.", ["0622-RA2", "0824-RA3"]);
      return;
    }
    if (d.id === "recorte") {
      const deal = c.deals.find((x) => x.id === "l5-hiper-reparto")!;
      const t = terms(s)!;
      if (op === "exigir") { /* pagan el mínimo: sin cambio de facturación */ relate(s, "hiper", -5); }
      if (op === "ceder" || op === "rellenar" || op === "aguantar") { deal.km = Math.round(HIPER.km * 0.6 / 10) * 10; }
      if (op === "ceder") relate(s, "hiper", 10);
      say(op === "exigir" ? "correcta" : op === "rellenar" ? "correcta" : op === "ceder" ? "razonable" : "grave", t.guaranteed
        ? (op === "exigir" ? "Lo firmado obliga: con volumen garantizado, el cliente paga el mínimo aunque mande menos. Para eso lo negociaste." : "Renuncias a lo que firmaste para cuidar la relación: es legítimo, pero tiene un precio y debe ser una decisión consciente.")
        : (op === "rellenar" ? "Sin garantía, el riesgo es tuyo: lo sensato es buscar trabajo para la capacidad libre (clientes nuevos, urgentes)." : "Sin garantía y sin buscar alternativas, pagas los fijos de una capacidad que nadie usa."));
    }
  },
  beforeClose(s) {
    if (Number(s.data.externalPallets ?? 0) > 0) charge(s, "Espacio externo para palés de Hiper", Number(s.data.externalPallets) * 2);
    // Penalización por servicio: si fallaste km a Hiper esta semana, un % de su factura por cada punto por debajo del 97 %.
    const t = terms(s);
    if (!t || s.data.signed !== "hiper" || !t.penalty) return;
    const deal = s.company.deals.find((x) => x.id === "l5-hiper-reparto");
    if (!deal || deal.ended || deal.fromAbs > s.abs) return;
    const free = capacityKm(s.company) - (transportKm(s.company, s.abs) - deal.km!);
    const served = Math.max(0, Math.min(deal.km!, free));
    const pct = served / deal.km! * 100;
    if (pct < 97) { const fine = round2(deal.km! * deal.rate! * t.penalty * Math.min(20, Math.ceil(97 - pct))); charge(s, "Penalización por servicio a Grupo Hiper Levante", fine); s.data.penalties = round2(Number(s.data.penalties ?? 0) + fine); }
  },
  stars(s) {
    const logs = s.logs.filter((l) => l.level === s.level);
    const result = round2(sum(logs.map((l) => l.result)));
    const signed = !!s.data.signed && s.status !== "quiebra";
    const last = s.company.invoices.filter((i) => i.issuedAbs === s.abs);
    const total = sum(last.map((i) => i.amount));
    const top = Math.max(0, ...[...new Set(last.map((i) => i.client))].map((cl) => sum(last.filter((i) => i.client === cl).map((i) => i.amount))));
    return [signed, result >= 0, total > 0 && top / total <= 0.5 && !Number(s.data.penalties ?? 0)];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l5-batna", topic: "alternativa a un acuerdo", competences: ["0824-RA3"], prompt: "Antes de sentarte a negociar, ¿para qué sirve tener clara tu mejor alternativa si no hay acuerdo?",
        options: [
          { id: "ok", label: "Para saber cuándo te conviene levantarte: cualquier acuerdo peor que tu alternativa es peor que no firmar", grade: "correcta", feedback: "Correcto: tu alternativa marca tu límite y te da fuerza en la mesa. Mejorarla antes de negociar mejora el resultado." },
          { id: "amenaza", label: "Para amenazar al cliente con ella desde el principio", grade: "razonable", feedback: "Puede usarse, pero su función principal es decidir tú cuándo un acuerdo no te conviene." },
          { id: "nada", label: "Para nada: lo importante es cerrar el acuerdo", grade: "grave", feedback: "Cerrar a cualquier precio es como acabas aceptando acuerdos que te hacen perder dinero." },
        ] },
      { id: "l5-concentracion", topic: "concentración de clientes", competences: ["0623-RA7"], prompt: "Un solo cliente te da el 70 % de la facturación. ¿Cuál es el riesgo principal?",
        options: [
          { id: "ok", label: "Que si se va, recorta pedidos o paga tarde, pone en peligro toda la empresa, y además te puede imponer condiciones", grade: "correcta", feedback: "Correcto: la dependencia es un riesgo y resta poder de negociación. Por eso conviene diversificar." },
          { id: "ninguno", label: "Ninguno: un cliente grande es estabilidad", grade: "grave", feedback: "Es estabilidad mientras dura; si falla, la caída es enorme." },
          { id: "precio", label: "Que te pague menos por km", grade: "razonable", feedback: "Es uno de los efectos (más poder del cliente), pero el riesgo principal es depender de él para sobrevivir." },
        ] },
    ];
  },
};
