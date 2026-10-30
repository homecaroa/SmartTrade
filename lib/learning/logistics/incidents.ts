import type { Party } from "@/lib/logistics/incoterms";
import { round2 } from "../money";
import { payerOf, sellerDeliversAtDestination, sellerRiskInMainLeg } from "./allocation";
import { RATES } from "./params";
import { transitDays, type ExtraLine } from "./calculator";
import type { LogisticsCase, RouteOption } from "./types";

/**
 * Incidencias deterministas. Sus consecuencias dependen del Incoterm elegido:
 * - Daño en ruta: lo soporta quien tiene el RIESGO en el transporte principal (vendedor solo en reglas D); lo recupera
 *   del seguro si se dejan reservas en el documento de transporte.
 * - Retraso: la penalización pactada solo se aplica al vendedor si debe entregar en destino (reglas D); en las reglas
 *   E, F y C cumple al entregar al transportista, y el retraso en ruta no es incumplimiento suyo.
 * - Retención en aduana de destino: el almacenaje lo paga quien despacha la importación (comprador salvo en DDP),
 *   pero si la causa es un error de los documentos del vendedor, se le repercute.
 */
export interface IncidentOption { id: string; label: string; grade: "correcta" | "razonable" | "grave"; feedback: string; extraDays: number; cost: ExtraLine | null }
export interface Incident { kind: "dano" | "retraso" | "retencion" | "descarga_aerea"; title: string; prompt: string; options: IncidentOption[]; best: string; why: string }

const docName = (r: RouteOption) => (r.modality === "aereo" ? "conocimiento aéreo (AWB)" : r.legs.some((l) => l.role === "principal" && l.vehicle === "barco") ? "conocimiento de embarque (B/L)" : "CMR");
const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;

export function damageIncident(c: LogisticsCase, route: RouteOption, incoterm: string): Incident {
  const palletValue = round2(c.cargo.valueEur / c.cargo.pallets);
  const holder: Party = sellerRiskInMainLeg(incoterm) ? "vendedor" : "comprador";
  const deductible = 150;
  const doc = docName(route);
  return {
    kind: "dano", title: "Incidencia: un palé llega dañado",
    prompt: `Al descargar en destino, un palé (valor ${eur(palletValue)}) llega roto. Con ${incoterm}, el riesgo del transporte principal es del ${holder}.`,
    options: [
      { id: "reservas", label: `Anotar reservas en el ${doc}, hacer fotos y reclamar al seguro`, grade: "correcta", extraDays: 0,
        feedback: `Correcto: con reservas escritas en el ${doc} el seguro cubre el daño y solo queda la franquicia (${deductible} €), a cargo del ${holder}, que es quien tenía el riesgo.`,
        cost: { label: "Franquicia del seguro por el palé dañado", amount: deductible, payer: holder, note: "Importe simulado." } },
      { id: "descuento", label: "Aceptar la mercancía y pactar un descuento con el cliente", grade: "razonable", extraDays: 0,
        feedback: "Resuelve la relación comercial, pero renuncias al seguro: el vendedor asume la mitad del valor del palé como descuento.",
        cost: { label: "Descuento comercial por el palé dañado", amount: round2(palletValue / 2), payer: "vendedor", note: "50 % del valor del palé (supuesto)." } },
      { id: "sin_reservas", label: "Firmar la entrega sin anotar nada y reclamar más tarde", grade: "grave", extraDays: 0,
        feedback: `Sin reservas en el ${doc}, la entrega se presume conforme: el seguro y el transportista rechazan la reclamación y el ${holder} pierde el palé entero.`,
        cost: { label: "Palé dañado sin cobertura", amount: palletValue, payer: holder, note: "Valor completo del palé." } },
    ],
    best: "reservas", why: "Ante un daño, lo primero es dejar constancia por escrito en el documento de transporte: sin ello no hay reclamación posible.",
  };
}

export function delayIncident(c: LogisticsCase, route: RouteOption, incoterm: string, days: number, cause: string, urgentCost: number): Incident {
  const liable = sellerDeliversAtDestination(incoterm);
  // Días de retraso sobre la fecha pactada = máx(0, entrega prevista en el peor caso + retraso − plazo pactado).
  const plannedMax = c.prepDays + transitDays(route).max;
  const lateDays = (extra: number) => Math.max(0, plannedMax + extra - c.deadlineDays);
  const penalty = (extra: number) => (liable ? round2(c.cargo.valueEur * (RATES.latePenaltyPctPerDay / 100) * lateDays(extra)) : 0);
  const pen = (extra: number, factor = 1): ExtraLine | null => (penalty(extra) > 0 ? { label: `Penalización por retraso (${lateDays(extra)} día/s)`, amount: round2(penalty(extra) * factor), payer: "vendedor", note: `${RATES.latePenaltyPctPerDay} % del valor por día de retraso (supuesto del contrato).` } : null);
  const liability = liable
    ? `Con ${incoterm} debes entregar en destino: si se supera la fecha pactada, se aplica una penalización del ${RATES.latePenaltyPctPerDay} % del valor por día.`
    : `Con ${incoterm} cumpliste al entregar al transportista: el retraso en ruta no es un incumplimiento tuyo, aunque afecta a tu cliente.`;
  return {
    kind: "retraso", title: "Incidencia: retraso en ruta",
    prompt: `${cause} El envío llegará ${days} días más tarde de lo previsto. ${liability}`,
    options: [
      { id: "avisar", label: "Avisar al cliente enseguida, dar nueva fecha y documentar la causa", grade: "correcta", extraDays: days,
        feedback: liable ? "Transparencia: el cliente acepta reducir la penalización a la mitad al tratarse de una causa ajena y comunicada a tiempo." : "Correcto: no te corresponde penalización, pero avisar protege la relación con tu cliente.",
        cost: pen(days, 0.5) },
      { id: "urgente", label: "Pagar un transporte urgente para recuperar el plazo", grade: "razonable", extraDays: 1,
        feedback: liable ? `Recuperas casi todo el plazo, pero pagas ${eur(urgentCost)} de transporte urgente. Compensa solo si la penalización o el cliente lo justifican.` : `No era tu obligación: pagas ${eur(urgentCost)} por un retraso que no te correspondía.`,
        cost: { label: "Transporte urgente para recuperar el plazo" + (pen(1) ? " y penalización residual" : ""), amount: round2(urgentCost + (pen(1)?.amount ?? 0)), payer: "vendedor", note: "Importe simulado." } },
      { id: "callar", label: "No decir nada y esperar", grade: "grave", extraDays: days,
        feedback: liable ? "El cliente se entera al no recibir la mercancía y aplica la penalización completa." : "Aunque no te corresponda la penalización, ocultar el problema daña la confianza del cliente.",
        cost: pen(days) },
    ],
    best: "avisar", why: "Ante un retraso, comunicar pronto y documentar la causa suele reducir el daño; quién paga depende de dónde debía entregarse la mercancía.",
  };
}

export function customsHoldIncident(c: LogisticsCase, route: RouteOption, incoterm: string): Incident {
  const importer: Party = payerOf("despacho_importacion", incoterm);
  const perDay = 120;
  return {
    kind: "retencion", title: "Incidencia: retención en la aduana de destino",
    prompt: `La aduana de destino retiene la mercancía: la descripción de la factura comercial no coincide con la del ${docName(route)}. Cada día de retención cuesta ${perDay} € de almacenaje. Despacha la importación el ${importer}, pero el error está en tus documentos.`,
    options: [
      { id: "corregir", label: "Comprobar cuál es correcta, emitir la corrección y enviarla al agente de aduanas hoy", grade: "correcta", extraDays: 2,
        feedback: "Se resuelve en 2 días. Como el error era tuyo, el importador te repercute el almacenaje.", cost: { label: "Almacenaje por retención (2 días)", amount: 2 * perDay, payer: "vendedor", note: "Repercutido por error documental del vendedor (simulado)." } },
      { id: "agente_urgente", label: "Pagar a un agente para que tramite la corrección por vía urgente", grade: "razonable", extraDays: 1,
        feedback: "Se resuelve en 1 día, con un coste de gestión adicional.", cost: { label: "Gestión urgente y 1 día de almacenaje", amount: 250 + perDay, payer: "vendedor", note: "Importe simulado." } },
      { id: "esperar", label: "Dejar que lo resuelva el importador: el despacho es suyo", grade: "grave", extraDays: 8,
        feedback: "Sin tu corrección la retención dura 8 días y el importador te los repercute, porque el error estaba en tu factura.", cost: { label: "Almacenaje por retención (8 días)", amount: 8 * perDay, payer: "vendedor", note: "Repercutido por error documental del vendedor (simulado)." } },
    ],
    best: "corregir", why: "Los documentos deben coincidir entre sí: quien los emitió mal debe corregirlos cuanto antes, aunque el despacho lo haga otro.",
  };
}

export function airOffloadIncident(c: LogisticsCase, route: RouteOption, incoterm: string): Incident {
  const base = delayIncident(c, route, incoterm, 2, "La aerolínea descarga el envío en la escala de Madrid por falta de espacio («offload») y lo embarca en el siguiente vuelo.", 1800);
  return { ...base, kind: "descarga_aerea", title: "Incidencia: carga descargada en la escala" };
}
