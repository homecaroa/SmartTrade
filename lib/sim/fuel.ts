import { round2 } from "../learning/money";
import { clientOf } from "./market";
import type { Contract, Grade, Incident, IncidentOption, SimState } from "./model";
import { CAREER_DEEP, FUEL, P } from "./params";
import { stream } from "./rng";

/**
 * Gasóleo variable y revisión del precio (Carrera, fase B2, reglas v12, 22/11/2026; docs/simulador-carrera.md §1 ter).
 *
 * LEY (Ley 15/2009, art. 38, redacción vigente desde el 02/03/2022; leída en el BOE el 21/11/2026):
 * - Si el precio del combustible varía entre la celebración del contrato y la realización del transporte, el precio
 *   del transporte se revisa al alza o a la baja, según la repercusión del combustible en la estructura de costes. La
 *   variación «se reflejará obligatoriamente en la factura de manera desglosada» (38.1).
 * - Se aplica «en todo caso y de forma automática» cuando el combustible varía un 5 % o más, salvo un umbral menor
 *   pactado por escrito; en el transporte continuado, coincidiendo con el periodo de facturación (38.2).
 * - «El pacto en contrario a lo dispuesto en este artículo se considerará nulo» (38.3).
 *
 * LO QUE ES DEL JUEGO (simplificaciones declaradas):
 * - El precio del gasóleo es un índice semanal (1 = el de la semana 1), sembrado y reproducible. No es un dato real.
 * - Fórmula de revisión: precio × (1 + peso del gasóleo en el coste completo × variación del índice desde que empezó el
 *   contrato). La ley remite a los criterios o fórmulas de la Administración (condiciones generales de contratación,
 *   Orden de 1997 modificada por la FOM/2184/2008), que NO se han leído: el peso que usa el juego (FUEL.shareOfFullCost)
 *   es suyo.
 * - Solo se plantea en la distribución (transporte continuado). Un viaje puntual se contrata y se hace la misma semana.
 * - La primera vez que el contrato cruza el 5 % surge una decisión; si se revisa, a partir de ahí la factura de cada
 *   semana se revisa sola, al alza o a la baja.
 */

export const fuelOn = (s: Pick<SimState, "mode" | "version">) => s.mode === "carrera" && s.version >= FUEL.fromVersion && s.version >= CAREER_DEEP.fromVersion;

const cache = new Map<number, number[]>();
/** Índice del precio del gasóleo en la semana `w` (semana 1 = 1). Paseo aleatorio con vuelta a la media, acotado. */
export function fuelIndex(seed: number, w: number): number {
  let xs = cache.get(seed);
  if (!xs) { xs = [1, 1]; cache.set(seed, xs); }
  while (xs.length <= w) {
    const prev = xs[xs.length - 1];
    const r = stream(seed, xs.length, "gasoleo");
    const shock = (r() - 0.5) * 2 * FUEL.weeklyStep + FUEL.meanReversion * (1 - prev);
    xs.push(Math.round(Math.min(FUEL.max, Math.max(FUEL.min, prev + shock)) * 1000) / 1000);
  }
  return xs[w];
}

/** Gasóleo, mantenimiento y peajes por km esa semana: solo la parte del gasóleo se mueve con el índice. */
export const variablePerKmAt = (s: Pick<SimState, "mode" | "version" | "seed">, w: number) => (fuelOn(s) ? round2(P.variablePerKm - FUEL.fuelPerKm + FUEL.fuelPerKm * fuelIndex(s.seed, w)) : P.variablePerKm);

/** Variación del gasóleo desde que empezó el contrato (0,06 = un 6 % más caro). */
export const fuelChange = (s: Pick<SimState, "seed">, c: Pick<Contract, "startWeek">, w: number) => round2(fuelIndex(s.seed, w) / fuelIndex(s.seed, c.startWeek) - 1);

/** Factor por el que se multiplica la factura de esa semana si el contrato se revisa. */
export const revisionFactor = (s: Pick<SimState, "seed">, c: Pick<Contract, "startWeek">, w: number) => 1 + FUEL.shareOfFullCost * fuelChange(s, c, w);

const activeIn = (c: Contract, w: number) => c.startWeek <= w && w <= c.endWeek && !(c.cancelledWeek !== undefined && w >= c.cancelledWeek);
const pct = (v: number) => `${Math.abs(Math.round(v * 1000) / 10).toLocaleString("es-ES")} %`;
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Contratos de distribución que cruzan el 5 % esta semana y aún no tienen decisión. Uno por semana como mucho. */
export function fuelIncidents(s: SimState): Incident[] {
  if (!fuelOn(s)) return [];
  const w = s.week;
  const c = s.contracts.filter((x) => x.kind === "distribucion" && activeIn(x, w) && x.fuelRevision === undefined && w > x.startWeek && Math.abs(fuelChange(s, x, w)) >= FUEL.threshold).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!c) return [];
  const ch = fuelChange(s, c, w);
  const up = ch > 0;
  const name = clientOf(c.clientId).name;
  const weekly = round2(c.kmWeek! * c.ratePerKm! * FUEL.shareOfFullCost * Math.abs(ch));
  return [{ id: `gasoleo-${c.id}`, kind: "gasoleo", week: w, title: up ? "El gasóleo ha subido" : "El gasóleo ha bajado",
    concept: "Si el precio del combustible varía entre la firma del contrato y el transporte, el precio del transporte se revisa al alza o a la baja, de forma automática cuando la variación llega al 5 %, y la diferencia se refleja desglosada en la factura (Ley 15/2009, art. 38.1 y 38.2). Un pacto en contra es nulo (art. 38.3).",
    prompt: up
      ? `Desde que firmaste con ${name}, el gasóleo ha subido un ${pct(ch)}. La revisión de su tarifa (${c.ratePerKm!.toLocaleString("es-ES")} €/km) supondría unos ${eur(weekly)} más a la semana.`
      : `Desde que firmaste con ${name}, el gasóleo ha bajado un ${pct(ch)}. ${name} te pide que le apliques la rebaja: unos ${eur(weekly)} menos a la semana.`,
    data: { contract: c.id, client: c.clientId, change: ch, weekly, direction: up ? "sube" : "baja" } }];
}

export function fuelOptions(inc: Incident): IncidentOption[] {
  const o = (id: string, label: string, grade: Grade, feedback: string): IncidentOption => ({ id, label, grade, feedback });
  const weekly = eur(Number(inc.data.weekly));
  if (inc.data.direction === "sube") return [
    o("revisar", "Aplicar la revisión en las facturas, desglosada como línea aparte", "correcta", `Correcto: la revisión es automática por ley y se refleja desglosada en la factura (art. 38.1 y 38.2). A partir de ahora cada factura se revisa sola, al alza o a la baja: unos ${weekly} más a la semana con el precio de hoy.`),
    o("absorber", "No repercutirla para no molestar al cliente", "razonable", `Conservas la relación, pero renuncias a algo que la ley te reconoce: pierdes unos ${weekly} a la semana mientras el gasóleo siga así, y la revisión ya no se aplicará en este contrato.`),
    o("subir", `Subir la tarifa un ${FUEL.unilateralRise * 100} % por tu cuenta, sin explicarlo en la factura`, "grave", "La revisión tiene que salir de la variación del combustible y desglosada en la factura (art. 38.1), no de una subida a tu criterio. El cliente no acepta la factura y rescinde el contrato."),
  ];
  return [
    o("revisar", "Aplicar la rebaja en las facturas, desglosada como línea aparte", "correcta", `Correcto: la revisión funciona en los dos sentidos (art. 38.1) y un pacto en contra sería nulo (art. 38.3). Cobras unos ${weekly} menos a la semana, y si el gasóleo vuelve a subir, la revisión también te favorecerá.`),
    o("esperar", "Esperar a ver si el gasóleo vuelve a subir antes de tocar las facturas", "razonable", `Retrasarla no la evita: el cliente la reclama, la aplicas igual y además pagas ${eur(FUEL.lateRefundCost)} de gestión y de la factura rectificativa (importe simulado).`),
    o("mantener", "Mantener el precio: es el que se firmó", "grave", `El pacto en contra de la revisión es nulo (art. 38.3): el cliente reclama lo cobrado de más (${eur(FUEL.disputeWeeks * Number(inc.data.weekly))}, importe simulado) y deja de trabajar contigo.`),
  ];
}

export function applyFuelDecision(s: SimState, inc: Incident, option: string) {
  const w = s.week;
  const c = s.contracts.find((x) => x.id === inc.data.contract)!;
  const name = clientOf(c.clientId).name;
  const leave = () => { for (const x of s.contracts) if (x.clientId === c.clientId && activeIn(x, w + 1)) x.cancelledWeek = w + 1; };
  const charge = (label: string, amount: number, note: string) => (s.claims ??= []).push({ label, amount: round2(amount), note });
  if (option === "revisar") { c.fuelRevision = "si"; return; }
  if (option === "absorber") { c.fuelRevision = "no"; return; }
  if (option === "subir") { c.fuelRevision = "no"; charge(`Factura rechazada por ${name}`, 0, `${name} rechaza la subida sin justificar y rescinde el contrato.`); leave(); return; }
  if (option === "esperar") { c.fuelRevision = "si"; charge(`Factura rectificativa por gasóleo: ${name}`, FUEL.lateRefundCost, `Aplicas la rebaja que pedía ${name}, tarde: gestión y factura rectificativa.`); return; }
  if (option === "mantener") { c.fuelRevision = "no"; charge(`Devolución por la revisión del gasóleo: ${name}`, FUEL.disputeWeeks * Number(inc.data.weekly), `${name} reclama lo cobrado de más (art. 38.3) y deja de trabajar contigo.`); leave(); }
}
