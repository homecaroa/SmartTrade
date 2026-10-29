"use client";

import { useState } from "react";
import { INCOTERMS } from "@/lib/logistics/incoterms";
import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import { PAYMENT_TERMS, type PaymentId } from "@/lib/learning/payments";
import { validateOffer } from "@/lib/learning/negotiation/buyer-engine";
import { floorPrice, sellerEconomics } from "@/lib/learning/negotiation/economics";
import type { Guarantee, NegotiationScenario, Offer } from "@/lib/learning/negotiation/types";
import { marketName } from "@/lib/config/catalog";

/** Formulario de oferta con valores libres. Muestra en vivo tu margen y los avisos de las reglas de validación. */
export function OfferForm({ sc, initial, onSubmit, submitLabel }: { sc: NegotiationScenario; initial: Offer; onSubmit: (o: Offer) => void; submitLabel: string }) {
  const [price, setPrice] = useState(initial.unitPrice.toFixed(2).replace(".", ","));
  const [qty, setQty] = useState(String(initial.quantity));
  const [days, setDays] = useState(String(initial.deliveryDays));
  const [incoterm, setIncoterm] = useState(initial.incoterm);
  const [payment, setPayment] = useState<PaymentId>(initial.payment);
  const [guarantee, setGuarantee] = useState<Guarantee>(initial.guarantee);
  const [exclusivity, setExclusivity] = useState(initial.exclusivity);
  const offer: Offer = { unitPrice: Number(price.replace(",", ".")), quantity: Number(qty), deliveryDays: Number(days), incoterm, payment, guarantee, exclusivity };
  const v = validateOffer(sc, offer);
  const econ = v.errors.length ? null : sellerEconomics(sc, offer);
  const floor = v.errors.length ? null : floorPrice(sc, incoterm, payment, guarantee);
  const field = "flex flex-col gap-1 text-sm";
  const input = "rounded border border-slate-300 px-2 py-1.5";
  return (
    <form className="space-y-3 rounded-lg bg-white p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (!v.errors.length) onSubmit(offer); }}>
      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-base font-semibold">Tu propuesta</legend>
        <label className={field}>Precio por {sc.unit} (€)<input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required /></label>
        <label className={field}>Cantidad ({sc.unit}s)<input className={input} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
        <label className={field}>Plazo de entrega (días)<input className={input} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} required /></label>
        <label className={field}>Incoterm
          <select className={input} value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
            {sc.allowedIncoterms.map((c) => <option key={c} value={c}>{c} · {INCOTERMS.find((i) => i.code === c)?.name}</option>)}
          </select>
        </label>
        <label className={`${field} sm:col-span-2`}>Forma de pago
          <select className={input} value={payment} onChange={(e) => setPayment(e.target.value as PaymentId)}>
            {PAYMENT_TERMS.filter((p) => sc.allowedPayments.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className={field}>Garantía
          <select className={input} value={guarantee} onChange={(e) => setGuarantee(e.target.value as Guarantee)}>
            <option value="estandar">Estándar</option>
            <option value="ampliada">Ampliada</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={exclusivity} onChange={(e) => setExclusivity(e.target.checked)} />Exclusividad en {marketName(sc.market)} (1 año)</label>
      </fieldset>
      <p className="text-xs text-slate-600">{PAYMENT_TERMS.find((p) => p.id === payment)?.explain}</p>
      <div aria-live="polite" className="space-y-1 text-sm">
        {v.errors.map((e) => <p key={e} className="rounded bg-rose-50 p-2 text-rose-900">{e}</p>)}
        {econ && floor !== null && (
          <p className={`rounded p-2 ${econ.margin < 0 ? "bg-rose-50 text-rose-900" : "bg-slate-50"}`}>
            Para ti: ingresos {fmtEur(econ.revenue)}, margen <b>{fmtEur(econ.margin)} ({fmtPctLearning(econ.marginPct)})</b>, objetivo {sc.seller.targetMarginPct} %. Precio mínimo con estas condiciones: {fmtEur(floor)} por {sc.unit}. Riesgo de impago estimado: {fmtPctLearning(econ.defaultProb * 100)}.
          </p>
        )}
        {v.warnings.map((w) => <p key={w} className="rounded bg-amber-50 p-2 text-amber-900">Aviso: {w}</p>)}
      </div>
      <button type="submit" disabled={v.errors.length > 0} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400">{submitLabel}</button>
    </form>
  );
}
