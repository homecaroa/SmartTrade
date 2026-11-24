import { round2, sum } from "../../../learning/money";
import { stream } from "../../rng";
import { activeDeals, borrow, capacityKm, capitalize, clientName, invest, learn, personWeekly, registerClients, remember, transportKm, variablePerKm } from "../helpers";
import { leadDecisions } from "../leads";
import type { CampaignState, Decision, Person, Vehicle } from "../model";
import { LABOR, SUB_RATE, WEEKS_PER_MONTH } from "../params";
import { spotDecisions } from "../spot";
import type { DebriefQ, LevelDef } from "./index";

/**
 * Nivel 8 · «Segundo vehículo» (inversión). Dos clientes nuevos piden más km de los que puedes hacer. Mecánica nueva:
 * elegir el vehículo (tamaño), cómo pagarlo (contado, leasing o renting) y la persona que lo conduce, y medir si el
 * coste por km de ese vehículo baja de lo que cobra un subcontratista.
 *
 * Normativa (BOE, leída el 24/11/2026): Plan General de Contabilidad (Real Decreto 1514/2007, consolidado, actualización
 * del 21/12/2024), norma de registro y valoración 8.ª: en el arrendamiento financiero el arrendatario «registrará un
 * activo de acuerdo con su naturaleza» «y un pasivo financiero por el mismo importe» (1.2); en el arrendamiento
 * operativo las cuotas son «gasto del ejercicio en el que los mismos se devenguen» (2). Que un renting concreto sea
 * operativo depende del contrato: en el juego se trata como operativo (lo habitual) y se dice.
 * Precios, cuotas, tipos y sueldos: SIMULADOS.
 *
 * Estrategias válidas: furgoneta en renting; furgoneta en leasing; camión con un tercer cliente que lo llene. La mala:
 * rechazar el crecimiento o comprar al contado sin caja.
 */
registerClients({ ceramicas: "Cerámicas de Manises (ficticia)", sagunto: "Distribuciones Sagunto (ficticia)", puerto: "Logística del Puerto (ficticia)" });
export const NEW_CLIENTS = [{ client: "ceramicas", km: 900, rate: 1.0 }, { client: "sagunto", km: 500, rate: 0.98 }];
export const THIRD = { client: "puerto", km: 800, rate: 1.02, chance: 0.75 };
export const DROP = { client: "ceramicas", km: 500, chance: 0.5 };
export const VEHICLES = {
  furgoneta: { name: "Segunda furgoneta", kmWeek: 1_500, price: 28_000, renting: 750, driver: { id: "lucia", name: "Lucía Prieto", salary: 1_600 } },
  rigido: { name: "Camión rígido", kmWeek: 2_600, price: 55_000, renting: 1_900, driver: { id: "andres", name: "Andrés Vidal", salary: 2_100 } },
} as const;
/** Leasing: 48 meses al 6,5 %; seguro del vehículo propio, 90 € al mes; amortización en 6 años (todo simulado). */
export const FINANCE = { leasingRate: 0.065, leasingMonths: 48, insuranceMonthly: 90, lifeWeeks: 312, breakdown: { cost: 750, chance: 0.6 } };
type Kind = keyof typeof VEHICLES;
const eur = (v: number) => `${Math.round(v).toLocaleString("es-ES")} €`;
const rate2 = (v: number) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NEW_ID = "l8-vehiculo";
/**
 * ★★★: 0,80 €/km. Medido el 24/11/2026 con las estrategias automáticas: la furgoneta en renting sale entre 0,77 y
 * 0,86 €/km (pasa si no hay recorte), en leasing algo menos y el camión lleno entre 0,67 y 0,81.
 */
const GOOD_KM = 0.8;
const newVehicle = (s: CampaignState) => s.company.vehicles.find((v) => v.id === NEW_ID);
const newKm = () => sum(NEW_CLIENTS.map((x) => x.km));

/** Coste semanal fijo del vehículo nuevo y de su conductor (sin el gasóleo). */
export function vehicleWeeklyCost(s: CampaignState): number {
  const v = newVehicle(s); if (!v) return 0;
  const k = s.data.vehicle as Kind;
  const driver = (s.company.staff ?? []).find((p) => p.id === VEHICLES[k].driver.id && !p.left);
  const own = v.finance === "renting" ? 0 : VEHICLES[k].price / FINANCE.lifeWeeks;
  const interest = sum((s.company.loans ?? []).filter((l) => l.id === "l8-leasing").map((l) => l.principal * l.annualRate / 52));
  return round2(v.monthly / WEEKS_PER_MONTH + own + interest + (driver ? personWeekly(driver) : 0));
}
/** Coste por km del vehículo nuevo en el nivel (lo que se compara con un subcontratista). */
export const costPerKm = (s: CampaignState) => (Number(s.data.newKmDone) > 0 ? round2(Number(s.data.newCost) / Number(s.data.newKmDone)) : 0);

function financeDecision(s: CampaignState, k: Kind): Decision {
  const v = VEHICLES[k], c = s.company;
  const cuota = round2(v.price * (FINANCE.leasingRate / 12) / (1 - (1 + FINANCE.leasingRate / 12) ** -FINANCE.leasingMonths));
  return { id: "financiacion", key: true, title: `Cómo pagas ${k === "rigido" ? "el camión" : "la furgoneta"}`,
    prompt: `Cuesta ${eur(v.price)}. Tienes ${eur(c.cash)} en caja${c.credit ? ` y una póliza de ${eur(c.credit.limit)}` : ""}.`,
    hint: "Comprar, financiar la compra o alquilar: cambia la caja que sale hoy, lo que va al balance y lo que pagas cada mes. ¿Quién paga las averías en cada caso?",
    options: [
      { id: "contado", label: `Comprarlo al contado (${eur(v.price)} ahora)`, detail: `Es tuyo: se amortiza en 6 años y pagas tú el seguro (${FINANCE.insuranceMonthly} € al mes) y las averías.` },
      { id: "leasing", label: `Leasing: ${eur(cuota)} al mes durante ${FINANCE.leasingMonths} meses`, detail: `Al ${String(FINANCE.leasingRate * 100).replace(".", ",")} %, con opción de compra al final. Seguro y averías, tuyos.` },
      { id: "renting", label: `Renting: ${eur(v.renting)} al mes`, detail: "Incluye seguro y mantenimiento; no es tuyo nunca." },
    ] };
}

export const LEVEL8: LevelDef = {
  n: 8, act: 2, actTitle: "Consolidación", type: "Inversión", title: "Segundo vehículo", weeks: 8,
  briefing: `${clientName("ceramicas")} y ${clientName("sagunto")} quieren trabajar contigo: ${newKm().toLocaleString("es-ES")} km más a la semana. Con lo que tienes no llegas. Hace falta otro vehículo, o alguien que lo haga por ti.`,
  mechanic: "Inversión: eliges vehículo, cómo pagarlo y quién lo conduce. Su coste por km depende de cuánto lo llenes: un vehículo medio vacío sale más caro que subcontratar.",
  objectives: ["Atender a los dos clientes nuevos (como mucho una semana con km sin hacer) sin quebrar.", `Que el coste por km del vehículo nuevo quede por debajo de lo que cobra un subcontratista (${rate2(SUB_RATE)} €/km).`, "Que el vehículo nuevo salga a 0,80 €/km o menos: bien aprovechado."],
  strategies: ["Una segunda furgoneta en renting: menos riesgo, cuota fija con mantenimiento.", "Una segunda furgoneta en leasing: más barata por km, con las averías a tu cargo.", "Un camión rígido, si consigues un tercer cliente que lo llene."],
  concepts: ["coste-km", "leasing", "renting", "apalancamiento-operativo"],
  keyDecisions: ["vehiculo", "financiacion", "tercero"],
  start(s) { s.data.newCost = 0; s.data.newKmDone = 0; s.data.newMiss = 0; },
  decisionsAt(s) {
    const out: Decision[] = [];
    const c = s.company;
    if (s.week === 1) {
      const free = Math.max(0, capacityKm(c) - transportKm(c, s.abs));
      out.push({ id: "vehiculo", key: true, title: "Cómo atiendes a los dos clientes nuevos",
        prompt: `Piden ${newKm().toLocaleString("es-ES")} km a la semana a unos ${rate2(1)} €/km, desde la semana que viene. Te quedan ${free.toLocaleString("es-ES")} km libres. Un conductor más te costaría entre ${eur(personWeekly({ salaryMonthly: VEHICLES.furgoneta.driver.salary, contract: "indefinido" } as Person))} y ${eur(personWeekly({ salaryMonthly: VEHICLES.rigido.driver.salary, contract: "indefinido" } as Person))} a la semana con cotizaciones.`,
        hint: "Un vehículo propio es un coste fijo: cuanto más km haga, más barato sale cada uno. ¿Cuántos km le vas a dar? ¿Y si un cliente recorta? Y ojo con la caja: los clientes nuevos pagan a 30 días, pero sueldos y gasóleo se pagan cada semana.",
        options: [
          { id: "furgoneta", label: `Otra furgoneta (${VEHICLES.furgoneta.kmWeek.toLocaleString("es-ES")} km a la semana)`, detail: `Con ${VEHICLES.furgoneta.driver.name} al volante (${eur(VEHICLES.furgoneta.driver.salary)} brutos al mes).` },
          { id: "rigido", label: `Un camión rígido (${VEHICLES.rigido.kmWeek.toLocaleString("es-ES")} km a la semana)`, detail: `Con ${VEHICLES.rigido.driver.name}, conductor con experiencia en camión (${eur(VEHICLES.rigido.driver.salary)} brutos al mes).` },
          { id: "subcontratar", label: `Subcontratarlo todo (${rate2(SUB_RATE)} €/km)`, detail: "Sin inversión ni plantilla nueva." },
          { id: "rechazar", label: "Decirles que no" },
        ] });
    }
    if (s.week === 3 && newVehicle(s) && newVehicle(s)!.finance !== "renting" && stream(s.seed, s.abs, "campana-l8-averia")() < FINANCE.breakdown.chance)
      out.push({ id: "averia-l8", key: false, title: "Avería del vehículo nuevo", prompt: `Falla la caja de cambios: ${eur(FINANCE.breakdown.cost)} de reparación. Como es tuyo, la pagas tú.`, hint: "En un renting, el mantenimiento y las averías suelen ir incluidos en la cuota.", options: [{ id: "reparar", label: "Repararlo" }] });
    if (s.week === 4 && s.data.vehicle && stream(s.seed, s.abs, "campana-l8-tercero")() < THIRD.chance) {
      const free = Math.max(0, capacityKm(c) - transportKm(c, s.abs));
      out.push({ id: "tercero", key: true, title: `${clientName(THIRD.client)} quiere un reparto fijo`, data: { free },
        prompt: `${THIRD.km} km a la semana a ${rate2(THIRD.rate)} €/km, desde la semana que viene. Te quedan ${free.toLocaleString("es-ES")} km libres.`,
        hint: "Si te cabe, cada km llena un vehículo que ya pagas. Si no te cabe, ¿cuánto te costaría subcontratarlo?",
        options: [{ id: "aceptar", label: "Aceptarlo con tus vehículos" }, { id: "sub", label: `Aceptarlo y subcontratarlo (${rate2(SUB_RATE)} €/km)` }, { id: "rechazar", label: "Rechazarlo" }] });
    }
    out.push(...leadDecisions(s), ...spotDecisions(s));
    return out;
  },
  decide(s, d, op) {
    const c = s.company;
    const say = (grade: "correcta" | "razonable" | "grave", feedback: string, competences = ["0623-RA4", "0622-RA2"]) => learn(s, { id: d.id, what: d.title, answer: d.options.find((o) => o.id === op)!.label, grade, feedback, competences, key: true });
    if (d.id === "vehiculo") {
      s.data.vehicle = op === "furgoneta" || op === "rigido" ? op : "";
      s.data.choice = op;
      if (op !== "rechazar") for (const x of NEW_CLIENTS) c.deals.push({ id: `l8-${x.client}`, client: x.client, kind: "transporte", km: x.km, rate: x.rate, payWeeks: 4, fromAbs: s.abs + 1, missed: 0, ...(op === "subcontratar" ? { sub: true } : {}) });
      if (op === "furgoneta" || op === "rigido") s.pending.unshift(financeDecision(s, op));
      const fixedF = round2(VEHICLES.furgoneta.renting / WEEKS_PER_MONTH + personWeekly({ salaryMonthly: VEHICLES.furgoneta.driver.salary, contract: "indefinido" } as Person));
      const perKm = round2(fixedF / newKm() + variablePerKm(c));
      if (op === "furgoneta") say("correcta", `Ajustas el tamaño a lo que vas a hacer: con ${newKm().toLocaleString("es-ES")} km a la semana, una furgoneta en renting sale a unos ${rate2(perKm)} €/km con conductora y gasóleo, por debajo de los ${rate2(SUB_RATE)} €/km de un subcontratista.`);
      if (op === "rigido") say("razonable", `Más capacidad (${VEHICLES.rigido.kmWeek.toLocaleString("es-ES")} km) pero más coste fijo: solo con los dos clientes nuevos lo llenarías a medias, y cada km saldría más caro. Compensa si consigues más trabajo que lo llene.`);
      if (op === "subcontratar") say("razonable", `Sin riesgo ni inversión, pero cada km te cuesta ${rate2(SUB_RATE)} € y lo cobras a unos ${rate2(1)} €: casi no ganas nada. Subcontratar sirve para picos, no para un volumen que va a durar.`);
      if (op === "rechazar") { remember(s, "rechazo-crecer"); say("grave", "Dos clientes fijos que vienen solos son la oportunidad de crecer que buscan todas las empresas. Al rechazarlos, se van con otro y no vuelven."); }
      return;
    }
    if (d.id === "financiacion") {
      const k = s.data.vehicle as Kind, v = VEHICLES[k];
      const veh: Vehicle = { id: NEW_ID, name: `${v.name} ${op === "renting" ? "en renting" : op === "leasing" ? "en leasing" : "propio"}`, kmWeek: v.kmWeek, monthly: op === "renting" ? v.renting : FINANCE.insuranceMonthly, mode: op === "renting" ? "renting" : "propio", kind: k, finance: op as Vehicle["finance"] };
      c.vehicles.push(veh);
      (c.staff ??= []).push({ id: v.driver.id, name: v.driver.name, role: "conductor", contract: "indefinido", salaryMonthly: v.driver.salary, startAbs: s.abs, trialUntilAbs: s.abs + LABOR.trialWeeks.small - 1, kmBonus: 0, satisfaction: 65 });
      if (op === "contado") invest(s, v.price, FINANCE.lifeWeeks);
      if (op === "leasing") { capitalize(s, v.price, FINANCE.lifeWeeks); borrow(s, { id: "l8-leasing", label: `leasing de ${k === "rigido" ? "el camión" : "la furgoneta"}`, kind: "leasing", amount: v.price, annualRate: FINANCE.leasingRate, months: FINANCE.leasingMonths }); }
      const cashAfter = c.cash;
      const tight = cashAfter < (c.credit ? -c.credit.limit * 0.5 : 0);
      if (op === "contado") say(tight ? "grave" : "razonable", tight ? `Te quedas con ${eur(cashAfter)} en caja: no podrás pagar sueldos ni gasóleo. Comprar al contado es lo más barato solo si te sobra la caja; usar la tesorería del día a día para una inversión a 6 años es la forma clásica de quebrar creciendo.` : "Es lo más barato (sin intereses) y el vehículo es tuyo, pero te deja sin colchón para imprevistos. Va al activo y se amortiza en 6 años.", ["0623-RA4", "0623-RA6"]);
      if (op === "leasing") say("correcta", "No sale caja hoy y el vehículo trabaja desde ya. En contabilidad, el leasing financiero lleva el vehículo al activo y la deuda al pasivo por el mismo importe (PGC, norma de registro y valoración 8.ª, 1.2): cada cuota es en parte intereses (gasto) y en parte devolución de deuda.", ["0623-RA4", "0623-RA6"]);
      if (op === "renting") say("correcta", "Cuota fija con seguro y mantenimiento: el riesgo de averías es del arrendador. Al ser un arrendamiento operativo, las cuotas son gasto del periodo (PGC, norma 8.ª, 2) y el vehículo no entra en tu balance. Por km suele salir algo más caro que comprar.", ["0623-RA4", "0623-RA6"]);
      return;
    }
    if (d.id === "averia-l8") { s.charges.push({ label: "Reparación del vehículo nuevo", amount: FINANCE.breakdown.cost, cash: true }); s.data.newCost = round2(Number(s.data.newCost) + FINANCE.breakdown.cost); return; }
    if (d.id === "tercero") {
      const free = Number(d.data!.free);
      if (op !== "rechazar") c.deals.push({ id: "l8-puerto", client: THIRD.client, kind: "transporte", km: THIRD.km, rate: THIRD.rate, payWeeks: 4, fromAbs: s.abs + 1, missed: 0, ...(op === "sub" ? { sub: true } : {}) });
      s.data.third = op;
      const fits = free >= THIRD.km;
      if (op === "aceptar") say(fits ? "correcta" : "grave", fits ? "Te cabe: llenas capacidad que ya pagas y cada km nuevo solo añade el gasóleo. Así baja el coste por km." : `Solo te quedaban ${free.toLocaleString("es-ES")} km: fallarás a alguien cada semana.`);
      if (op === "sub") say(fits ? "grave" : "razonable", fits ? `Te cabía con tus vehículos: subcontratándolo pagas ${rate2(SUB_RATE)} €/km por algo que te salía casi gratis, y pierdes dinero en cada km.` : `Cobras ${rate2(THIRD.rate)} €/km y pagas ${rate2(SUB_RATE)}: pierdes ${rate2(SUB_RATE - THIRD.rate)} € en cada km, y al subcontratista le pagas cada semana mientras el cliente te paga a 30 días. Solo compensa si así conservas un cliente que luego harás tú.`);
      if (op === "rechazar") say(fits ? "razonable" : "correcta", fits ? "Te cabía: es capacidad que pagas y no usas." : "No te cabía, y subcontratarlo te habría hecho perder dinero en cada km: bien visto.");
    }
  },
  afterWeek(s, notes) {
    const c = s.company, log = s.logs.at(-1)!;
    for (const d of activeDeals(c, s.abs)) if (d.id.startsWith("l8-") && !d.sub && d.missed > 0) s.data.newMiss = Number(s.data.newMiss) + 1;
    const v = newVehicle(s);
    if (v && s.week >= 2) {
      const km = Math.max(0, Math.min(v.kmWeek, log.kmServed - (log.kmCapacity - v.kmWeek)));
      s.data.newKmDone = Number(s.data.newKmDone) + km;
      s.data.newCost = round2(Number(s.data.newCost) + vehicleWeeklyCost(s) + km * variablePerKm(c));
    }
    if (s.week === 4 && s.data.choice !== "rechazar" && stream(s.seed, s.abs, "campana-l8-recorte")() < DROP.chance) {
      const d = c.deals.find((x) => x.id === "l8-ceramicas" && !x.ended);
      if (d) { d.km = DROP.km; s.data.dropped = true; notes.push(`${clientName(DROP.client)} recorta su reparto a ${DROP.km} km a la semana: ha perdido un cliente grande. Tus costes fijos siguen igual.`); }
    }
  },
  stars(s) {
    const ok = s.status !== "quiebra"; // rechazar ya falla la ★: no queda el contrato de Cerámicas
    const own = !!newVehicle(s);
    return [ok && Number(s.data.newMiss) <= 1 && activeDeals(s.company, s.abs).some((d) => d.id === "l8-ceramicas"), ok && own && costPerKm(s) > 0 && costPerKm(s) < SUB_RATE, ok && own && costPerKm(s) > 0 && costPerKm(s) <= GOOD_KM];
  },
  debrief(): DebriefQ[] {
    return [
      { id: "l8-leasing", topic: "leasing y renting en las cuentas", competences: ["0623-RA6"], prompt: "Una empresa tiene un camión en leasing financiero y otro en renting (arrendamiento operativo). ¿Cómo aparecen en sus cuentas?",
        options: [
          { id: "ok", label: "El de leasing, en el activo con una deuda por el mismo importe; el de renting, solo como gasto de cada cuota", grade: "correcta", feedback: "Correcto: PGC, norma de registro y valoración 8.ª (1.2 para el arrendamiento financiero y 2 para el operativo)." },
          { id: "igual", label: "Los dos como gasto de cada cuota", grade: "grave", feedback: "En el arrendamiento financiero el arrendatario registra un activo y un pasivo financiero (PGC, norma 8.ª, 1.2)." },
          { id: "activo", label: "Los dos en el activo, porque los usa la empresa", grade: "grave", feedback: "En el operativo las cuotas son gasto del ejercicio (PGC, norma 8.ª, 2)." },
        ] },
      { id: "l8-km", topic: "coste por km y capacidad", competences: ["0623-RA4"], prompt: "Tu furgoneta nueva te cuesta 720 € a la semana con conductora, más 0,22 €/km de gasóleo. ¿Cuándo compensa frente a un subcontratista a 1,05 €/km?",
        options: [
          { id: "ok", label: "Cuando hace más de unos 870 km a la semana: 720 ÷ (1,05 − 0,22)", grade: "correcta", feedback: "Correcto: es el punto muerto del vehículo. Por debajo, subcontratar sale más barato; por encima, cada km propio ahorra." },
          { id: "siempre", label: "Siempre, porque lo propio es más barato", grade: "grave", feedback: "Solo si lo llenas: con pocos km, el coste fijo se reparte entre pocos y cada km sale carísimo." },
          { id: "nunca", label: "Nunca, porque subcontratar no tiene riesgo", grade: "razonable", feedback: "Tiene menos riesgo, pero con volumen estable pagas el margen del subcontratista en cada km." },
        ] },
    ];
  },
};
