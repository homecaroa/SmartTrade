import { round2, sum } from "../learning/money";
import { clientOf, handlingRevenue, workOf } from "./market";
import type { Contract, Grade, Incident, IncidentOption, Offer, SimState } from "./model";
import { P, WAREHOUSE_V6, WEEKS_PER_MONTH } from "./params";
import { intIn, stream } from "./rng";

/**
 * Almacén a fondo (reglas v6; docs/simulador.md §17 nonies; módulo 0625):
 * - RA2-RA3: el trabajo del almacén (movimientos y líneas de pedido) consume horas de mozo y se cobra aparte. Si el
 *   trabajo supera la capacidad, horas extra hasta un tope y, lo demás, sin hacer: no se cobra y baja el servicio.
 * - RA2: reorganizar por rotación (ABC) acerca lo que más se mueve a la zona de expedición: el mozo rinde más.
 * - RA4: un cliente te encarga la reposición de un producto y hay que calcular el punto de pedido.
 * - RA5: logística inversa. Las devoluciones son del cliente; lo que sea residuo va a un gestor autorizado y se acredita
 *   por escrito (Ley 7/2022, art. 20.1, comprobado en el BOE el 10/11/2026), en una zona separada e identificada (art. 21.a).
 * Cifras SIMULADAS en WAREHOUSE_V6 (params.ts).
 */
const W = WAREHOUSE_V6;
const activeIn = (c: Contract, w: number) => c.startWeek <= w && w <= c.endWeek && !(c.cancelledWeek !== undefined && w >= c.cancelledWeek);
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Coste semanal de un mozo de plantilla. */
export const WORKER_WEEK = P.fixedMonthly.mozo / WEEKS_PER_MONTH;

export { handlingRevenue, workOf } from "./market";

/** Mozos esa semana: el de plantilla, el de la nave ampliada y los temporales que estén trabajando. */
export function workersAt(s: Pick<SimState, "growth" | "staff">, w: number): number {
  const nave = s.growth?.almacen && w > s.growth.almacen.week ? 1 : 0;
  const temps = (s.staff?.temps ?? []).filter((d) => w > d && w <= d + W.temp.weeks).length;
  return 1 + nave + temps;
}
/** Capacidad de trabajo esa semana, en semanas de mozo (con la reorganización ABC, rinden más). */
export const workCapacityAt = (s: Pick<SimState, "growth" | "staff">, w: number) => round2(workersAt(s, w) * (s.staff?.abcWeek !== undefined && w > s.staff.abcWeek ? 1 + W.abc.productivity : 1));
/** Trabajo comprometido esa semana. */
export const workCommitted = (s: Pick<SimState, "contracts">, w: number) => round2(sum(s.contracts.filter((c) => activeIn(c, w) && c.kind === "almacenaje").map(workOf)));

/** Calificación de una oferta de almacenaje v6: lo que paga frente al alquiler que ocupa y el trabajo que exige. */
export function gradeStorage(s: Pick<SimState, "contracts" | "growth" | "staff">, o: Offer): { grade: Grade; feedback: string } {
  const revenue = round2(o.pallets! * o.palletRate! + handlingRevenue(o));
  const rent = round2(o.pallets! * P.fixedMonthly.alquiler / WEEKS_PER_MONTH / P.warehousePallets);
  const work = round2(workOf(o) * WORKER_WEEK);
  const weeks = Array.from({ length: o.weeks }, (_, i) => o.week + i);
  const peak = Math.max(...weeks.map((w) => (workCommitted(s, w) + workOf(o)) / workCapacityAt(s, w)));
  const load = peak > 1 ? ` Ojo: con ella tu personal estaría al ${Math.round(peak * 100)} % de su capacidad: necesitarás horas extra (un 40 % más caras, como mucho un 20 % más de trabajo) o un mozo temporal.` : "";
  const detail = `Paga ${eur(revenue)} a la semana (sitio ${eur(round2(o.pallets! * o.palletRate!))} y manipulación ${eur(handlingRevenue(o))}); ocupa ${eur(rent)} de alquiler y ${eur(work)} de trabajo de mozo.`;
  if (revenue < rent + work) return { grade: "razonable", feedback: `No cubre su coste completo. ${detail}${load}` };
  return { grade: peak > 1 + W.overtime.maxShare ? "razonable" : "correcta", feedback: `Cubre su coste completo. ${detail}${load}` };
}

/** Por qué no se puede tomar ahora una decisión de organización (null = se puede). */
export function organizeBlocked(s: SimState, opcion: "abc" | "temporal"): string | null {
  if (s.version < W.fromVersion) return "Disponible en las partidas nuevas.";
  if (s.status !== "jugando") return s.status === "incidencia" ? "Primero resuelve la incidencia." : "La partida ha terminado.";
  if (opcion === "abc" && s.staff?.abcWeek !== undefined) return "Ya reorganizaste el almacén.";
  if (opcion === "temporal" && (s.staff?.temps ?? []).some((d) => s.week < d + W.temp.weeks)) return "Ya tienes un mozo temporal contratado.";
  return null;
}

/** Calificación de una decisión de organización con la carga de trabajo de las próximas semanas. */
export function gradeOrganize(s: SimState, opcion: "abc" | "temporal"): { grade: Grade; feedback: string } {
  const ws = [1, 2, 3, 4].map((k) => s.week + k);
  const use = Math.round(Math.max(...ws.map((w) => workCommitted(s, w) / workCapacityAt(s, w))) * 100);
  if (opcion === "abc") {
    const fb = `Colocar cerca de la expedición lo que más rota (clase A) y al fondo lo que casi no se mueve (clase C) reduce recorridos: tu personal rinde un ${W.abc.productivity * 100} % más por ${eur(W.abc.cost)} una sola vez.`;
    return use >= 85 ? { grade: "correcta", feedback: `${fb} Con tu personal al ${use} % en las próximas semanas, compensa.` } : { grade: "razonable", feedback: `${fb} Pero tu personal está al ${use} %: aún no te falta capacidad.` };
  }
  const fb = `Un mozo temporal cuesta ${eur(W.temp.weeklyCost)} a la semana durante ${W.temp.weeks} semanas (más que uno de plantilla, ${eur(WORKER_WEEK)}), pero solo mientras lo necesitas.`;
  const max = Math.round((1 + W.overtime.maxShare) * 100);
  if (use > max) return { grade: "correcta", feedback: `${fb} Tu personal va a estar al ${use} %: ni con horas extra (como mucho hasta el ${max} %) llegaría, y el trabajo sin hacer no se cobra.` };
  if (use > 100) return { grade: "razonable", feedback: `${fb} Tu personal va a estar al ${use} %: una punta así se cubre con horas extra, que salen más baratas que un temporal un mes entero.` };
  return { grade: "razonable", feedback: `${fb} Tu personal está al ${use} %: de momento llega.` };
}

// ── Incidencias del almacén ───────────────────────────────────────────────────────────────────────────────────────

const draw = (seed: number, kind: "stock" | "devoluciones") => {
  const r = stream(seed, 0, `almacen-${kind}`);
  const win = kind === "stock" ? W.stock.window : W.returns.window;
  return { week: intIn(r, win.from, win.to), r };
};
const pickStorage = (s: SimState, kind: string) => {
  const xs = s.contracts.filter((c) => activeIn(c, s.week) && c.kind === "almacenaje" && c.movesWeek !== undefined).sort((a, b) => a.id.localeCompare(b.id));
  return xs.length ? xs[Math.floor(stream(s.seed, s.week, `almacen-${kind}-contrato`)() * xs.length)] : null;
};

export const isWarehouseIncident = (kind: string): kind is "stock" | "devoluciones" => kind === "stock" || kind === "devoluciones";

/** Incidencias del almacén que tocan esta semana (como mucho una de cada por temporada). */
export function warehouseIncidents(s: SimState): Incident[] {
  if (s.version < W.fromVersion) return [];
  const out: Incident[] = [];
  for (const kind of ["stock", "devoluciones"] as const) {
    const d = draw(s.seed, kind);
    const win = kind === "stock" ? W.stock.window : W.returns.window;
    if (s.answers[kind] || s.week < d.week || s.week > win.to) continue;
    const c = pickStorage(s, kind);
    if (!c) continue;
    const name = clientOf(c.clientId).name;
    if (kind === "stock") {
      const r = d.r;
      const daily = intIn(r, 20, 80, 5), lead = intIn(r, 3, 8), safety = daily * intIn(r, 2, 4);
      out.push({ id: "stock", kind: "stock", week: s.week, title: "Calcular el punto de pedido",
        concept: "Punto de pedido = demanda diaria × plazo de entrega del proveedor + stock de seguridad. Se pide cuando las existencias bajan a ese nivel, para que el pedido llegue antes de quedarse sin nada; el stock de seguridad cubre los imprevistos.",
        prompt: `${name} te encarga la reposición de uno de sus productos. Se venden ${daily} unidades al día, el proveedor tarda ${lead} días en servir y el cliente quiere ${safety} unidades de stock de seguridad. ¿Cuándo lanzas el pedido al proveedor?`,
        data: { contract: c.id, client: c.clientId, daily, lead, safety, right: daily * lead + safety, noSafety: daily * lead, weeks: daily * lead * 7 + safety } });
    } else {
      const pallets = intIn(d.r, W.returns.pallets.min, W.returns.pallets.max, 5);
      out.push({ id: "devoluciones", kind: "devoluciones", week: s.week, title: "Llegan devoluciones de un cliente",
        concept: "Logística inversa: la mercancía devuelta se recibe aparte, se inspecciona y se clasifica para revenderla, reacondicionarla o reciclarla. Lo que sea residuo se entrega a un gestor autorizado y se acredita por escrito (Ley 7/2022, art. 20.1); la jerarquía es reutilizar antes que reciclar y reciclar antes que eliminar (art. 8).",
        prompt: `${name} te manda ${pallets} palés de mercancía devuelta por sus clientes: una parte se puede revender, otra está rota. Su contrato no dice nada de devoluciones.`,
        data: { contract: c.id, client: c.clientId, pallets } });
    }
  }
  return out;
}

export function warehouseOptions(inc: Incident): IncidentOption[] {
  const opt = (id: string, label: string, grade: Grade, feedback: string): IncidentOption => ({ id, label, grade, feedback });
  if (inc.kind === "stock") {
    const { daily, lead, safety, right, noSafety, weeks } = inc.data as Record<string, number>;
    const u = (n: number) => `${n.toLocaleString("es-ES")} unidades`;
    return [
      opt("pp", `Pedir cuando queden ${u(right)}`, "correcta", `Correcto: ${daily} × ${lead} días + ${safety} de seguridad = ${u(right)}. El pedido llega cuando aún te queda el stock de seguridad.`),
      opt("sin_ss", `Pedir cuando queden ${u(noSafety)}`, "razonable", `Te olvidaste del stock de seguridad: ${daily} × ${lead} = ${u(noSafety)}. Con cualquier retraso del proveedor o un pico de ventas, el cliente se queda sin producto y te repercute ${eur(W.stock.penaltyShort)}.`),
      opt("semanas", `Pedir cuando queden ${u(weeks)}`, "grave", `Has multiplicado por 7 como si el plazo fuera en semanas: ${u(weeks)}. Pides muchísimo antes de tiempo, el almacén se llena de existencias que nadie necesita y asumes ${eur(W.stock.penaltyExcess)} de sobrestock.`),
    ];
  }
  const p = Number(inc.data.pallets);
  return [
    opt("clasificar", "Recibirlas en una zona separada, inspeccionarlas y clasificarlas, con presupuesto al cliente; lo que esté roto, a un gestor autorizado", "correcta", `Correcto: es un servicio nuevo (${eur(W.returns.sortRate)} por palé, ${eur(p * W.returns.sortRate)}) y lo que es residuo va a gestor autorizado con su justificante (Ley 7/2022, art. 20.1): ${eur(p * W.returns.gestorPerPallet)}.`),
    opt("guardar", "Guardarlas tal cual hasta que el cliente decida qué hacer", "razonable", `No es ilegal, pero ocupan ${p} palés de tu almacén durante ${W.returns.holdWeeks} semanas sin cobrar nada, y la mercancía que se podía revender pierde valor.`),
    opt("contenedor", "Separar lo vendible y tirar lo roto al contenedor del polígono para no ocupar sitio", "grave", `La mercancía es del cliente y no puedes disponer de ella; y los residuos tienen que ir a un gestor autorizado, con prueba documental (Ley 7/2022, art. 20.1), no al contenedor. Inspección y multa: ${eur(W.returns.dumpFine)} (importe simulado).`),
  ];
}

/** Consecuencias: penalizaciones (se cargan al cerrar la semana), un servicio facturado o palés ocupados sin cobrar. */
export function applyWarehouseDecision(s: SimState, inc: Incident, option: string) {
  const w = s.week;
  const c = s.contracts.find((x) => x.id === inc.data.contract)!;
  const name = clientOf(c.clientId).name;
  const charge = (label: string, amount: number, note: string) => (s.claims ??= []).push({ label, amount: round2(amount), note });
  const service = (id: string, pallets: number, rate: number, weeks: number) => {
    s.contracts.push({ id: `${c.id}-${id}`, week: w, kind: "almacenaje", clientId: c.clientId, clientHint: c.clientHint, pallets, palletRate: rate, weeks, payWeeks: c.payWeeks, startWeek: w, endWeek: w + weeks - 1, docPenalized: true });
  };
  if (inc.kind === "stock") {
    if (option === "sin_ss") charge(`Rotura de stock de ${name}`, W.stock.penaltyShort, `${name} se quedó sin producto: te repercute ${eur(W.stock.penaltyShort)}.`);
    if (option === "semanas") charge(`Sobrestock de ${name}`, W.stock.penaltyExcess, `Exceso de existencias de ${name}: asumes ${eur(W.stock.penaltyExcess)}.`);
    return;
  }
  const p = Number(inc.data.pallets);
  if (option === "clasificar") { service("devoluciones", p, W.returns.sortRate, 1); charge(`Gestor de residuos: devoluciones de ${name}`, p * W.returns.gestorPerPallet, `Clasificas las devoluciones de ${name} y entregas lo roto a un gestor autorizado.`); }
  if (option === "guardar") service("devoluciones", p, 0, W.returns.holdWeeks);
  if (option === "contenedor") charge(`Multa por residuos: devoluciones de ${name}`, W.returns.dumpFine, "Inspección: residuos en el contenedor del polígono, sin gestor autorizado.");
}

