import { round2, sum } from "../../../learning/money";
import { stream } from "../../rng";
import { activeDeals, capacityKm, charge, invest, learn, palletCapacity, registerClients, relate, transportKm, unlock } from "../helpers";
import type { CampaignState, Decision, Facility, Grade } from "../model";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 2 · «Montar la base» (construcción). Un cliente nuevo, Bazar Levante, te ofrece almacenaje y reparto si tienes
 * nave. Eliges entre tres naves, cómo pagar la obra y qué haces con los imprevistos. Mecánica nueva: instalaciones,
 * inversión, obra con plazo y presupuesto. Tus clientes del nivel 1 siguen contigo. Cifras SIMULADAS; la fianza de dos
 * meses sale de la Ley de Arrendamientos Urbanos, art. 36.1 (comprobada en el BOE el 10/11/2026). Los trámites con el
 * ayuntamiento son SIMULADOS: dependen de cada municipio y no se han verificado.
 *
 * Estrategias válidas: nave urbana pagada al contado; nave del polígono a plazos llenándola con un segundo cliente;
 * nave compartida renegociando el espacio. La mala: pagar el polígono al contado sin caja, o no tener nave.
 */
export const L2_NAVES: Record<Facility["id"], { name: string; pallets: number; rentMonthly: number; opsWeek: number; kmExtra: number; works: number; worksWeeks: number; text: string }> = {
  urbana: { name: "Nave pequeña en la ciudad", pallets: 200, rentMonthly: 900, opsWeek: 250, kmExtra: 0, works: 3_000, worksWeeks: 2, text: "Cerca de tus clientes, pero sin sitio para crecer." },
  poligono: { name: "Nave grande en un polígono", pallets: 600, rentMonthly: 1_700, opsWeek: 350, kmExtra: 150, works: 8_000, worksWeeks: 4, text: "Mucho sitio y estanterías incluidas en la obra, pero lejos: 150 km más a la semana." },
  compartida: { name: "Compartir nave con otra empresa", pallets: 180, rentMonthly: 550, opsWeek: 200, kmExtra: 40, works: 0, worksWeeks: 1, text: "Lista casi ya y barata, pero el dueño puede necesitar parte del espacio." },
};
/** Medido el 23/11/2026: con 400 km a 0,75 €/km, el reparto no cabía en la furgoneta y subcontratarlo perdía dinero cada semana. */
export const BAZAR = { pallets: 150, palletRate: 2.2, km: 250, rate: 0.85, promiseLocal: 4, lostAfterLocal: 6 };
export const MUEBLES = { pallets: 250, palletRate: 2.0 };
registerClients({ bazar: "Bazar Levante (ficticia)", muebles: "Mobles del Túria (ficticia)" });

const eur = (v: number, d = 0) => `${v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const local = (s: CampaignState) => s.abs - s.week + 1; // semana absoluta en que empezó el nivel
const deposit = (rent: number) => rent * 2;

export const LEVEL2: LevelDef = {
  n: 2, act: 1, actTitle: "Arranque", type: "Construcción", title: "Montar la base", weeks: 8,
  briefing: `Bazar Levante (ficticia) te ofrece guardarle ${BAZAR.pallets} palés y repartirle ${BAZAR.km} km a la semana, si tienes nave antes de la semana ${BAZAR.promiseLocal}. Si en la semana ${BAZAR.lostAfterLocal} aún no la tienes, se irá con otro. Tus clientes de siempre siguen contigo.`,
  mechanic: "Instalaciones: eliges nave, pagas la fianza, haces la obra y decides cómo pagarla. La obra tiene plazo y puede retrasarse.",
  objectives: ["Tener en marcha el contrato de Bazar Levante al terminar el nivel.", "Que el resultado del nivel no baje de −1.500 € (montar una base cuesta).", "Ocupar al menos el 60 % de tu nave en la última semana."],
  strategies: ["Nave urbana pagada al contado: segura y llena con Bazar.", "Polígono pagado a plazos y lleno con un segundo cliente.", "Nave compartida, renegociando con el dueño si te pide espacio."],
  concepts: ["inversion-gasto", "fianza", "localizacion", "credito-proveedor"],
  keyDecisions: ["nave", "pago-obra", "retraso", "transporte-bazar", "espacio"],
  start(s) { s.data.bazarSigned = false; },
  decisionsAt(s) {
    const out: Decision[] = [];
    const L = s.week, c = s.company;
    if (L === 1) out.push({
      id: "nave", key: true, title: "¿Qué nave alquilas?",
      prompt: `Tienes ${eur(c.cash)} en caja. La fianza son dos meses de alquiler y se recupera al irte. La obra es una inversión que se amortiza en 3 años.`,
      hint: "Compara el coste fijo por palé (alquiler ÷ palés), los km de más, lo que pagas hoy (fianza y obra) y el sitio que te queda para crecer.",
      options: (Object.keys(L2_NAVES) as Facility["id"][]).map((id) => { const n = L2_NAVES[id]; return { id, label: n.name, detail: `${n.pallets} palés · ${eur(n.rentMonthly)}/mes (${(n.rentMonthly / 4 / n.pallets).toLocaleString("es-ES", { maximumFractionDigits: 2 })} € por palé y semana) · fianza ${eur(deposit(n.rentMonthly))} · obra ${n.works ? `${eur(n.works)}, ${n.worksWeeks} semanas` : "sin obra, lista en 1 semana"} · ${n.kmExtra ? `${n.kmExtra} km más a la semana` : "sin km de más"}. ${n.text}` }; }),
    });
    if (L === 2 && c.facility && c.facility.id !== "compartida" && s.data.delayChecked !== true) {
      s.data.delayChecked = true;
      if (stream(s.seed, s.abs, "campana-l2-retraso")() < 0.7) out.push({
        id: "retraso", key: true, title: "El material de la obra llega tarde",
        prompt: `El proveedor de las estanterías y la puerta del muelle avisa de un retraso: la nave estaría lista una semana más tarde (semana ${c.facility.readyAbs - local(s) + 1} → ${c.facility.readyAbs - local(s) + 2} del nivel). Bazar la quiere en la semana ${BAZAR.promiseLocal}.`,
        hint: "¿Cuánto te cuesta una semana sin el contrato de Bazar, y qué arriesgas si se te va? Compáralo con lo que cuesta evitar el retraso.",
        options: [{ id: "urgencia", label: "Pagar 700 € por envío urgente y mantener la fecha" }, { id: "otro", label: "Cambiar de proveedor: 300 € más y quizá llegue a tiempo" }, { id: "esperar", label: "Esperar una semana" }],
      });
    }
    // El contrato de Bazar empieza cuando la nave está lista: transporte propio, subcontratado o sin él.
    if (c.facility && s.abs >= c.facility.readyAbs && !s.data.bazarSigned && !s.data.bazarLost) {
      const free = capacityKm(c) - transportKm(c, s.abs);
      out.push({
        id: "transporte-bazar", key: true, title: "Empieza el contrato de Bazar Levante",
        prompt: `Tu nave ya funciona: Bazar te trae ${BAZAR.pallets} palés a ${BAZAR.palletRate.toLocaleString("es-ES")} € por palé y semana y quiere ${BAZAR.km} km de reparto a la semana a ${BAZAR.rate.toLocaleString("es-ES")} €/km. Esta semana te quedan unos ${Math.max(0, free).toLocaleString("es-ES")} km libres en la furgoneta (ya contando los de ir y venir a la nave).`,
        hint: "Si no te cabe, fallarás a alguien. Un subcontratista no ocupa tu furgoneta, pero te cobra 1,05 €/km.",
        options: [{ id: "propio", label: "Hacer el reparto con tu furgoneta" }, { id: "sub", label: "Subcontratar el reparto (1,05 €/km)" }, { id: "solo-almacen", label: "Quedarte solo con el almacenaje" }],
        data: { free },
      });
    }
    if (L === 5 && c.facility && palletCapacity(c, s.abs) - sum(activeDeals(c, s.abs).filter((d) => d.kind === "almacen").map((d) => d.pallets!)) >= MUEBLES.pallets && !s.answers["muebles"]) out.push({
      id: "muebles", key: false, title: "Un segundo cliente para tu nave",
      prompt: `Mobles del Túria (ficticia) quiere guardar ${MUEBLES.pallets} palés a ${MUEBLES.palletRate.toLocaleString("es-ES")} € por palé y semana, sin reparto.`,
      hint: "Tu alquiler se paga igual con la nave llena o vacía: ¿cuánto te cuesta hoy cada palé vacío?",
      options: [{ id: "aceptar", label: "Aceptarlo" }, { id: "rechazar", label: "Rechazarlo" }],
    });
    if (L === 5 && c.facility?.id === "compartida" && !s.answers["espacio"] && stream(s.seed, s.abs, "campana-l2-espacio")() < 0.6) out.push({
      id: "espacio", key: true, title: "El dueño de la nave necesita espacio",
      prompt: `La empresa con la que compartes nave necesita 60 de tus ${c.facility.pallets} palés desde la semana que viene. Bazar tiene ${BAZAR.pallets} palés contigo.`,
      hint: "Si los palés de Bazar no caben, le fallas; a la segunda semana, se va. ¿Qué cuesta cada salida?",
      options: [{ id: "renegociar", label: "Renegociar: 100 € más al mes y conservas tu espacio" }, { id: "externo", label: "Alquilar 60 palés en otro almacén: 150 € a la semana" }, { id: "aceptar", label: "Aceptar y quedarte con 120 palés" }],
    });
    out.push(...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    const say = (grade: Grade, feedback: string, competences: string[]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: d.key });
    if (d.id === "nave") {
      const n = L2_NAVES[op as Facility["id"]];
      const procedure = op === "compartida" ? 0 : 1; // la compartida ya tiene los permisos del dueño
      c.facility = { id: op as Facility["id"], name: n.name, pallets: n.pallets, rentMonthly: n.rentMonthly, opsWeek: n.opsWeek, kmExtra: n.kmExtra, readyAbs: s.abs + n.worksWeeks + (procedure ? 0 : 0) };
      c.cash = round2(c.cash - deposit(n.rentMonthly)); c.deposits = round2(c.deposits + deposit(n.rentMonthly));
      say("correcta", `Fianza de ${eur(deposit(n.rentMonthly))} (dos meses de alquiler, Ley de Arrendamientos Urbanos, art. 36.1): no es un gasto, la recuperas al irte. Tu alquiler sube tus fijos en ${eur(n.rentMonthly / 4, 2)} a la semana desde hoy, aunque la nave aún no funcione. Coste fijo por palé lleno: ${(n.rentMonthly / 4 / n.pallets).toLocaleString("es-ES", { maximumFractionDigits: 2 })} € a la semana.`, ["0625-RA3", "0623-RA4"]);
      if (n.works) s.pending.unshift({
        id: "pago-obra", key: true, title: "¿Cómo pagas la obra?",
        prompt: `La obra cuesta ${eur(n.works)}. Te quedan ${eur(c.cash)} en caja después de la fianza.`,
        hint: "Pagar a plazos conserva caja a cambio de un recargo. ¿Cuánta caja necesitas para aguantar hasta que la nave dé dinero?",
        options: [{ id: "contado", label: `Al contado: ${eur(n.works)} hoy` }, { id: "plazos", label: `A plazos con el constructor: 3 pagos mensuales y un 4 % de recargo (${eur(n.works * 0.04)})` }],
        data: { works: n.works },
      });
      if (procedure) s.pending.unshift({
        id: "tramites", key: false, title: "Los trámites con el ayuntamiento",
        prompt: "Antes de abrir hay que presentar la comunicación de la actividad en el ayuntamiento (trámite simulado: depende de cada municipio).",
        hint: "Tu tiempo también cuesta: ¿qué pierdes si la nave abre una semana tarde?",
        options: [{ id: "gestor", label: "Encargarlo a una gestoría: 300 €" }, { id: "yo", label: "Hacerlo tú: gratis, pero puede retrasarse" }],
      });
      return;
    }
    if (d.id === "pago-obra") {
      const works = Number(d.data!.works);
      if (op === "contado") invest(s, works, 156);
      else {
        c.assets = round2(c.assets + works); c.assetsWeekly = round2(c.assetsWeekly + works / 156);
        // Tres plazos; el último se lleva el redondeo para que sumen exactamente la obra.
        for (const k of [1, 2, 3]) c.payables.push({ id: `obra-${k}`, label: `Plazo ${k} de la obra`, amount: k < 3 ? round2(works / 3) : round2(works - 2 * round2(works / 3)), dueAbs: s.abs + 4 * k });
        charge(s, "Recargo por pagar la obra a plazos", works * 0.04, false);
      }
      const cushion = round2(c.cash - (op === "contado" ? 0 : 0));
      const tight = op === "contado" && cushion < 2_500;
      const grade: Grade = tight ? "grave" : op === "plazos" && c.cash - works > 4_000 ? "razonable" : "correcta";
      say(grade, `${op === "contado" ? `Te quedan ${eur(c.cash)} en caja.` : `Conservas ${eur(c.cash)} en caja y pagas ${eur(works * 0.04)} de recargo.`} La obra va al activo (${eur(works)}) y se amortiza en 3 años: unos ${eur(works / 156, 2)} a la semana en la cuenta de resultados. ${tight ? "Con tan poca caja, un imprevisto o un cliente que pague tarde te deja sin poder pagar: la liquidez manda más que el recargo." : op === "plazos" && c.cash - works > 4_000 ? "Podías pagarla sin quedarte corto: el recargo es un coste que podías haber evitado." : "Equilibras el coste del aplazamiento con la caja que necesitas para aguantar."}`, ["0623-RA3", "0623-RA4"]);
      return;
    }
    if (d.id === "tramites") {
      if (op === "gestor") charge(s, "Gestoría: trámites de apertura", 300);
      else if (stream(s.seed, s.abs, "campana-l2-tramites")() < 0.5 && c.facility) c.facility.readyAbs += 1;
      const late = op === "yo" && c.facility!.readyAbs > local(s) + L2_NAVES[c.facility!.id].worksWeeks;
      say(op === "gestor" ? "correcta" : late ? "grave" : "razonable", op === "gestor" ? "Pagas 300 € y te olvidas: con un contrato esperando, una semana de retraso cuesta más." : late ? "Te has liado con los papeles: la nave abre una semana más tarde y Bazar espera. Tu tiempo y la fecha de apertura también cuestan." : "Te ha salido bien esta vez, pero arriesgabas una semana de contrato por ahorrarte 300 €.", ["0623-RA7"]);
      return;
    }
    if (d.id === "retraso") {
      const before = c.facility!.readyAbs;
      if (op === "urgencia") charge(s, "Envío urgente del material", 700);
      if (op === "otro") { charge(s, "Cambio de proveedor del material", 300); if (stream(s.seed, s.abs, "campana-l2-otro")() < 0.5) c.facility!.readyAbs += 1; }
      if (op === "esperar") c.facility!.readyAbs += 1;
      const pastPromise = c.facility!.readyAbs > local(s) + BAZAR.promiseLocal - 1;
      if (pastPromise) relate(s, "bazar", -15);
      const weekly = round2(BAZAR.pallets * BAZAR.palletRate + BAZAR.km * (BAZAR.rate - 0.22));
      say(op === "urgencia" ? (before > local(s) + BAZAR.promiseLocal - 2 ? "correcta" : "razonable") : pastPromise ? "grave" : "razonable",
        `Una semana del contrato de Bazar aporta unos ${eur(weekly)} después del gasóleo, y si llegas tarde a lo prometido, la relación se resiente (y en la semana ${BAZAR.lostAfterLocal} se va). ${op === "urgencia" ? "Pagar para cumplir el plazo es razonable cuando el retraso cuesta más que la urgencia." : pastPromise ? "Llegas tarde a lo prometido: Bazar está molesto." : "Esta vez llegas a tiempo, pero era una apuesta."}`, ["0623-RA7", "0625-RA3"]);
      return;
    }
    if (d.id === "transporte-bazar") {
      const free = Number(d.data!.free);
      s.data.bazarSigned = true;
      c.deals.push({ id: "l2-bazar-almacen", client: "bazar", kind: "almacen", pallets: BAZAR.pallets, palletRate: BAZAR.palletRate, payWeeks: 4, fromAbs: s.abs, missed: 0 });
      if (op !== "solo-almacen") c.deals.push({ id: "l2-bazar-reparto", client: "bazar", kind: "transporte", km: BAZAR.km, rate: BAZAR.rate, payWeeks: 4, fromAbs: s.abs, missed: 0, ...(op === "sub" ? { sub: true } : {}) });
      if (op === "solo-almacen") relate(s, "bazar", -15);
      const fits = free >= BAZAR.km;
      const grade: Grade = op === "propio" ? (fits ? "correcta" : "grave") : op === "sub" ? (fits ? "razonable" : "correcta") : "razonable";
      say(grade, op === "propio" ? (fits ? `Te cabe: ${BAZAR.km} km a ${BAZAR.rate.toLocaleString("es-ES")} €/km con tu furgoneta te dejan ${(BAZAR.rate - 0.22).toLocaleString("es-ES")} € por km.` : `No te cabe: tenías ${Math.max(0, free)} km libres. Alguien se quedará sin servicio y, a la segunda semana, se irá.`) : op === "sub" ? `El subcontratista cobra 1,05 €/km y Bazar te paga ${BAZAR.rate.toLocaleString("es-ES")}: pierdes ${(1.05 - BAZAR.rate).toLocaleString("es-ES")} € por km, pero conservas el cliente y el almacenaje. ${fits ? "Te cabía con tu furgoneta: era más barato hacerlo tú." : "Sin capacidad propia, es una forma de no fallar."}` : "Conservas el almacenaje, pero Bazar quería el paquete completo: la relación se resiente.", ["0622-RA2", "0623-RA7"]);
      return;
    }
    if (d.id === "muebles") {
      if (op === "aceptar") c.deals.push({ id: "l2-muebles", client: "muebles", kind: "almacen", pallets: MUEBLES.pallets, palletRate: MUEBLES.palletRate, payWeeks: 4, fromAbs: s.abs, missed: 0 });
      say(op === "aceptar" ? "correcta" : "razonable", op === "aceptar" ? `Llenas sitio que ya pagabas: ${eur(MUEBLES.pallets * MUEBLES.palletRate)} más a la semana sin apenas coste nuevo. El coste fijo por palé ocupado baja.` : "Tu alquiler se paga igual: cada palé vacío es dinero que no recuperas.", ["0625-RA3"]);
      return;
    }
    if (d.id === "espacio") {
      const f = c.facility!;
      if (op === "renegociar") { f.rentMonthly += 100; }
      if (op === "externo") { f.opsWeek += 150; }
      if (op === "aceptar") { f.pallets = 120; }
      say(op === "renegociar" ? "correcta" : op === "externo" ? "razonable" : "grave", op === "renegociar" ? "100 € al mes son 25 € a la semana: mucho menos que perder a Bazar o pagar otro almacén." : op === "externo" ? "Resuelves el problema, pero 150 € a la semana es seis veces lo que costaba renegociar." : `Con 120 palés no caben los ${BAZAR.pallets} de Bazar: le fallarás cada semana hasta que se vaya.`, ["0625-RA3", "0824-RA3"]);
    }
  },
  afterWeek(s, notes) {
    // Bazar se va si en la semana prometida + 2 sigue sin nave lista.
    if (!s.data.bazarSigned && !s.data.bazarLost && s.week >= BAZAR.lostAfterLocal) { s.data.bazarLost = true; relate(s, "bazar", -30); notes.push("Bazar Levante se ha ido con otro operador: tu nave no estaba lista."); }
  },
  stars(s) {
    const result = round2(sum(s.logs.filter((l) => l.level === s.level).map((l) => l.result)));
    const last = s.logs.at(-1)!;
    const bazar = activeDeals(s.company, s.abs).some((d) => d.client === "bazar" && d.kind === "almacen");
    return [bazar, result >= -1_500, last.palletCapacity > 0 && last.pallets / last.palletCapacity >= 0.6];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l2-fianza", topic: "fianza", competences: ["0623-RA6"], prompt: "Pagaste la fianza de la nave. ¿Cómo aparece en tus cuentas?",
        options: [
          { id: "activo", label: "En el activo: es un dinero que recuperas al dejar la nave", grade: "correcta", feedback: "Correcto: sale de la caja pero no es un gasto. La ley fija dos mensualidades para un local o nave (Ley de Arrendamientos Urbanos, art. 36.1)." },
          { id: "gasto", label: "Como un gasto del mes", grade: "grave", feedback: "No: no se consume, se devuelve al terminar el contrato. Por eso no baja el resultado." },
          { id: "alquiler", label: "Como dos meses de alquiler pagados por adelantado", grade: "razonable", feedback: "Se calcula con el alquiler, pero no paga ningún mes: es una garantía que se devuelve." },
        ] },
      { id: "l2-obra", topic: "inversión frente a gasto", competences: ["0623-RA4"], prompt: "La obra de la nave vació tu caja, pero el resultado de esa semana apenas bajó. ¿Por qué?",
        options: [
          { id: "amortiza", label: "Porque es una inversión: va al activo y se reparte en varios años como amortización", grade: "correcta", feedback: "Correcto: caja y resultado van por caminos distintos. Por eso se puede quedar sin caja una empresa con beneficios." },
          { id: "error", label: "Porque el juego aún no la ha contabilizado", grade: "grave", feedback: "Está contabilizada: en el activo, no como gasto de una semana." },
          { id: "plazos", label: "Porque se paga a plazos", grade: "razonable", feedback: "Pagar a plazos cambia cuándo sale la caja, no cómo se contabiliza la obra." },
        ] },
    ];
  },
};
