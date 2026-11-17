import { round2, sum } from "../learning/money";
import { fnv1a } from "../learning/order";
import type { Grade, SimState, WeekRecord } from "./model";
import { P, RELIABILITY_PREMIUM, WEEKS_PER_MONTH } from "./params";

/**
 * Preguntas del informe mensual (17/11/2026, petición del dueño: «más preguntas y más variadas»). Hasta ese día había UNA
 * en toda la temporada (mes 1: caja frente a resultado). Ahora, al cerrar cada mes (cada 4 semanas):
 * - una pregunta con TUS números de ese mes (cobro, ocupación, punto muerto, coste por km, beneficio frente a caja);
 * - una de concepto o de ley (solo normativa ya comprobada en el BOE; ver docs/simulador.md §19).
 * Cuáles salen lo decide la semilla, sin repetir en la temporada. Las cifras salen del historial CERRADO de ese mes, así
 * que la respuesta correcta no cambia aunque se conteste más tarde. Responder solo es aprendizaje: no toca la economía.
 * Cada opción incorrecta es un error típico, con su explicación.
 */
export interface QuestionOption { id: string; label: string; grade: Grade; feedback: string }
export interface MonthQuestion { id: string; key: string; month: number; topic: string; prompt: string; options: QuestionOption[]; competences: string[] }

/** La pregunta original del mes 1 (id «mes1», que ya está en partidas guardadas). */
export const MONTH_QUESTION = {
  id: "mes1",
  prompt: "En la semana 4 pagaste de golpe el alquiler y las nóminas del mes. ¿Por qué la caja ha bajado mucho más que el resultado de la semana?",
  options: [
    { id: "fijos", label: "Porque los costes fijos se reconocen cada semana pero se pagan juntos cada 4 semanas, y las primeras facturas aún no se han cobrado", grade: "correcta" as Grade, feedback: "Exacto: resultado (devengo) y caja (cobros y pagos) van con calendarios distintos." },
    { id: "perdidas", label: "Porque la empresa ha perdido esa semana exactamente lo que ha bajado la caja", grade: "grave" as Grade, feedback: "No: el resultado de la semana solo incluye la parte de fijos de esa semana; la caja pagó los de cuatro semanas." },
    { id: "amortizacion", label: "Por la amortización del camión", grade: "grave" as Grade, feedback: "La amortización es un coste que no sale de la caja: reparte el valor del camión en el tiempo." },
  ],
};

const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const num = (v: number, d = 0) => v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
const opt = (id: string, label: string, grade: Grade, feedback: string): QuestionOption => ({ id, label, grade, feedback });

type Ctx = { s: SimState; month: number; ws: WeekRecord[] };
type Builder = { key: string; title: string; competences: string[]; build: (c: Ctx) => Omit<MonthQuestion, "id" | "key" | "month" | "topic" | "competences"> | null };

// ── Con tus números del mes ─────────────────────────────────────────────────────────────────────────────────────────
const NUMBERS: Builder[] = [
  { key: "cobro", title: "periodo medio de cobro", competences: ["0623-RA5"], build: ({ s, ws }) => {
    const from = ws[0].week, to = ws.at(-1)!.week;
    const paid = s.receivables.filter((i) => i.paidWeek !== undefined && i.paidWeek >= from && i.paidWeek <= to);
    if (paid.length < 2) return null;
    const total = sum(paid.map((i) => i.amount));
    const real = round2(sum(paid.map((i) => (i.paidWeek! - i.week) * 7 * i.amount)) / total);
    const pact = round2(sum(paid.map((i) => (i.dueWeek - i.week) * 7 * i.amount)) / total);
    if (Math.abs(real - pact) < 1) return { prompt: `Este mes cobraste ${paid.length} facturas por ${eur(total)}. Todas a su vencimiento: de media, ${num(real)} días después de emitirlas. Si tus clientes pagan siempre así, ¿qué significa para tu caja?`, options: [
      opt("financias", `Que financias a tus clientes unos ${num(real)} días: haces el trabajo y pagas gasóleo y nóminas mucho antes de cobrarlo`, "correcta", "Exacto: el periodo medio de cobro es el tiempo que tu dinero está «prestado» al cliente. Por eso hace falta caja o una póliza aunque la empresa gane dinero."),
      opt("nada", "Nada: si pagan a su vencimiento, la caja no se ve afectada", "grave", "Sí se ve: aunque paguen puntuales, cobras semanas después de haber pagado los costes del trabajo."),
      opt("beneficio", "Que el beneficio de esas semanas es menor", "grave", "El beneficio no depende de cuándo cobras: se cuenta al hacer el trabajo (devengo). Lo que cambia es la caja."),
    ] };
    return { prompt: `Este mes cobraste ${paid.length} facturas por ${eur(total)}. De media, pactadas a ${num(pact)} días, pero las cobraste ${num(real)} días después de emitirlas (media ponderada por importe). ¿Cuál es tu periodo medio de cobro real y qué indica?`, options: [
      opt("real", `${num(real)} días: algún cliente paga más tarde de lo pactado y esa diferencia la pones tú con tu caja`, "correcta", "Correcto: el periodo medio de cobro real se mide con las fechas de cobro, no con las pactadas. Si supera al pactado, hay clientes en mora: reclámalo por escrito (Ley 15/2009, art. 41)."),
      opt("pactado", `${num(pact)} días, que es lo pactado`, "razonable", "Ese es el plazo pactado, no el real: el real se calcula con la fecha en que de verdad cobraste."),
      opt("suma", `${num(real + pact)} días`, "grave", "No se suman: el periodo medio es la media de días entre emitir y cobrar cada factura."),
    ] };
  } },
  { key: "ocupacion", title: "ocupación del almacén", competences: ["0625-RA3"], build: ({ ws }) => {
    const stored = sum(ws.map((w) => w.palletsStored - (w.palletsHeld ?? 0)));
    const cap = sum(ws.map((w) => w.palletCapacity ?? P.warehousePallets));
    if (!stored) return null;
    const pct = Math.round(stored / cap * 100);
    const peak = Math.max(...ws.map((w) => w.palletsStored));
    const wrong = Math.round(peak / (ws[0].palletCapacity ?? P.warehousePallets) * 100);
    const alt = wrong !== pct ? wrong : pct >= 85 ? pct - 15 : pct + 15;
    return { prompt: `Este mes, semana a semana, guardaste ${ws.map((w) => num(w.palletsStored)).join(", ")} palés en un almacén de ${ws.map((w) => num(w.palletCapacity ?? P.warehousePallets)).join(", ")} palés. ¿Cuál fue tu ocupación media del mes?`, options: [
      opt("media", `${pct} %`, "correcta", `Correcto: palés guardados en el mes (${num(stored)}) entre la capacidad del mes (${num(cap)}). Es la que cuenta para el objetivo de ocupación.`),
      opt("pico", `${alt} %`, "grave", "Esa es la ocupación de la semana más llena (o un cálculo que no usa todas las semanas). La media usa todas las semanas del mes."),
      opt("palets", `${num(Math.round(stored / ws.length))} palés`, "razonable", "Esos son los palés de media, no el porcentaje: falta dividir entre la capacidad."),
    ] };
  } },
  { key: "punto-muerto", title: "punto muerto del camión", competences: ["0623-RA7", "0622-RA3"], build: ({ s, ws }) => {
    const fixed = P.fixedMonthly.conductor / WEEKS_PER_MONTH + P.fixedMonthly.seguro / WEEKS_PER_MONTH + P.amortizationWeek;
    const rates = s.contracts.filter((c) => c.kind === "distribucion" && c.startWeek <= ws.at(-1)!.week && c.endWeek >= ws[0].week).map((c) => c.ratePerKm!);
    const rate = rates.length ? round2(sum(rates) / rates.length) : 1.3;
    const margin = round2(rate - P.variablePerKm);
    if (margin <= 0.05) return null;
    const km = Math.round(fixed / margin), wrong = Math.round(fixed / rate), wrong2 = Math.round(fixed / P.variablePerKm);
    return { prompt: `Tu camión tiene ${eur(fixed)} a la semana de costes fijos (conductor, seguro y amortización). ${rates.length ? "Tus repartos de este mes pagaron" : "Con una tarifa de reparto de"} ${eur(rate)}/km de media, y cada km te cuesta ${eur(P.variablePerKm)} de gasóleo, mantenimiento y peajes. ¿Cuántos km a la semana necesitas para cubrir esos fijos (punto muerto)?`, options: [
      opt("ok", `${num(km)} km`, "correcta", `Correcto: fijos ÷ margen por km = ${eur(fixed)} ÷ (${eur(rate)} − ${eur(P.variablePerKm)}) = ${num(km)} km. Por debajo pierdes dinero; por encima, cada km deja ${eur(margin)}.`),
      opt("sin-variable", `${num(wrong)} km`, "grave", "Has dividido entre la tarifa entera: olvidas que cada km también cuesta gasóleo, mantenimiento y peajes. El punto muerto usa el margen por km (tarifa − coste variable)."),
      opt("variable", `${num(wrong2)} km`, "grave", "Has dividido entre el coste variable: el punto muerto se calcula con el margen que deja cada km, no con lo que cuesta."),
    ] };
  } },
  { key: "coste-km", title: "coste por km", competences: ["0622-RA3"], build: ({ ws }) => {
    const w = ws.find((x) => x.kmOwn > 0 && Math.abs(x.costVariable - x.kmOwn * P.variablePerKm) < 0.02);
    if (!w) return null;
    const full = round2(P.variablePerKm + (P.fixedMonthly.conductor / WEEKS_PER_MONTH + P.fixedMonthly.seguro / WEEKS_PER_MONTH + P.amortizationWeek) / (P.kmPerDay * P.workDays));
    return { prompt: `En la semana ${w.week} tu camión hizo ${num(w.kmOwn)} km y pagaste ${eur(w.costVariable)} de gasóleo, mantenimiento y peajes. ¿Cuánto te cuesta cada km de coste variable, y para qué sirve saberlo?`, options: [
      opt("ok", `${eur(P.variablePerKm)}/km: es el mínimo que debe pagar un viaje; por debajo, cada km te hace perder dinero`, "correcta", `Correcto: ${eur(w.costVariable)} ÷ ${num(w.kmOwn)} km = ${eur(P.variablePerKm)}/km. Es el suelo de cualquier tarifa; para que el negocio gane, la tarifa tiene que cubrir además los fijos (${eur(full)}/km a plena capacidad).`),
      opt("completo", `${eur(full)}/km, que es lo mínimo que debe pagar cualquier viaje`, "razonable", `Ese es el coste completo a plena capacidad (con conductor, seguro y amortización). El variable es ${eur(P.variablePerKm)}/km; un hueco suelto puede aceptarse por encima del variable aunque no cubra el completo.`),
      opt("tarifa", "No se puede saber sin conocer la tarifa del cliente", "grave", "El coste por km es tuyo, no depende de lo que pague el cliente: gasto ÷ km recorridos."),
    ] };
  } },
  { key: "resultado-caja", title: "resultado frente a caja", competences: ["0623-RA6"], build: ({ s, ws }) => {
    const result = round2(sum(ws.map((w) => w.result)));
    const start = ws[0].week <= 1 ? P.initialCash : s.weeks.find((w) => w.week === ws[0].week - 1)!.cashEnd;
    const delta = round2(ws.at(-1)!.cashEnd - start);
    if (Math.abs(delta - result) < 200) return null;
    return { prompt: `Este mes tu resultado fue ${eur(result)}, pero tu caja ${delta >= 0 ? "subió" : "bajó"} ${eur(Math.abs(delta))}. ¿Qué explica sobre todo la diferencia?`, options: [
      opt("calendario", "Que se cobra y se paga en fechas distintas de cuando se gana o se gasta: facturas a 30 días, fijos cada 4 semanas, fianzas o compras", "correcta", "Correcto: el resultado cuenta lo ganado y gastado (devengo); la caja, lo cobrado y pagado. Sus calendarios no coinciden."),
      opt("amortizacion", "La amortización del camión", "razonable", `Influye (es un gasto que no sale de la caja: ${eur(P.amortizationWeek)} a la semana), pero aquí la diferencia es de ${eur(Math.abs(delta - result))}: la causa principal son las fechas de cobro y pago.`),
      opt("error", "Un error de la contabilidad: deberían coincidir", "grave", "No deben coincidir: el balance cuadra (compruébalo en Finanzas). Beneficio y caja son dos cosas distintas."),
    ] };
  } },
  { key: "uso-camion", title: "uso del camión", competences: ["0622-RA2", "0623-RA7"], build: ({ ws }) => {
    const own = sum(ws.map((w) => w.kmOwn)), cap = sum(ws.map((w) => w.kmCapacity));
    if (!cap) return null;
    const pct = Math.round(own / cap * 100), idle = cap - own;
    return { prompt: `Este mes tu camión podía hacer ${num(cap)} km y hizo ${num(own)}. ¿Qué uso tuvo y qué significa?`, options: [
      opt("ok", `${pct} %: ${num(idle)} km de capacidad que pagaste (conductor, seguro, amortización) y no usaste`, "correcta", `Correcto: ${num(own)} ÷ ${num(cap)} = ${pct} %. Los costes fijos se pagan igual con el camión parado; cuanto más alto el uso, menos cuesta cada km.`),
      opt("inverso", `${100 - pct} %`, "grave", "Ese es el porcentaje que NO usaste: el uso es km hechos ÷ km posibles."),
      opt("bien", `${pct} %, y no importa: el camión parado no gasta`, "razonable", `El cálculo es correcto, pero parado no gasta gasóleo; el conductor, el seguro y la amortización se pagan igual.`),
    ] };
  } },
  { key: "ingreso-km", title: "ingreso por km", competences: ["0622-RA3"], build: ({ ws }) => {
    const km = sum(ws.map((w) => w.kmOwn + w.kmSubcontracted)), rev = sum(ws.map((w) => w.revenueTransport));
    if (km < 300 || !rev) return null;
    const perKm = round2(rev / km);
    return { prompt: `Este mes facturaste ${eur(rev)} de transporte por ${num(km)} km (propios y subcontratados). ¿Cuánto ingresaste de media por km?`, options: [
      opt("ok", `${eur(perKm)}/km`, "correcta", `Correcto: ${eur(rev)} ÷ ${num(km)} km. Compáralo con tu coste completo por km para saber si el transporte gana dinero.`),
      opt("x2", `${eur(round2(rev / (km * 2)))}/km`, "grave", "Has dividido entre el doble de km: los km del mes ya incluyen las vueltas."),
      opt("coste", `${eur(P.variablePerKm)}/km`, "grave", "Ese es tu coste variable por km, no tu ingreso."),
    ] };
  } },
];

// ── Concepto y normativa (solo lo comprobado en el BOE: docs/simulador.md §19) ────────────────────────────────────────
const CONCEPTS: Builder[] = [
  { key: "mora", title: "plazo de mora", competences: ["0623-RA5"], build: () => ({ prompt: "Un cliente te encargó un transporte por carretera y no ha pagado la factura. ¿A los cuántos días incurre en mora?", options: [
    opt("30", "A los 30 días", "correcta", "Correcto: en el transporte por carretera, quien paga incurre en mora a los 30 días (Ley 15/2009, art. 41)."),
    opt("60", "A los 60 días", "grave", "60 días es el máximo que se puede pactar en otros servicios entre empresas (Ley 3/2004, art. 4), no el plazo de mora del transporte."),
    opt("pacto", "Cuando lo diga el contrato, sin límite", "grave", "No: en el transporte la mora llega a los 30 días, y en los demás servicios el plazo pactado nunca puede pasar de 60 (Ley 3/2004, art. 4.3)."),
  ] }) },
  { key: "reservas", title: "reservas por daños", competences: ["0622-RA6"], build: () => ({ prompt: "El destinatario recibe una mercancía con un daño que no se ve por fuera. ¿Hasta cuándo puede hacer reservas por escrito?", options: [
    opt("7", "Hasta 7 días naturales después de la entrega", "correcta", "Correcto: para averías no manifiestas, 7 días; sin reservas se presume que llegó bien (Ley 15/2009, art. 60.1). Para el retraso, el plazo es de 21 días (art. 60.3)."),
    opt("21", "Hasta 21 días después de la entrega", "razonable", "21 días es el plazo para reclamar por retraso (art. 60.3). Para un daño no manifiesto son 7 días (art. 60.1)."),
    opt("entrega", "Solo en el momento de la entrega", "grave", "En el momento de la entrega se reclaman los daños que se ven. Para los que no se ven hay 7 días (art. 60.1)."),
  ] }) },
  { key: "subcontrata", title: "responsabilidad al subcontratar", competences: ["0622-RA3"], build: () => ({ prompt: "Subcontratas un reparto a otro transportista y la mercancía llega dañada. ¿Quién responde ante tu cliente?", options: [
    opt("yo", "Tú, como transportista que contrató con el cliente", "correcta", "Correcto: quien contrata con el cargador responde de todo el transporte aunque no lo haga él (Ley 15/2009, art. 6.1). Luego puedes reclamar al subcontratista."),
    opt("sub", "El subcontratista, porque fue quien lo transportó", "grave", "Ante tu cliente respondes tú (art. 6.1). El subcontratista te responde a ti."),
    opt("nadie", "Nadie, si el subcontratista tiene seguro", "grave", "El seguro no cambia quién responde ante el cliente: eres tú (art. 6.1)."),
  ] }) },
  { key: "cmr", title: "documentos de un viaje internacional", competences: ["0622-RA5"], build: () => ({ prompt: "Llevas un camión completo de Valencia a Lyon (Francia). ¿Qué documentos tienen que ir en el camión?", options: [
    opt("ok", "La carta de porte CMR (con los datos del documento de control) y la copia certificada de la licencia comunitaria", "correcta", "Correcto: el Convenio CMR se aplica cuando la carga y la entrega están en dos países (art. 1); con los datos del documento de control, el CMR sirve como tal (Orden FOM/2861/2012, art. 2.2)."),
    opt("dua", "El CMR y el DUA de exportación", "grave", "Francia está en la UE: no hay aduana ni DUA en un transporte entre países de la UE."),
    opt("bl", "El conocimiento de embarque (B/L)", "grave", "El B/L es del transporte marítimo. Por carretera, la carta de porte es el CMR."),
  ] }) },
  { key: "exw", title: "Incoterms: EXW", competences: ["0622-RA1"], build: () => ({ prompt: "Tu cliente vende su mercancía a un comprador extranjero en condiciones EXW (en fábrica). ¿Quién contrata y paga el transporte principal?", options: [
    opt("comprador", "El comprador: con EXW el vendedor solo pone la mercancía a su disposición en sus instalaciones", "correcta", "Correcto: en EXW el comprador asume el transporte y los riesgos desde que la mercancía está a su disposición. Si te contratan, el cliente será el comprador o su transitario."),
    opt("vendedor", "El vendedor, que es tu cliente", "grave", "Con EXW el vendedor no contrata el transporte principal: es la regla con menos obligaciones para él."),
    opt("mitad", "Se reparten el coste a medias", "grave", "Los Incoterms reparten tareas y riesgos, no el precio a medias: con EXW, el transporte es del comprador."),
  ] }) },
  { key: "fianza", title: "fianza de una nave", competences: ["0625-RA1", "0623-RA6"], build: () => ({ prompt: "Alquilas una nave para ampliar el almacén. ¿Cuánta fianza exige la ley y cómo se contabiliza?", options: [
    opt("ok", "Dos mensualidades de renta; es dinero tuyo que te devolverán: sale de la caja, pero no es un gasto", "correcta", "Correcto: en un alquiler para uso distinto de vivienda la fianza es de dos mensualidades (Ley de Arrendamientos Urbanos, art. 36.1). Va al activo, no a la cuenta de resultados."),
    opt("gasto", "Dos mensualidades, y es un gasto del mes", "razonable", "La cuantía es correcta (LAU, art. 36.1), pero no es un gasto: te la devuelven al irte. Sale de la caja sin reducir el beneficio."),
    opt("una", "Una mensualidad, como en una vivienda", "grave", "Una mensualidad es para las viviendas. Para uso distinto de vivienda son dos (LAU, art. 36.1)."),
  ] }) },
  { key: "abc", title: "método ABC", competences: ["0625-RA2"], build: () => ({ prompt: "Reorganizas el almacén con el método ABC. ¿Dónde colocas los productos de clase A?", options: [
    opt("cerca", "Cerca de la zona de expedición, en los huecos más accesibles: son los que más se mueven", "correcta", "Correcto: la clase A son los pocos productos que concentran la mayoría de los movimientos. Acercarlos ahorra recorridos y tiempo de preparación."),
    opt("fondo", "Al fondo, porque son los más valiosos y hay que protegerlos", "grave", "El ABC del almacén se basa en la rotación (cuánto se mueven), no en el valor: lo que más se mueve, más cerca."),
    opt("alto", "En las estanterías más altas, para dejar libre el suelo", "grave", "Lo que más se mueve tiene que estar en lo más accesible; lo alto y lo del fondo, para la clase C."),
  ] }) },
  { key: "punto-pedido", title: "punto de pedido", competences: ["0625-RA4"], build: ({ s, month }) => {
    const h = fnv1a(`${s.seed}:${month}:pp`);
    const d = 20 + (h % 9) * 5, L = 3 + (h % 6), ss = d * (2 + (h % 3));
    return { prompt: `Un producto se vende a ${d} unidades al día, el proveedor tarda ${L} días en servir y quieres ${ss} unidades de stock de seguridad. ¿En qué nivel de existencias lanzas el pedido?`, options: [
      opt("ok", `${num(d * L + ss)} unidades`, "correcta", `Correcto: demanda diaria × plazo + stock de seguridad = ${d} × ${L} + ${ss} = ${num(d * L + ss)}.`),
      opt("sin", `${num(d * L)} unidades`, "razonable", "Te falta el stock de seguridad: con cualquier retraso del proveedor te quedarías sin producto."),
      opt("semana", `${num(d * L * 7 + ss)} unidades`, "grave", "Has multiplicado por 7 como si el plazo fuera en semanas: pedirías muchísimo antes de tiempo."),
    ] };
  } },
  { key: "reputacion", title: "reputación y precio", competences: ["0622-RA2"], build: () => ({ prompt: `En este juego, ¿qué consigues si mantienes un nivel de servicio del ${RELIABILITY_PREMIUM.minServicePct} % o más?`, options: [
    opt("prima", `Que los clientes te paguen un ${Math.round((RELIABILITY_PREMIUM.factor - 1) * 100)} % más: valoran a un proveedor que cumple`, "correcta", "Correcto: la reputación es dinero. Cumplir lo pactado (no aceptar lo que no puedes servir, avisar a tiempo) se paga."),
    opt("nada", "Nada: los clientes solo miran el precio", "grave", "En este juego, y en el transporte real, la fiabilidad se paga: un fallo en la entrega le cuesta caro al cliente."),
    opt("mas-ofertas", "Que te lleguen el doble de ofertas", "razonable", "Una mala reputación sí te quita ofertas, pero lo que gana una buena es una prima en el precio."),
  ] }) },
  { key: "cip", title: "Incoterms: CIP o CIF", competences: ["0622-RA1"], build: () => ({ prompt: "Tu cliente vende mercancía que irá en camión hasta Lyon. Paga él el transporte y quiere incluir el seguro. ¿Qué Incoterm usa?", options: [
    opt("cip", "CIP Lyon", "correcta", "Correcto: CIP sirve para cualquier modo de transporte e incluye el seguro (desde Incoterms® 2020, con cobertura amplia, cláusulas A)."),
    opt("cif", "CIF Lyon", "grave", "CIF es solo para transporte marítimo y vías navegables; Lyon por carretera necesita una regla multimodal: CIP."),
    opt("cpt", "CPT Lyon", "razonable", "CPT también es multimodal y el vendedor paga el transporte, pero no incluye el seguro."),
  ] }) },
  { key: "fob", title: "Incoterms marítimos", competences: ["0622-RA1"], build: () => ({ prompt: "¿Para qué tipo de transporte están pensadas las reglas FAS, FOB, CFR y CIF?", options: [
    opt("mar", "Solo para transporte marítimo y por vías navegables", "correcta", "Correcto: para camión, avión, tren o contenedor multimodal se usan EXW, FCA, CPT, CIP, DAP, DPU o DDP."),
    opt("todo", "Para cualquier transporte", "grave", "No: esas cuatro son solo marítimas. Con camión se usan las multimodales (FCA, CPT, CIP, DAP…)."),
    opt("aereo", "Para el transporte aéreo", "grave", "El aéreo usa reglas multimodales (FCA, CPT, CIP…); FOB y CIF son marítimas."),
  ] }) },
  { key: "dap-riesgo", title: "Incoterms: riesgo en DAP", competences: ["0622-RA1", "0622-RA7"], build: () => ({ prompt: "Una venta en DAP Múnich: el camión vuelca en Francia. ¿Quién soporta el riesgo de la mercancía?", options: [
    opt("vendedor", "El vendedor: en DAP el riesgo es suyo hasta que la mercancía llega a Múnich, lista para descargar", "correcta", "Correcto: en las reglas D el vendedor asume el riesgo hasta destino. Por eso le conviene asegurarla, aunque DAP no le obligue."),
    opt("comprador", "El comprador, porque la mercancía ya salió de España", "grave", "En DAP el riesgo pasa al comprador en destino, no al salir."),
    opt("transportista", "Solo el transportista", "razonable", "El transportista responde de los daños con los límites legales, pero entre vendedor y comprador el riesgo es del vendedor hasta destino."),
  ] }) },
  { key: "iva-ue", title: "IVA en una venta a otro país de la UE", competences: ["0627-RA4"], build: () => ({ prompt: "Una empresa española vende a una empresa alemana con NIF-IVA válido. ¿Cómo se factura el IVA?", options: [
    opt("exenta", "Sin IVA (entrega intracomunitaria exenta), se declara en el modelo 349 y se guarda la prueba del transporte (CMR firmado)", "correcta", "Correcto: el comprador ingresa el IVA en Alemania. Sin prueba de que la mercancía salió de España, Hacienda podría exigir el IVA."),
    opt("21", "Con el 21 % de IVA español", "grave", "Entre empresas de la UE con NIF-IVA, la entrega intracomunitaria va sin IVA español."),
    opt("dua", "Con un DUA de exportación", "grave", "Dentro de la UE no hay DUA: es una entrega intracomunitaria, no una exportación."),
  ] }) },
  { key: "cmr-titulo", title: "CMR frente a B/L", competences: ["0622-RA5", "0826-RA3"], build: () => ({ prompt: "¿Por qué un cobro documentario protege poco al vendedor cuando la mercancía va en camión?", options: [
    opt("titulo", "Porque el CMR no es un título de la mercancía: el destinatario puede recogerla sin entregar ningún documento", "correcta", "Correcto: el conocimiento de embarque marítimo (B/L) sí representa la mercancía; el CMR solo prueba el contrato de transporte. Por carretera conviene un anticipo o una garantía."),
    opt("caro", "Porque el banco cobra demasiado", "razonable", "El coste importa, pero el problema de fondo es que el CMR no da control sobre la mercancía."),
    opt("prohibido", "Porque está prohibido usarlo por carretera", "grave", "No está prohibido; simplemente protege poco por carretera."),
  ] }) },
  { key: "eur1", title: "origen preferencial", competences: ["0627-RA5"], build: () => ({ prompt: "¿Para qué sirve el certificado de circulación EUR.1?", options: [
    opt("origen", "Para acreditar el origen preferencial y pagar un arancel reducido en países con acuerdo con la UE que lo prevén", "correcta", "Correcto: solo sirve con países que tienen ese acuerdo; dentro de la UE no se usa."),
    opt("ue", "Para vender a otros países de la UE", "grave", "Dentro de la UE no hay aduana ni aranceles: el EUR.1 no se usa."),
    opt("calidad", "Para certificar la calidad de la mercancía", "grave", "El EUR.1 acredita el origen, no la calidad."),
  ] }) },
  { key: "pago-riesgo", title: "medios de pago", competences: ["0826-RA3"], build: () => ({ prompt: "Un cliente nuevo de un país que no conoces. ¿Qué medio de pago protege más al vendedor?", options: [
    opt("cd", "Un crédito documentario confirmado por un banco español", "correcta", "Correcto: el banco se compromete a pagar si presentas los documentos conformes. Es seguro, aunque caro y con papeleo."),
    opt("abierta", "Cuenta abierta a 60 días", "grave", "Es la opción más arriesgada para el vendedor: envías y confías en que te pague."),
    opt("remesa", "Remesa simple", "razonable", "Más segura que la cuenta abierta, pero el banco no garantiza el pago."),
  ] }) },
  { key: "peso-tasable", title: "peso tasable", competences: ["0622-RA3"], build: ({ s, month }) => {
    const h = fnv1a(`${s.seed}:${month}:tasable`);
    const m3 = 2 + (h % 5), kg = 250 + (h % 7) * 50, vol = m3 * 333, tas = Math.max(kg, vol);
    return { prompt: `Envías en grupaje por carretera ${m3} m³ de mercancía que pesan ${num(kg)} kg. Si la agencia aplica la relación habitual de 1 m³ = 333 kg, ¿por cuántos kg te cobra?`, options: [
      opt("ok", `${num(tas)} kg`, "correcta", `Correcto: se cobra por el mayor entre el peso real (${num(kg)} kg) y el volumétrico (${m3} × 333 = ${num(vol)} kg).`),
      opt("real", `${num(kg)} kg`, "grave", `Ese es el peso real; la mercancía ligera y voluminosa paga por volumen: ${num(vol)} kg.`),
      opt("suma", `${num(kg + vol)} kg`, "grave", "No se suman: se cobra por el mayor de los dos."),
    ] };
  } },
  { key: "pale", title: "palé europeo", competences: ["0625-RA2"], build: () => ({ prompt: "¿Qué medidas tiene un palé europeo (EUR)?", options: [
    opt("ok", "1.200 × 800 mm", "correcta", "Correcto: es el estándar en Europa; en un tráiler caben 33."),
    opt("americano", "1.200 × 1.000 mm", "razonable", "Ese es el palé americano o «universal», más ancho."),
    opt("medio", "800 × 600 mm", "grave", "Ese es el medio palé."),
  ] }) },
  { key: "fefo", title: "FIFO y FEFO", competences: ["0625-RA4"], build: () => ({ prompt: "En un almacén de alimentos con fecha de caducidad, ¿qué criterio de salida usas?", options: [
    opt("fefo", "FEFO: sale primero lo que caduca antes", "correcta", "Correcto: con productos perecederos manda la caducidad, no la fecha de entrada."),
    opt("fifo", "FIFO: sale primero lo que entró antes", "razonable", "Suele coincidir, pero si un lote posterior caduca antes, FIFO te haría tirar mercancía."),
    opt("lifo", "LIFO: sale primero lo último que entró", "grave", "Con perecederos, LIFO deja caducar lo más antiguo."),
  ] }) },
  { key: "cross-docking", title: "cross-docking", competences: ["0625-RA2"], build: () => ({ prompt: "¿Qué es el cross-docking?", options: [
    opt("ok", "Recibir la mercancía y enviarla casi sin almacenarla, pasando del muelle de entrada al de salida", "correcta", "Correcto: ahorra espacio y manipulaciones, pero exige coordinar muy bien las llegadas y las salidas."),
    opt("inventario", "Un método de recuento del inventario", "grave", "No: es una forma de mover la mercancía sin almacenarla."),
    opt("devolucion", "La gestión de devoluciones", "grave", "Eso es logística inversa; el cross-docking es tránsito sin almacenaje."),
  ] }) },
  { key: "adr", title: "mercancías peligrosas", competences: ["0622-RA4"], build: () => ({ prompt: "Te piden transportar por carretera baterías de litio clasificadas como mercancía peligrosa. ¿Qué normativa se aplica?", options: [
    opt("adr", "El ADR (acuerdo europeo para el transporte de mercancías peligrosas por carretera)", "correcta", "Correcto: por mar se aplica el código IMDG y por avión las normas IATA."),
    opt("imdg", "El código IMDG", "grave", "El IMDG es para el transporte marítimo."),
    opt("ninguna", "Ninguna especial, si van bien embaladas", "grave", "La mercancía peligrosa tiene su propia normativa en cada modo de transporte: por carretera, el ADR."),
  ] }) },
  { key: "seguro-110", title: "seguro de la mercancía", competences: ["0622-RA7"], build: () => ({ prompt: "En una venta CIP, ¿por qué capital se asegura normalmente la mercancía?", options: [
    opt("110", "Por el 110 % del precio del contrato", "correcta", "Correcto: el 10 % de más cubre gastos y parte del beneficio esperado. Es el mínimo que exigen CIP y CIF."),
    opt("100", "Por el 100 % del precio", "razonable", "Se queda corto: lo habitual y lo mínimo en CIP y CIF es el 110 %."),
    opt("coste", "Por el coste de fabricación", "grave", "Se asegura sobre el precio de venta, no sobre el coste."),
  ] }) },
  { key: "carta-porte", title: "carta de porte nacional", competences: ["0622-RA5"], build: () => ({ prompt: "En un transporte dentro de España, ¿quién puede exigir que se haga una carta de porte?", options: [
    opt("ambos", "Cualquiera de las partes del contrato", "correcta", "Correcto: cualquiera de las partes puede exigirla (Ley 15/2009, art. 10). Con los datos del documento de control, sirve también como tal (Orden FOM/2861/2012, art. 2.2)."),
    opt("hacienda", "Solo Hacienda", "grave", "La carta de porte es un documento del contrato de transporte; la pueden exigir las partes."),
    opt("nadie", "Nadie: en España no existe", "grave", "Existe y la regula la Ley 15/2009 (art. 10)."),
  ] }) },
  { key: "margen-markup", title: "margen sobre precio y sobre coste", competences: ["0623-RA7"], build: ({ s, month }) => {
    const h = fnv1a(`${s.seed}:${month}:margen`);
    const cost = 800 + (h % 9) * 100, price = Math.round(cost * (1.2 + (h % 4) * 0.05));
    const m = round2((price - cost) / price * 100), mk = round2((price - cost) / cost * 100);
    return { prompt: `Un servicio te cuesta ${eur(cost)} y lo vendes por ${eur(price)}. ¿Cuál es tu margen sobre el precio de venta?`, options: [
      opt("ok", `${num(m, 1)} %`, "correcta", `Correcto: (precio − coste) ÷ precio = ${eur(price - cost)} ÷ ${eur(price)}. Sobre el coste (markup) sería ${num(mk, 1)} %.`),
      opt("markup", `${num(mk, 1)} %`, "razonable", "Ese es el recargo sobre el coste (markup), no el margen sobre el precio. Conviene no confundirlos al negociar."),
      opt("euros", `${num(price - cost)} %`, "grave", "Esa es la diferencia en euros, no un porcentaje."),
    ] };
  } },
  { key: "fondo-maniobra", title: "liquidez", competences: ["0623-RA7"], build: () => ({ prompt: "Una empresa da beneficio todos los meses pero se queda sin caja para pagar las nóminas. ¿Qué le pasa?", options: [
    opt("liquidez", "Tiene un problema de liquidez: cobra más tarde de lo que paga y no tiene caja ni financiación para cubrirlo", "correcta", "Correcto: se puede quebrar con beneficios. Soluciones: cobrar antes, negociar pagos, una póliza o un descuento de facturas."),
    opt("imposible", "Es imposible: si gana dinero, tiene caja", "grave", "Beneficio y caja no son lo mismo: con facturas a 30 o 60 días el dinero llega después."),
    opt("perdidas", "En realidad tiene pérdidas ocultas", "grave", "No hace falta que haya pérdidas: basta con que los cobros lleguen después de los pagos."),
  ] }) },
  { key: "documento-control", title: "documento de control", competences: ["0622-RA5"], build: () => ({ prompt: "¿Dónde tiene que ir el documento de control de un envío por carretera?", options: [
    opt("bordo", "A bordo del vehículo, acompañando a la mercancía", "correcta", "Correcto: es un documento administrativo que debe llevarse a bordo (Orden FOM/2861/2012, art. 3); su falta se sanciona en una inspección."),
    opt("oficina", "Archivado en la oficina, por si lo piden", "grave", "Tiene que ir en el camión: en una inspección en carretera hay que enseñarlo."),
    opt("cliente", "En poder del cliente", "grave", "Va con la mercancía, a bordo del vehículo."),
  ] }) },
];

/** Preguntas del mes `month` (1-6): la del mes 1 se mantiene; después, una con tus números y otra de concepto. */
function questionsFor(s: SimState, month: number): MonthQuestion[] {
  const ws = s.weeks.slice((month - 1) * WEEKS_PER_MONTH, month * WEEKS_PER_MONTH);
  if (ws.length < WEEKS_PER_MONTH) return [];
  const out: MonthQuestion[] = [];
  if (month === 1) out.push({ id: MONTH_QUESTION.id, key: "mes1", month, topic: "caja frente a resultado", prompt: MONTH_QUESTION.prompt, options: MONTH_QUESTION.options, competences: ["0623-RA6", "0623-RA7"] });
  // Cuántas por mes (petición del dueño, 17/11/2026: «más de 2 al mes»): 2 con tus números y 3 de concepto.
  const pick = (bank: Builder[], salt: string, k: number, avoid: Set<string>, allowRepeat: boolean) => {
    const order = [...bank].sort((a, b) => fnv1a(`${s.seed}:${salt}:${month}:${a.key}`) - fnv1a(`${s.seed}:${salt}:${month}:${b.key}`));
    const picked: MonthQuestion[] = [];
    // Primero las que no han salido en la temporada; si faltan (las de tus números), se repiten con los datos del mes.
    for (const pass of allowRepeat ? [false, true] : [false]) for (const b of order) {
      if (picked.length >= k || picked.some((p) => p.key === b.key) || (!pass && avoid.has(b.key))) continue;
      const q = b.build({ s, month, ws });
      if (q) picked.push({ ...q, id: `m${month}-${b.key}`, key: b.key, month, topic: b.title, competences: b.competences });
    }
    return picked;
  };
  const before = new Set<string>();
  for (let m = 1; m < month; m++) for (const q of questionsFor(s, m)) before.add(q.key);
  out.push(...pick(NUMBERS, "num", 2, before, true), ...pick(CONCEPTS, "con", 3, before, false));
  return out;
}

/** Todas las preguntas disponibles hasta ahora (meses cerrados), en orden. */
export function monthQuestions(s: SimState): MonthQuestion[] {
  const months = Math.floor(s.weeks.length / WEEKS_PER_MONTH);
  return Array.from({ length: months }, (_, i) => questionsFor(s, i + 1)).flat();
}
export const pendingQuestions = (s: SimState) => monthQuestions(s).filter((q) => !s.answers[q.id]);
