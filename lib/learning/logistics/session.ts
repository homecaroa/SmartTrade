import { INCOTERMS } from "@/lib/logistics/incoterms";
import type { JustificationId, LogisticsCase } from "./types";

/**
 * Estado del Laboratorio de logística. Puro y determinista. Las decisiones no se pueden cambiar una vez tomadas; el
 * paso solo avanza cuando el alumno ha visto la consecuencia («Continuar»).
 */
export const LOGISTICS_STEPS = [
  { id: "pedido", title: "Pedido" },
  { id: "alternativas", title: "Alternativas de transporte" },
  { id: "seleccion", title: "Selección y justificación" },
  { id: "incoterm", title: "Incoterm" },
  { id: "presupuesto", title: "Presupuesto logístico" },
  { id: "incidencia", title: "Incidencia" },
  { id: "resultado", title: "Resultado" },
] as const;
export type LogisticsStep = (typeof LOGISTICS_STEPS)[number]["id"];

export interface LogisticsSession {
  v: 1; module: "logistica"; caseId: string; startedAt: string;
  step: LogisticsStep;
  routeId: string | null;
  reasons: JustificationId[];
  incoterm: string | null;
  ownership: string | null;
  incidentChoice: string | null;
}

export const newLogisticsSession = (caseId: string, now = new Date()): LogisticsSession =>
  ({ v: 1, module: "logistica", caseId, startedAt: now.toISOString(), step: "pedido", routeId: null, reasons: [], incoterm: null, ownership: null, incidentChoice: null });

export function isLogisticsSession(x: unknown, caseId: string): x is LogisticsSession {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<LogisticsSession>;
  return s.v === 1 && s.module === "logistica" && s.caseId === caseId && LOGISTICS_STEPS.some((st) => st.id === s.step) && Array.isArray(s.reasons) && typeof s.startedAt === "string";
}

export const OWNERSHIP_OPTIONS = [
  { id: "contrato", label: "Ninguna: la propiedad la regulan el contrato de compraventa y la ley aplicable", grade: "correcta" as const, feedback: "Correcto: el Incoterm reparte costes, riesgos y trámites, pero no dice cuándo pasa la propiedad." },
  { id: "con_riesgo", label: "La propiedad pasa al comprador en el mismo momento que el riesgo", grade: "grave" as const, feedback: "Es un error frecuente: riesgo y propiedad son cosas distintas, y el Incoterm solo regula el riesgo." },
  { id: "al_pagar", label: "La propiedad pasa cuando el comprador paga, porque así lo fija el Incoterm", grade: "grave" as const, feedback: "El Incoterm no regula el pago ni la propiedad: eso se pacta en el contrato (por ejemplo, con reserva de dominio)." },
];

const order = (st: LogisticsStep) => LOGISTICS_STEPS.findIndex((x) => x.id === st);
/** ¿Ya se tomó la decisión del paso actual? Entonces la interfaz muestra la consecuencia y el botón Continuar. */
export function decided(s: LogisticsSession): boolean {
  if (s.step === "seleccion") return !!s.routeId;
  if (s.step === "incoterm") return !!s.incoterm && !!s.ownership;
  if (s.step === "incidencia") return !!s.incidentChoice;
  return false;
}
/** Avanza al paso siguiente si el actual no exige decisión o ya está decidido. */
export function next(s: LogisticsSession): LogisticsSession {
  if (["seleccion", "incoterm", "incidencia"].includes(s.step) && !decided(s)) return s;
  const i = order(s.step);
  return i < LOGISTICS_STEPS.length - 1 ? { ...s, step: LOGISTICS_STEPS[i + 1].id } : s;
}

export function chooseRoute(c: LogisticsCase, s: LogisticsSession, routeId: string, reasons: JustificationId[]): LogisticsSession {
  if (s.step !== "seleccion" || s.routeId) return s;
  if (!c.routes.some((r) => r.id === routeId)) throw new Error("Ruta no disponible en este caso.");
  return { ...s, routeId, reasons: [...new Set(reasons)] };
}

export function chooseIncoterm(s: LogisticsSession, code: string, ownership: string): LogisticsSession {
  if (s.step !== "incoterm" || s.incoterm) return s;
  if (!INCOTERMS.some((i) => i.code === code)) throw new Error("Incoterm desconocido.");
  if (!OWNERSHIP_OPTIONS.some((o) => o.id === ownership)) throw new Error("Respuesta no válida.");
  return { ...s, incoterm: code, ownership };
}

export function chooseIncident(c: LogisticsCase, s: LogisticsSession, optionId: string): LogisticsSession {
  if (s.step !== "incidencia" || s.incidentChoice || !s.routeId || !s.incoterm) return s;
  const route = c.routes.find((r) => r.id === s.routeId)!;
  if (!c.incident(c, route, s.incoterm).options.some((o) => o.id === optionId)) throw new Error("Opción no válida.");
  return { ...s, incidentChoice: optionId };
}
