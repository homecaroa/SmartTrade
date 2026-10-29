import { utility, respond, validateOffer, type BuyerResponse } from "./buyer-engine";
import type { NegotiationScenario, Offer } from "./types";

/** Estado y transiciones de una sesión de negociación. Puro: la interfaz solo llama a estas funciones. */
export type Step = "presentacion" | "preparacion" | "oferta" | "cierre";
export interface Round { offer: Offer; response: BuyerResponse }
export interface Outcome { status: "acuerdo" | "sin_acuerdo"; final: Offer | null; how: "comprador_acepta" | "alumno_acepta" | "comprador_rechaza" | "alumno_rechaza" }

export interface NegotiationSession {
  v: 1; module: "negociacion"; caseId: string; startedAt: string;
  step: Step;
  prep: Record<string, string | number>;
  prepConfirmed: string[];
  rounds: Round[];
  outcome: Outcome | null;
}

export const newNegotiation = (caseId: string, now = new Date()): NegotiationSession => ({ v: 1, module: "negociacion", caseId, startedAt: now.toISOString(), step: "presentacion", prep: {}, prepConfirmed: [], rounds: [], outcome: null });

export function isNegotiationSession(x: unknown, caseId: string): x is NegotiationSession {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<NegotiationSession>;
  return s.v === 1 && s.module === "negociacion" && s.caseId === caseId && typeof s.step === "string" && !!s.prep && Array.isArray(s.prepConfirmed) && Array.isArray(s.rounds) && typeof s.startedAt === "string";
}

export const startPrep = (s: NegotiationSession): NegotiationSession => (s.step === "presentacion" ? { ...s, step: "preparacion" } : s);

export function confirmPrep(sc: NegotiationScenario, s: NegotiationSession, id: string, value: string | number): NegotiationSession {
  if (s.prepConfirmed.includes(id) || !sc.prep.some((q) => q.id === id)) return s;
  const next = { ...s, prep: { ...s.prep, [id]: value }, prepConfirmed: [...s.prepConfirmed, id] };
  return next.prepConfirmed.length === sc.prep.length ? { ...next, step: "oferta" } : next;
}

/** Envía una oferta. Lanza un error si la oferta tiene errores de validación (los avisos no impiden enviarla). */
export function submitOffer(sc: NegotiationScenario, s: NegotiationSession, offer: Offer): NegotiationSession {
  if (s.step !== "oferta" || s.outcome) throw new Error("La negociación no admite ofertas en este momento.");
  const last = s.rounds.at(-1);
  if (last?.response.final) throw new Error("El comprador ha hecho su última propuesta: solo puedes aceptarla o rechazarla.");
  const v = validateOffer(sc, offer);
  if (v.errors.length) throw new Error(v.errors.join(" "));
  const previous = s.rounds.map((r) => utility(sc, r.offer));
  const response = respond(sc, offer, s.rounds.length, previous);
  const rounds = [...s.rounds, { offer, response }];
  if (response.kind === "acepta") return { ...s, rounds, step: "cierre", outcome: { status: "acuerdo", final: offer, how: "comprador_acepta" } };
  if (response.kind === "rechaza") return { ...s, rounds, step: "cierre", outcome: { status: "sin_acuerdo", final: null, how: "comprador_rechaza" } };
  return { ...s, rounds };
}

export function acceptCounter(s: NegotiationSession): NegotiationSession {
  const counter = s.rounds.at(-1)?.response.counter;
  if (!counter || s.outcome) return s;
  return { ...s, step: "cierre", outcome: { status: "acuerdo", final: counter, how: "alumno_acepta" } };
}

export function walkAway(s: NegotiationSession): NegotiationSession {
  if (s.outcome || !s.rounds.length) return s;
  return { ...s, step: "cierre", outcome: { status: "sin_acuerdo", final: null, how: "alumno_rechaza" } };
}

/**
 * Simula una estrategia completa con la misma lógica (sirve para la estrategia de referencia). Política: envía las
 * ofertas en orden; si el comprador contraoferta y la contraoferta da al menos el margen objetivo, la acepta; si se acaban
 * las ofertas, acepta la última contraoferta solo si no da pérdidas.
 */
export function simulateStrategy(sc: NegotiationScenario, offers: Offer[], marginPctOf: (o: Offer) => number): NegotiationSession {
  let s: NegotiationSession = { ...newNegotiation(sc.id, new Date(0)), step: "oferta", prepConfirmed: sc.prep.map((q) => q.id) };
  for (let i = 0; i < offers.length; i++) {
    s = submitOffer(sc, s, offers[i]);
    if (s.outcome) return s;
    const r = s.rounds.at(-1)!.response;
    const counter = r.counter!;
    const lastOffer = i === offers.length - 1 || r.final;
    if (marginPctOf(counter) >= sc.seller.targetMarginPct || (lastOffer && marginPctOf(counter) >= 0)) return acceptCounter(s);
    if (lastOffer) return walkAway(s);
  }
  return s;
}
