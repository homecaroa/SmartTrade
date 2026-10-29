"use client";

import { useEffect, useRef, useState } from "react";
import { marketName } from "@/lib/config/catalog";
import { evaluateNegotiation, gradeWalkaway } from "@/lib/learning/negotiation/evaluation";
import { targetPrice } from "@/lib/learning/negotiation/economics";
import { displayOrder } from "@/lib/learning/order";
import { negotiationScenario } from "@/lib/learning/negotiation/scenarios";
import { acceptCounter, confirmPrep, isNegotiationSession, newNegotiation, startPrep, submitOffer, walkAway, type NegotiationSession } from "@/lib/learning/negotiation/session";
import type { NegotiationScenario, Offer } from "@/lib/learning/negotiation/types";
import { clearState, loadState, saveState, storageKey } from "@/lib/learning/storage";
import { GradeBadge } from "./grade-badge";
import { NegotiationSummary } from "./negotiation-summary";
import { OfferForm } from "./offer-form";
import { OfferView } from "./offer-view";
import { FactList, ProvenanceLegend } from "./provenance-badge";
import { SimulatedNotice } from "./simulated-notice";
import { StageProgress } from "./stage-progress";

const STEPS = [
  { id: "presentacion", title: "Presentación" },
  { id: "preparacion", title: "Preparación de la estrategia" },
  { id: "oferta", title: "Ofertas y contraofertas" },
  { id: "cierre", title: "Cierre y evaluación" },
] as const;
const KIND_LABEL = { acepta: "Acepta", contraoferta: "Contraoferta", rechaza: "Rechaza" } as const;
const KIND_STYLE = { acepta: "bg-emerald-100 text-emerald-900", contraoferta: "bg-amber-100 text-amber-900", rechaza: "bg-rose-100 text-rose-900" } as const;

/** Oferta de partida del formulario: solo datos que el vendedor conoce (sus costes), nunca los límites del comprador. */
function initialOffer(sc: NegotiationScenario): Offer {
  const basis = sc.prep.find((q) => q.kind === "walkaway");
  const b = basis && basis.kind === "walkaway" ? basis.basis : { incoterm: sc.allowedIncoterms[0], payment: sc.allowedPayments[0], guarantee: "estandar" as const };
  return { unitPrice: targetPrice(sc, b.incoterm, b.payment, b.guarantee), quantity: Math.round(sc.seller.maxQuantity / 200) * 100, incoterm: b.incoterm, deliveryDays: sc.seller.minDeliveryDays + 10, payment: b.payment, guarantee: b.guarantee, exclusivity: false };
}

function PrepStep({ sc, s, onConfirm }: { sc: NegotiationScenario; s: NegotiationSession; onConfirm: (id: string, v: string | number) => void }) {
  const q = sc.prep.find((x) => !s.prepConfirmed.includes(x.id));
  const [val, setVal] = useState("");
  if (!q) return null;
  return (
    <form key={q.id} className="space-y-3 rounded-lg bg-white p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (!val) return; onConfirm(q.id, q.kind === "walkaway" ? Number(val.replace(",", ".")) : val); setVal(""); }}>
      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">{q.title}</legend>
        <p className="text-sm">{q.prompt}</p>
        {q.kind === "walkaway" ? (
          <>
            <p className="rounded bg-slate-50 p-2 text-xs text-slate-700">Fórmula: precio mínimo = (coste del producto + logística + garantía) / (1 − coste de financiación − comisión del cobro − probabilidad de impago). Usa los datos de tu ficha. La financiación es el 7 % anual por los días aplazados / 365.</p>
            <label className="flex flex-col gap-1 text-sm">Precio mínimo por {sc.unit} (€)<input className="w-40 rounded border border-slate-300 px-2 py-1.5" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} required /></label>
          </>
        ) : (
          <div className="space-y-2">{displayOrder(q.options, `${sc.id}:${q.id}`).map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 p-2 text-sm hover:border-indigo-300">
              <input type="radio" name={`prep-${q.id}`} value={o.id} checked={val === o.id} onChange={() => setVal(o.id)} className="mt-1" /><span>{o.label}</span>
            </label>
          ))}</div>
        )}
      </fieldset>
      <button type="submit" disabled={!val} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400">Confirmar</button>
    </form>
  );
}

export function NegotiationSimulator({ caseId }: { caseId: string }) {
  const sc = negotiationScenario(caseId);
  const key = storageKey("negociacion", caseId);
  const [s, setS] = useState<NegotiationSession | null>(null);
  const [shownPrep, setShownPrep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { setS(loadState(key, (x): x is NegotiationSession => isNegotiationSession(x, caseId)) ?? newNegotiation(caseId)); }, [key, caseId]);
  useEffect(() => { if (s) saveState(key, s); }, [key, s]);
  useEffect(() => { focusRef.current?.focus(); }, [shownPrep, s?.rounds.length, s?.step]);

  if (!sc) return <p>Caso no encontrado.</p>;
  if (!s) return <p className="text-sm text-slate-600">Cargando la simulación…</p>;

  const restart = () => {
    if ((s.prepConfirmed.length || s.rounds.length) && !window.confirm("¿Reiniciar el caso? Se borrará esta negociación.")) return;
    clearState(key); setShownPrep(null); setError(null); setS(newNegotiation(caseId));
  };
  const stepIndex = STEPS.findIndex((x) => x.id === s.step);
  const items = STEPS.map((x, i) => ({ id: x.id, title: x.title, state: (i < stepIndex ? "hecha" : i === stepIndex ? "actual" : "pendiente") as "hecha" | "actual" | "pendiente" }));
  const last = s.rounds.at(-1);
  const prepQ = shownPrep ? sc.prep.find((q) => q.id === shownPrep) : null;
  const prepFeedback = prepQ ? (prepQ.kind === "walkaway" ? gradeWalkaway(sc, Number(s.prep[prepQ.id])) : (() => { const o = prepQ.options.find((x) => x.id === s.prep[prepQ.id]); const b = prepQ.options.find((x) => x.id === prepQ.best); return { grade: o?.grade ?? "grave", feedback: o?.feedback ?? "", best: `${b?.label}. ${prepQ.why}` }; })()) : null;
  const send = (o: Offer) => { try { setError(null); setS(submitOffer(sc, s, o)); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo enviar la oferta."); } };

  return (
    <div className="space-y-4">
      <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Negociación internacional · dificultad {sc.difficulty}</p>
        <h1 className="text-xl font-bold">{sc.title}</h1>
        <p className="text-sm"><b>Objetivo de aprendizaje:</b> {sc.learningGoal}</p>
        <details open={s.step === "presentacion"} className="text-sm"><summary className="cursor-pointer font-medium">Instrucciones</summary><ul className="mt-1 list-disc pl-5">{sc.instructions.map((i) => <li key={i}>{i}</li>)}</ul></details>
        <SimulatedNotice compact />
        <StageProgress items={items} label="Fases de la negociación" />
      </header>

      <details open={s.step === "presentacion"} className="rounded-lg bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold">Comprador, producto y tus costes</summary>
        <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
          <div className="space-y-1">
            <h3 className="font-semibold">{sc.buyer.name}</h3>
            <p>{sc.buyer.type}, {sc.buyer.city} ({marketName(sc.market)}). {sc.buyer.description}</p>
            <p><b>Necesidades:</b> {sc.buyer.needs.join("; ")}.</p>
            <p><b>Presupuesto orientativo:</b> {sc.buyer.budget}</p>
            <p><b>Volumen y frecuencia:</b> {sc.buyer.volume}. {sc.buyer.frequency}.</p>
            <p><b>Requisitos:</b> {sc.buyer.requirements.join("; ")}.</p>
            <p><b>Idioma y contexto profesional:</b> {sc.buyer.language}. {sc.buyer.context.join("; ")}.</p>
            <p><b>Condiciones de pago habituales:</b> {sc.buyer.paymentHabit}. Riesgo del comprador: {sc.buyer.risk}.</p>
            <p className="text-xs text-slate-500">Perfil ficticio y simulado.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">Tu empresa: {sc.company.name}</h3>
            <p>{sc.company.city}. {sc.company.description} Vendes por {sc.unitDetail}.</p>
            <ProvenanceLegend />
            <FactList facts={sc.facts} />
          </div>
        </div>
      </details>

      <div aria-live="polite" className="space-y-3">
        {s.step === "presentacion" && (
          <button type="button" onClick={() => setS(startPrep(s))} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Preparar la estrategia</button>
        )}

        {prepQ && prepFeedback ? (
          <section className="space-y-2 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
            <h2 ref={focusRef} tabIndex={-1} className="flex flex-wrap items-center gap-2 text-base font-semibold">{prepQ.title} <GradeBadge grade={prepFeedback.grade} /></h2>
            <p className="text-sm">{prepFeedback.feedback}</p>
            {prepFeedback.grade !== "correcta" && <p className="rounded bg-emerald-50 p-2 text-sm text-emerald-900"><b>Más adecuado:</b> {prepFeedback.best}</p>}
            <button type="button" onClick={() => setShownPrep(null)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Continuar</button>
          </section>
        ) : s.step === "preparacion" ? (
          <PrepStep sc={sc} s={s} onConfirm={(id, v) => { setS(confirmPrep(sc, s, id, v)); setShownPrep(id); }} />
        ) : null}

        {!prepQ && s.rounds.length > 0 && (
          <section className="space-y-2" aria-label="Rondas de negociación">
            <h2 ref={s.step === "oferta" ? focusRef : undefined} tabIndex={-1} className="text-base font-semibold">Rondas de negociación</h2>
            <ol className="space-y-2">
              {s.rounds.map((r, i) => (
                <li key={i} className="space-y-2 rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">Ronda {i + 1} · tu oferta</p>
                  <OfferView sc={sc} o={r.offer} />
                  <p className="flex items-center gap-2 text-sm"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[r.response.kind]}`}>Comprador: {KIND_LABEL[r.response.kind]}</span>{r.response.final && r.response.kind === "contraoferta" ? <span className="text-xs text-rose-800">Última propuesta</span> : null}</p>
                  <ul className="list-disc pl-5 text-sm text-slate-700">{r.response.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                  {r.response.counter && <div className="rounded border border-amber-200 bg-amber-50 p-2"><p className="text-xs font-semibold text-amber-900">Su propuesta</p><OfferView sc={sc} o={r.response.counter} /></div>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {!prepQ && s.step === "oferta" && (
          <>
            {last?.response.counter && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setS(acceptCounter(s))} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Aceptar su propuesta</button>
                <button type="button" onClick={() => setS(walkAway(s))} className="rounded border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-800 hover:bg-rose-50">Rechazar y terminar</button>
              </div>
            )}
            {!last?.response.final && (
              <OfferForm key={s.rounds.length} sc={sc} initial={last?.response.counter ?? last?.offer ?? initialOffer(sc)} onSubmit={send} submitLabel={s.rounds.length ? "Enviar nueva propuesta" : "Enviar oferta inicial"} />
            )}
            {error && <p role="alert" className="rounded bg-rose-50 p-2 text-sm text-rose-900">{error}</p>}
          </>
        )}

        {s.step === "cierre" && !prepQ && <NegotiationSummary sc={sc} s={s} ev={evaluateNegotiation(sc, s)} onRestart={restart} />}
      </div>
      <div className="print:hidden"><button type="button" onClick={restart} className="text-xs text-slate-600 underline">Reiniciar este caso</button></div>
    </div>
  );
}
