import { round2, sum } from "../../../learning/money";
import { stream } from "../../rng";
import { activeStaff, charge, learn, personWeekly, relate, remember, transportKm, capacityKm } from "../helpers";
import { leadDecisions } from "../leads";
import type { CampaignState, Decision, Grade, Person } from "../model";
import { LABOR, SUB_RATE } from "../params";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 4 · «Tu primer equipo» (contratación). Tu reputación atrae clientes nuevos, pero la furgoneta solo hace un
 * turno: tú. Contratar un conductor permite un segundo turno. Mecánica nueva: personas con contrato, sueldo y coste
 * para la empresa (cotizaciones), periodo de prueba, horas extra y contratos temporales.
 *
 * Normativa leída en el BOE el 23/11/2026 (ver LABOR en params.ts): Estatuto de los Trabajadores, arts. 14.1, 15.2,
 * 34.1, 35.2 y 49.1.c; Orden PJC/297/2026 (cotizaciones). Sueldos, productividad y sucesos: SIMULADOS.
 *
 * Estrategias válidas: contratar a la conductora con experiencia; contratar al junior indefinido y formarle; junior
 * temporal y resolver el pico con horas extra. La mala: no contratar a nadie (no hay equipo) o despedir en el periodo de
 * prueba y quedarse solo.
 */
export const CANDIDATES = {
  marta: { name: "Marta Ferrer", salary: 2_000, kmBonus: 700, text: "8 años conduciendo reparto en Valencia; conoce las rutas. Quiere un contrato indefinido." },
  javi: { name: "Javi Ortega", salary: 1_400, kmBonus: 450, text: "Recién sacado el carné; aprende rápido si se le forma. Le vale indefinido o temporal." },
};
const TRAINING = { cost: 400, kmBonus: 150 };
const PEAK = { km: 400, weeks: 3 };
const eur = (v: number, d = 0) => `${v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const trialWeeks = () => LABOR.trialWeeks.small; // menos de 25 personas: hasta 3 meses (art. 14.1)

function hire(s: CampaignState, who: keyof typeof CANDIDATES, contract: Person["contract"]) {
  const c = CANDIDATES[who];
  (s.company.staff ??= []).push({ id: who, name: c.name, role: "conductor", contract, salaryMonthly: c.salary, startAbs: s.abs, trialUntilAbs: s.abs + trialWeeks() - 1, kmBonus: c.kmBonus, satisfaction: who === "marta" ? 70 : 60, ...(contract === "temporal" ? { endAbs: s.abs + LABOR.temporaryMaxWeeks - 1 } : {}) });
}
const driver = (s: CampaignState) => activeStaff(s.company).find((p) => p.role === "conductor");

export const LEVEL4: LevelDef = {
  n: 4, act: 1, actTitle: "Arranque", type: "Contratación", title: "Tu primer equipo", weeks: 8,
  briefing: "Tu reputación te trae clientes nuevos cada semana, pero tu furgoneta solo hace un turno: el tuyo. Con un conductor podría hacer un segundo turno de tarde. Contratar es una inversión: la persona cuesta desde el primer día y solo se paga si llenas ese turno.",
  mechanic: "Plantilla: eliges a quién contratas y con qué contrato. Su coste para la empresa es el sueldo más las cotizaciones. Hay periodo de prueba, horas extra con límite legal y contratos temporales para los picos.",
  objectives: ["Terminar el nivel con un conductor en plantilla, sin quiebra.", "Que las 4 últimas semanas den beneficio: el equipo ya se paga solo.", "Que nadie de tu plantilla se haya ido y servir todo lo comprometido."],
  strategies: ["Contratar a la conductora con experiencia: cara, pero rinde desde el primer día.", "Contratar al junior indefinido y formarle: barato, tarda en arrancar.", "Junior con contrato temporal y el pico de trabajo con horas extra o un temporal."],
  concepts: ["coste-empresa", "periodo-prueba", "contratos", "horas-extra"],
  keyDecisions: ["conductor", "prueba", "subida", "pico"],
  start() {},
  decisionsAt(s) {
    const out: Decision[] = [];
    const L = s.week, d = driver(s);
    if (L === 1) out.push({ id: "conductor", key: true, title: "¿A quién contratas como conductor?",
      prompt: `Dos candidatos para el turno de tarde. Coste para la empresa = sueldo bruto + cotizaciones (≈ ${Math.round(LABOR.employerRate.indefinido * 100)} % en un indefinido, ${Math.round(LABOR.employerRate.temporal * 100)} % en un temporal, más accidentes de trabajo).`,
      hint: "Compara lo que te cuesta cada uno a la semana con los km que añade y con lo que pagan los clientes que podrías atender. ¿Es una necesidad que va a durar?",
      options: [
        { id: "marta", label: `${CANDIDATES.marta.name}: ${eur(CANDIDATES.marta.salary)} brutos al mes, indefinido`, detail: `${CANDIDATES.marta.text} Segundo turno de ${CANDIDATES.marta.kmBonus} km a la semana. Te cuesta unos ${eur(CANDIDATES.marta.salary * (1 + LABOR.employerRate.indefinido + LABOR.accidentRate) / 4)} a la semana.` },
        { id: "javi-indefinido", label: `${CANDIDATES.javi.name}: ${eur(CANDIDATES.javi.salary)} brutos al mes, indefinido`, detail: `${CANDIDATES.javi.text} Segundo turno de ${CANDIDATES.javi.kmBonus} km a la semana al principio. Te cuesta unos ${eur(CANDIDATES.javi.salary * (1 + LABOR.employerRate.indefinido + LABOR.accidentRate) / 4)} a la semana.` },
        { id: "javi-temporal", label: `${CANDIDATES.javi.name}: ${eur(CANDIDATES.javi.salary)} brutos al mes, temporal de 6 meses`, detail: `Mismo candidato con contrato por circunstancias de la producción. Te cuesta unos ${eur(CANDIDATES.javi.salary * (1 + LABOR.employerRate.temporal + LABOR.accidentRate) / 4)} a la semana.` },
        { id: "nadie", label: "No contratar todavía", detail: "Sigues tú solo con la furgoneta." },
      ] });
    if (L === 3 && d?.id === "javi" && !s.answers["prueba"] && stream(s.seed, s.abs, "campana-l4-golpe")() < 0.75) out.push({ id: "prueba", key: true, title: "Javi rasca la furgoneta",
      prompt: `En su tercera semana, Javi roza un muelle de carga: 300 € de chapa. Sigue dentro del periodo de prueba (hasta la semana ${d.trialUntilAbs - s.abs + s.week} del nivel).`,
      hint: "Durante el periodo de prueba cualquiera de las partes puede terminar la relación sin indemnización. ¿Es un error de novato o un mal fichaje? ¿Qué te cuesta sustituirle?",
      options: [{ id: "formar", label: `Pagarle un curso de conducción profesional (${eur(TRAINING.cost)})` }, { id: "seguir", label: "Hablar con él y seguir" }, { id: "despedir", label: "Terminar en el periodo de prueba" }] });
    if (L === 3 && d?.id === "marta" && !s.answers["subida"]) out.push({ id: "subida", key: true, title: "Marta pide más sueldo",
      prompt: `Otra empresa le ofrece 200 € más al mes. Marta prefiere quedarse, pero te pide que se los iguales (${eur(CANDIDATES.marta.salary)} → ${eur(CANDIDATES.marta.salary + 200)} brutos).`,
      hint: "¿Cuánto te costaría la subida con cotizaciones? ¿Y sustituirla: buscar, formar a otro, semanas con menos km?",
      options: [{ id: "si", label: "Igualar la oferta" }, { id: "mitad", label: "Ofrecerle 100 € más y un día libre al mes" }, { id: "no", label: "No subirle" }] });
    if (L === 5 && !s.answers["pico"]) out.push({ id: "pico", key: true, title: "Pico de trabajo de Bazar",
      prompt: `Bazar Levante tiene campaña: necesita ${PEAK.km} km más a la semana durante ${PEAK.weeks} semanas. Esta semana te quedan unos ${Math.max(0, capacityKm(s.company) - transportKm(s.company, s.abs)).toLocaleString("es-ES")} km libres.`,
      hint: `Un pico corto y previsible. Las horas extra tienen un límite de 80 al año; un temporal para algo ocasional, de hasta 90 días al año. ¿Qué cuesta cada salida?`,
      options: [
        ...(d ? [{ id: "extra", label: `Horas extra de ${d.name}, a ${LABOR.overtimeFactor.toLocaleString("es-ES")} veces el coste de su hora` }] : []),
        { id: "temporal", label: "Un conductor temporal 3 semanas para el pico" },
        { id: "sub", label: `Subcontratar esos km (${SUB_RATE.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/km)` },
        { id: "no", label: "Decirle a Bazar que no puedes" },
      ] });
    out.push(...leadDecisions(s), ...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    const say = (grade: Grade, feedback: string, competences = ["0625-RA2", "0623-RA7"]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: true });
    if (d.id === "conductor") {
      if (op === "marta") hire(s, "marta", "indefinido");
      if (op === "javi-indefinido") hire(s, "javi", "indefinido");
      if (op === "javi-temporal") hire(s, "javi", "temporal");
      if (op === "javi-indefinido" || op === "javi-temporal") s.data.javiLearnUntil = s.abs + 3;
      const p = driver(s);
      const weekly = p ? personWeekly(p) : 0;
      say(op === "nadie" ? "razonable" : op === "javi-temporal" ? "razonable" : "correcta",
        op === "nadie" ? "No te arriesgas, pero tampoco creces: los clientes nuevos que no puedas atender se irán a otro. Contratar es una inversión: cuesta antes de rendir." :
        `${p!.name} te cuesta ${eur(weekly, 2)} a la semana: ${eur(p!.salaryMonthly)} brutos al mes más un ${((LABOR.employerRate[p!.contract] + LABOR.accidentRate) * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} % de cotizaciones (Orden PJC/297/2026; el de accidentes es simulado). Periodo de prueba: hasta 3 meses en una empresa de menos de 25 personas (Estatuto de los Trabajadores, art. 14.1). ${op === "javi-temporal" ? "El contrato por circunstancias de la producción es para aumentos de actividad, no para un puesto que va a durar; como mucho 6 meses (art. 15.2), cotiza más por desempleo (6,70 % frente a 5,50 %) y al acabar le debes 12 días de salario por año trabajado (art. 49.1.c)." : op === "marta" ? "Cara, pero rinde desde el primer día." : "Barato, pero tardará unas semanas en rendir: la formación acelera."}`);
      return;
    }
    if (d.id === "prueba") {
      const p = driver(s)!;
      if (op === "formar") { charge(s, "Curso de conducción profesional", TRAINING.cost); p.kmBonus = (p.kmBonus ?? 0) + TRAINING.kmBonus; p.satisfaction += 15; }
      if (op === "seguir") charge(s, "Reparación de chapa", 300);
      if (op === "despedir") { p.left = true; p.endAbs = s.abs; charge(s, "Reparación de chapa", 300); remember(s, "despido-en-prueba"); }
      say(op === "formar" ? "correcta" : op === "seguir" ? "razonable" : "grave", op === "formar" ? `Formar es invertir en la persona: ${eur(TRAINING.cost)} y gana ${TRAINING.kmBonus} km a la semana de soltura. Un error de novato no es un mal fichaje.` : op === "seguir" ? "Pagas los 300 € y sigues, pero sin formación seguirá rindiendo menos." : "Durante el periodo de prueba se puede terminar sin indemnización (art. 14), pero te quedas sin conductor y sin el segundo turno: has pagado la curva de aprendizaje para nada.");
      return;
    }
    if (d.id === "subida") {
      const p = driver(s)!;
      if (op === "si") { p.salaryMonthly += 200; p.satisfaction = 90; }
      if (op === "mitad") { p.salaryMonthly += 100; p.satisfaction = 75; }
      if (op === "no") { p.satisfaction = 20; s.data.martaLeaves = s.abs + 2; }
      const extra = round2(200 * (1 + LABOR.employerRate.indefinido + LABOR.accidentRate) / 4);
      say(op === "mitad" ? "correcta" : op === "si" ? "razonable" : "grave", op === "no" ? `Ahorras ${eur(extra, 2)} a la semana, pero se irá en dos semanas: perderás su turno mientras buscas a otra persona. Sustituir a alguien bueno cuesta más que retenerlo.` : op === "si" ? `Retienes a Marta por ${eur(extra, 2)} más a la semana (con cotizaciones). Funciona, aunque no has negociado.` : "Le das parte del dinero y algo que valora sin coste directo: se queda contenta y te cuesta la mitad.", ["0625-RA2", "0824-RA3"]);
      return;
    }
    if (d.id === "pico") {
      s.data.peakUntil = s.abs + PEAK.weeks - 1; s.data.peakMode = op;
      // El pico se cubre aparte (horas extra, un temporal o un subcontratista): no es capacidad que vaya a quedarse.
      if (op !== "no") c.deals.push({ id: "l4-pico", client: "bazar", kind: "transporte", km: PEAK.km, rate: 0.85, payWeeks: 4, fromAbs: s.abs, toAbs: s.abs + PEAK.weeks - 1, missed: 0, sub: true, ...(op === "sub" ? {} : { selfCovered: true }) });
      if (op === "extra") s.data.overtimeOf = driver(s)!.id;
      if (op === "temporal") (c.staff ??= []).push({ id: "temporal-pico", name: "Conductor temporal", role: "temporal", contract: "temporal", salaryMonthly: 1_500, startAbs: s.abs, endAbs: s.abs + PEAK.weeks - 1, trialUntilAbs: s.abs, satisfaction: 50 });
      if (op === "no") relate(s, "bazar", -15);
      say(op === "no" ? "razonable" : op === "sub" ? "razonable" : "correcta", op === "extra" ? `Horas extra pagadas a ${LABOR.overtimeFactor.toLocaleString("es-ES")} veces la hora, sin pasar del límite de 80 horas al año (Estatuto, art. 35.2). Para un pico corto, lo más ágil; para algo permanente, quema a la persona.` : op === "temporal" ? "Un contrato para una situación ocasional y previsible: la ley lo permite hasta 90 días en el año (art. 15.2). Se acaba solo cuando acaba el pico." : op === "sub" ? `El subcontratista cobra ${SUB_RATE} €/km y Bazar paga 0,85: pierdes dinero en cada km, pero no fallas al cliente.` : "Bazar busca a otro para su campaña y lo recordará.");
    }
  },
  beforeClose(s, notes) {
    // Javi aprende: rinde menos las 3 primeras semanas.
    const p = driver(s);
    if (p?.id === "javi" && Number(s.data.javiLearnUntil ?? 0) >= s.abs && !s.data.javiLearnApplied) { p.kmBonus = (p.kmBonus ?? 0) - 200; s.data.javiLearnApplied = true; notes.push("Javi aún está aprendiendo las rutas: hace menos km."); }
    if (p?.id === "javi" && s.data.javiLearnApplied && Number(s.data.javiLearnUntil) < s.abs && !s.data.javiLearned) { p.kmBonus = (p.kmBonus ?? 0) + 200; s.data.javiLearned = true; notes.push("Javi ya se maneja solo con las rutas."); }
    // Horas extra: se pagan a parte.
    if (s.data.overtimeOf && Number(s.data.peakUntil) >= s.abs) { const o = activeStaff(s.company).find((x) => x.id === s.data.overtimeOf); if (o) charge(s, `Horas extra de ${o.name}`, round2(personWeekly(o) * (PEAK.km / 1_000) * LABOR.overtimeFactor)); }
  },
  afterWeek(s, notes) {
    if (s.data.martaLeaves && Number(s.data.martaLeaves) === s.abs) { const m = (s.company.staff ?? []).find((x) => x.id === "marta"); if (m && !m.left) { m.left = true; m.endAbs = s.abs; remember(s, "se-fue-marta"); notes.push("Marta se va a la competencia."); } }
  },
  stars(s) {
    const logs = s.logs.filter((l) => l.level === s.level);
    const last4 = round2(sum(logs.slice(-4).map((l) => l.result)));
    const anyLeft = (s.company.staff ?? []).some((p) => p.role === "conductor" && p.left);
    return [!!driver(s), last4 >= 0, !anyLeft && logs.every((l) => l.kmServed >= l.kmDemand)];
  },
  debrief(s): DebriefQ[] {
    const sal = 1_800, cost = round2(sal * (1 + LABOR.employerRate.indefinido));
    return [
      { id: "l4-coste", topic: "coste de una persona", competences: ["0625-RA2"], prompt: `Contratas a alguien con ${eur(sal)} brutos al mes e indefinido. Sin contar accidentes de trabajo, ¿cuánto le cuesta al mes a la empresa?`,
        options: [
          { id: "ok", label: `Unos ${eur(cost)}`, grade: "correcta", feedback: `Correcto: sueldo bruto más las cotizaciones de la empresa en 2026 (23,60 % contingencias comunes, 5,50 % desempleo, 0,20 % FOGASA, 0,60 % formación y 0,75 % MEI: ${(LABOR.employerRate.indefinido * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %).` },
          { id: "bruto", label: eur(sal), grade: "grave", feedback: "El bruto es lo que cobra el trabajador antes de sus retenciones; la empresa paga además sus propias cotizaciones." },
          { id: "neto", label: `Unos ${eur(sal * 0.8)}`, grade: "grave", feedback: "Eso se parece al neto del trabajador, no al coste para la empresa, que es mayor que el bruto." },
        ] },
      { id: "l4-extra", topic: "horas extra", competences: ["0625-RA2"], prompt: "¿Cuántas horas extraordinarias puede hacer como mucho una persona al año, según el Estatuto de los Trabajadores?",
        options: [
          { id: "ok", label: "80", grade: "correcta", feedback: "Correcto: «no podrá ser superior a ochenta al año» (art. 35.2), salvo las excepciones del apartado 3." },
          { id: "sin", label: "No hay límite si se pagan", grade: "grave", feedback: "Sí lo hay: 80 al año (art. 35.2). Pagarlas no lo quita." },
          { id: "200", label: "200", grade: "grave", feedback: "El límite general es de 80 al año (art. 35.2)." },
        ] },
    ];
  },
};
