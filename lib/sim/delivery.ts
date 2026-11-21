import { round2 } from "../learning/money";
import { fnv1a } from "../learning/order";
import { clientOf } from "./market";
import type { Contract, Grade, Incident, IncidentOption, SimState } from "./model";
import { DELIVERY, P } from "./params";
import { intIn, stream } from "./rng";
import { semesterKey } from "./calendar";

/**
 * Incidencias durante los repartos (reglas v9; docs/simulador.md §17 terdecies). Situaciones de cada día en el transporte
 * por carretera, con lo que dice la Ley 15/2009 (comprobada en el BOE el 17/11/2026):
 * - «ausente»: el destinatario no está. Se avisa al cargador y se esperan instrucciones; sus gastos los paga él
 *   (art. 36.1 y 36.3). Hasta la entrega, la mercancía es responsabilidad tuya (art. 47.1).
 * - «espera»: más de una hora esperando para cargar o descargar da derecho a una indemnización por paralización (art. 22,
 *   redacción vigente desde el 02/03/2022; las reglas v9 calculaban con la original de 2009, dos horas: ver DELIVERY).
 * - «peso»: si sospechas que el peso declarado es falso, puedes comprobarlo; si lo era, los gastos los paga el cargador
 *   (art. 26.1).
 * - «estiba»: la carga y la estiba son del cargador, salvo pacto; pero si la hizo siguiendo tus instrucciones, respondes tú
 *   de los daños (art. 20).
 * - «bultos»: los bultos tienen que coincidir con la carta de porte (art. 21.1); una diferencia se anota al cargar.
 * - «destino»: el cargador puede cambiar el destino durante el viaje (art. 29.1), y tú cobrarle el coste (art. 36.3, por
 *   analogía: gastos de ejecutar sus instrucciones).
 * Importes SIMULADOS en DELIVERY (params.ts). Solo transporte nacional propio: lo internacional va por el Convenio CMR.
 */
export const DELIVERY_TYPES = ["ausente", "espera", "peso", "estiba", "bultos", "destino"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const activeIn = (c: Contract, w: number) => c.startWeek <= w && w <= c.endWeek && !(c.cancelledWeek !== undefined && w >= c.cancelledWeek);

/** ¿Hay incidencia de reparto esta semana? Como mucho una por semana y cada tipo una vez por temporada. */
export function deliveryIncidents(s: SimState): Incident[] {
  if (s.version < DELIVERY.fromVersion || s.week < DELIVERY.fromWeek) return [];
  const r = stream(s.seed, s.week, "reparto");
  if (r() >= DELIVERY.chance) return [];
  const own = s.contracts.filter((c) => activeIn(c, s.week) && (c.kind === "distribucion" || c.kind === "puntual") && !c.subcontracted).sort((a, b) => a.id.localeCompare(b.id));
  if (!own.length) return [];
  // En la Carrera, cada tipo una vez por semestre (clave «reparto-espera@2»…: lib/sim/calendar.ts).
  const left = DELIVERY_TYPES.filter((t) => !s.answers[semesterKey(`reparto-${t}`, s.week)]);
  if (!left.length) return [];
  const type = [...left].sort((a, b) => fnv1a(`${s.seed}:${a}`) - fnv1a(`${s.seed}:${b}`))[Math.floor(r() * left.length)];
  const c = own[Math.floor(r() * own.length)];
  const name = clientOf(c.clientId).name;
  const base = { id: semesterKey(`reparto-${type}`, s.week), kind: "reparto" as const, week: s.week };
  const data: Record<string, string | number> = { type, contract: c.id, client: c.clientId };
  if (type === "ausente") return [{ ...base, title: "El destinatario no está", data,
    concept: "Si no se puede entregar porque el destinatario no está, el transportista avisa al cargador y espera sus instrucciones; los gastos de esperar y de ejecutarlas los paga el cargador (Ley 15/2009, art. 36). Hasta la entrega, la mercancía es responsabilidad del transportista (art. 47.1).",
    prompt: `Tu conductor llega con la carga de ${name} a la dirección de la carta de porte y la nave del destinatario está cerrada. Nadie contesta al teléfono.` }];
  if (type === "espera") {
    const h = intIn(r, DELIVERY.waitHours.min, DELIVERY.waitHours.max);
    // v10: la ley vigente no cuenta la primera hora; la v9 descontaba dos (redacción de 2009). `horas_libres` solo desde la
    // v10, para que el estado de las partidas v9 guardadas no cambie.
    const free = s.version >= 10 ? DELIVERY.freeHours : DELIVERY.freeHoursV9;
    Object.assign(data, { horas: h, horas_cobrables: h - free, indemnizacion: (h - free) * DELIVERY.paralizacionPerHour, ...(s.version >= 10 ? { horas_libres: free } : {}) });
    return [{ ...base, title: "Horas esperando para descargar", data,
      concept: `Si el camión espera más de una hora a que lo carguen o descarguen por causas que no son del transportista, este puede exigir al cargador una indemnización por paralización: dos veces el IPREM/día por cada hora o fracción, sin contar la primera (Ley 15/2009, art. 22, redacción vigente desde el 02/03/2022).${s.version >= 10 ? "" : " Esta partida usa las reglas v9, que calculaban con la redacción original de 2009 (sin contar las dos primeras horas): por eso aquí se descuentan dos."}`,
      prompt: `El cliente del destino de ${name} tiene a tu camión ${h} horas esperando para descargar, aunque llegó a la hora pactada.` }];
  }
  if (type === "peso") return [{ ...base, title: "El peso declarado no cuadra", data,
    concept: "Si hay sospechas fundadas de que la declaración del cargador es falsa, el transportista puede comprobar el peso y las medidas; si la declaración era falsa, los gastos de la comprobación los paga el cargador (Ley 15/2009, art. 26.1).",
    prompt: `Al cargar para ${name}, la carta de porte dice 9 t, pero el camión va claramente más hundido de lo normal y el conductor sospecha que llevan bastante más.` }];
  if (type === "estiba") return [{ ...base, title: "La carga está mal estibada", data,
    concept: "La carga y la estiba son del cargador, y los daños que causen también, salvo que se pacte por escrito que las haga el transportista a cambio de un suplemento (Ley 15/2009, art. 20.1, redacción vigente desde el 02/03/2022). Pero si el cargador estiba siguiendo las instrucciones del transportista, los daños por mala estiba son del transportista (art. 20.2).",
    prompt: `El personal de ${name} ha cargado los palés sin calzar y apilados de forma inestable. Tienen prisa y piden a tu conductor que salga ya.` }];
  if (type === "bultos") return [{ ...base, title: "Los bultos no coinciden con la carta de porte", data: { ...data, palets_documento: 14, palets_cargados: 14 - DELIVERY.missingPallets },
    concept: "Los bultos tienen que estar identificados y coincidir con lo que dice la carta de porte (Ley 15/2009, art. 21.1). Una diferencia se anota al cargar: si no, al entregar parecerá que se han perdido en tu camión.",
    prompt: `La carta de porte de ${name} dice 14 palés, pero han cargado ${14 - DELIVERY.missingPallets}.` }];
  const km = intIn(r, DELIVERY.detourKm.min, DELIVERY.detourKm.max, 10);
  Object.assign(data, { km_extra: km, coste_extra: round2(km * P.variablePerKm) });
  return [{ ...base, title: "El cliente cambia el destino a mitad de viaje", data,
    concept: "El cargador puede ordenar durante el viaje que la mercancía se entregue en otro lugar o a otro destinatario (Ley 15/2009, art. 29.1). El transportista tiene derecho a cobrar los gastos de ejecutar esas instrucciones (art. 36.3).",
    prompt: `Con el camión en ruta, ${name} llama: la carga ya no va al destino de la carta de porte, sino a otro almacén ${km} km más lejos.` }];
}

export const isDelivery = (kind: string) => kind === "reparto";

export function deliveryOptions(inc: Incident): IncidentOption[] {
  const o = (id: string, label: string, grade: Grade, feedback: string): IncidentOption => ({ id, label, grade, feedback });
  const d = inc.data;
  switch (d.type as DeliveryType) {
    case "ausente": return [
      o("avisar", "Avisar al cargador, esperar sus instrucciones y cobrarle los gastos de la nueva entrega", "correcta", "Correcto: es lo que prevé la ley (art. 36.1). Como avisaste, los gastos de esperar y de volver los paga el cargador (art. 36.3)."),
      o("puerta", "Dejar los palés junto a la puerta y hacer una foto", "grave", `Hasta la entrega, la mercancía es responsabilidad tuya (art. 47.1). Esa noche desaparecen dos palés: pagas ${eur(DELIVERY.stolenGoods)} (importe simulado) y el cliente deja de confiar en ti.`),
      o("volver", "Volver al almacén y repetir la entrega mañana sin decir nada", "razonable", `La mercancía queda a salvo, pero sin avisar al cargador no puedes cobrarle los gastos: el retorno y la nueva entrega (${eur(DELIVERY.returnTripCost)}) los pagas tú.`),
    ];
    case "espera": return [
      o("reclamar", "Anotar las horas de llegada y de salida en el documento de entrega y reclamar la paralización al cargador", "correcta", `Correcto: pasada la primera hora hay derecho a indemnización (art. 22)${d.horas_libres === undefined ? "; con las reglas v9 de esta partida se descuentan dos" : ""}. ${d.horas_cobrables} horas cobrables × ${eur(DELIVERY.paralizacionPerHour)} = ${eur(Number(d.indemnizacion))} (importe simulado: depende del IPREM). Sin las horas anotadas, no podrías probarlo.`),
      o("irse", "Irte sin descargar para no perder más tiempo", "grave", "Dejas la entrega sin hacer: el cliente no recibe su mercancía, falla tu servicio y lo pierdes como cliente. La espera se reclama, no se resuelve marchándose."),
      o("esperar", "Esperar sin decir nada: es lo normal en el sector", "razonable", "Entregas, pero pierdes el dinero que la ley te reconoce por la espera (art. 22) y el cliente se acostumbra a hacerte esperar."),
    ];
    case "peso": return [
      o("pesar", "Pesar la carga en una báscula antes de salir; si el peso declarado es falso, los gastos los paga el cargador", "correcta", "Correcto: con sospechas fundadas puedes comprobar el peso, y si la declaración era falsa, los gastos son del cargador (art. 26.1). Sales con la carga corregida y sin riesgo de multa."),
      o("salir", "Salir igualmente: el peso lo declaró el cliente", "grave", `En un control de carretera, el camión va con exceso de peso: inmovilización hasta descargar el exceso y multa de ${eur(DELIVERY.overweightFine)} (importe simulado). La ley te deja comprobarlo (art. 26.1): no hacerlo te sale caro.`),
      o("negarse", "Negarte a cargar sin más explicaciones", "razonable", "Evitas la multa, pero sin comprobar nada puede que el peso fuera correcto y pierdes la carga y la confianza del cliente. Comprobar el peso es tu derecho (art. 26.1)."),
    ];
    case "estiba": return [
      o("escrito", "Pedir que corrijan la estiba antes de salir y, si no lo hacen, dejar constancia escrita del defecto en la carta de porte", "correcta", "Correcto: la estiba es del cargador (art. 20.1). Dejarlo por escrito te protege si luego hay daños."),
      o("indicar", "Decirles tú cómo colocarlos y salir sin dejar nada por escrito", "grave", `Si estiban siguiendo tus instrucciones, los daños por mala estiba son tuyos (art. 20.2). En una curva se vuelca un palé: pagas ${eur(DELIVERY.stowageDamage)} (importe simulado).`),
      o("salir", "Salir tal cual: la estiba es cosa del cargador", "razonable", `La ley te da la razón (art. 20.1), pero sin nada por escrito, cuando se daña la mercancía, la discusión te cuesta ${eur(DELIVERY.stowageDispute)} (importe simulado).`),
    ];
    case "bultos": return [
      o("anotar", "Anotar la diferencia en la carta de porte al cargar y avisar al cargador", "correcta", "Correcto: los bultos deben coincidir con la carta de porte (art. 21.1). Con la diferencia anotada, nadie podrá decir que los palés se perdieron en tu camión."),
      o("firmar", "Firmar la carta de porte tal cual y salir", "grave", `Al entregar faltan ${DELIVERY.missingPallets} palés y la carta de porte firmada dice 14: parece que se han perdido en tu camión. Pagas ${eur(DELIVERY.missingPallets * DELIVERY.palletValue)} (importe simulado).`),
      o("destino", "No decir nada y que lo aclaren en destino", "razonable", `Al final se aclara, pero la discusión entre cargador y destinatario te salpica: ${eur(DELIVERY.disputeCost)} de gastos (importe simulado). Se resuelve en el momento de cargar.`),
    ];
    default: return [
      o("cobrar", `Aceptar el cambio y cobrarle los ${d.km_extra} km de más`, "correcta", `Correcto: el cargador tiene derecho a cambiar el destino (art. 29.1) y tú a cobrar el coste de hacerlo (art. 36.3): ${eur(Number(d.coste_extra))} de gasóleo, mantenimiento y peajes que no pagas tú.`),
      o("negarse", "Negarte: la carta de porte dice otro destino", "grave", "El cargador puede disponer de su mercancía durante el viaje (art. 29.1). Negarte es incumplir: el cliente lo vive como un fallo de servicio y deja de trabajar contigo."),
      o("gratis", "Aceptar sin cobrar nada para tener contento al cliente", "razonable", `El cliente queda contento, pero pagas tú ${eur(Number(d.coste_extra))} que la ley te permitía cobrarle (art. 36.3).`),
    ];
  }
}

/** Consecuencias: costes o ingresos al cerrar la semana, servicio fallado o un cliente que se va. */
export function applyDeliveryDecision(s: SimState, inc: Incident, option: string) {
  const w = s.week;
  const c = s.contracts.find((x) => x.id === inc.data.contract)!;
  const name = clientOf(c.clientId).name;
  const charge = (label: string, amount: number, note: string, unserved = 0) => (s.claims ??= []).push({ label, amount: round2(amount), note, ...(unserved ? { unserved } : {}) });
  const leave = () => { for (const x of s.contracts) if (x.clientId === c.clientId && activeIn(x, w + 1)) x.cancelledWeek = w + 1; };
  const d = inc.data;
  switch (d.type as DeliveryType) {
    case "ausente":
      if (option === "avisar") charge("", 0, `${name}: avisas al cargador y entregas al día siguiente a su cargo.`);
      if (option === "puerta") { charge(`Mercancía desaparecida en destino: ${name}`, DELIVERY.stolenGoods, `${name}: desaparecen dos palés que dejaste en la puerta.`); leave(); }
      if (option === "volver") charge(`Retorno y nueva entrega: ${name}`, DELIVERY.returnTripCost, `${name}: repites la entrega a tu cargo.`);
      return;
    case "espera":
      if (option === "reclamar") charge(`Indemnización por paralización cobrada a ${name}`, -Number(d.indemnizacion), `${name}: te paga ${eur(Number(d.indemnizacion))} por la espera.`);
      if (option === "irse") { charge("", 0, `${name}: la entrega se queda sin hacer.`, 100); leave(); }
      return;
    case "peso":
      if (option === "salir") charge(`Multa por exceso de peso: ${name}`, DELIVERY.overweightFine, `Control en carretera con la carga de ${name}: exceso de peso.`);
      if (option === "negarse") charge("", 0, `${name}: no cargas y el cliente no lo entiende.`, 50);
      return;
    case "estiba":
      if (option === "indicar") charge(`Daños por mala estiba: ${name}`, DELIVERY.stowageDamage, `Se vuelca un palé de ${name} en ruta.`);
      if (option === "salir") charge(`Discusión por daños de estiba: ${name}`, DELIVERY.stowageDispute, `Daños de estiba en la carga de ${name}, sin nada por escrito.`);
      return;
    case "bultos":
      if (option === "firmar") charge(`Palés que faltan: ${name}`, DELIVERY.missingPallets * DELIVERY.palletValue, `Faltan ${DELIVERY.missingPallets} palés de ${name} y la carta de porte firmada dice 14.`);
      if (option === "destino") charge(`Gastos de la discusión de bultos: ${name}`, DELIVERY.disputeCost, `Discusión sobre los palés de ${name}.`);
      return;
    default:
      if (option === "gratis") charge(`Kilómetros de más sin cobrar: ${name}`, Number(d.coste_extra), `${name}: cambias el destino sin cobrar los ${d.km_extra} km de más.`);
      if (option === "negarse") { charge("", 0, `${name}: te niegas a cambiar el destino.`, 100); leave(); }
  }
}
