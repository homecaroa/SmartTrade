import { fmtEur, fmtPctLearning } from "@/lib/learning/money";
import { paymentTerm } from "@/lib/learning/payments";
import { sellerEconomics } from "@/lib/learning/negotiation/economics";
import type { NegotiationEvaluation } from "@/lib/learning/negotiation/evaluation";
import type { NegotiationSession } from "@/lib/learning/negotiation/session";
import type { NegotiationScenario, Offer } from "@/lib/learning/negotiation/types";
import { GradeBadge } from "./grade-badge";
import { OfferView } from "./offer-view";
import { SimulatedNotice } from "./simulated-notice";

const HOW = { comprador_acepta: "El comprador aceptó tu oferta.", alumno_acepta: "Aceptaste la contraoferta del comprador.", comprador_rechaza: "El comprador se retiró de la negociación.", alumno_rechaza: "Rechazaste la propuesta del comprador." } as const;

function Comparison({ sc, mine, ref, label }: { sc: NegotiationScenario; mine: Offer | null; ref: Offer | null; label: string }) {
  const row = (title: string, f: (o: Offer) => string) => (
    <tr className="border-b border-slate-100"><th scope="row" className="px-2 py-1 text-left font-normal text-slate-600">{title}</th><td className="px-2 py-1">{mine ? f(mine) : "Sin acuerdo"}</td><td className="px-2 py-1">{ref ? f(ref) : "Sin acuerdo"}</td></tr>
  );
  const e = (o: Offer) => sellerEconomics(sc, o);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">Comparación con la estrategia de referencia</caption>
        <thead><tr className="border-b"><th className="px-2 py-1" /><th scope="col" className="px-2 py-1 text-left">Tu resultado</th><th scope="col" className="px-2 py-1 text-left">{label}</th></tr></thead>
        <tbody>
          {row("Precio", (o) => `${fmtEur(o.unitPrice)} (${o.incoterm})`)}
          {row("Cantidad", (o) => o.quantity.toLocaleString("es-ES"))}
          {row("Cobro", (o) => paymentTerm(o.payment).label)}
          {row("Plazo", (o) => `${o.deliveryDays} días`)}
          {row("Margen", (o) => `${fmtEur(e(o).margin)} (${fmtPctLearning(e(o).marginPct)})`)}
          {row("Pérdida esperada por impago", (o) => fmtEur(e(o).expectedLoss))}
        </tbody>
      </table>
    </div>
  );
}

export function NegotiationSummary({ sc, s, ev, onRestart }: { sc: NegotiationScenario; s: NegotiationSession; ev: NegotiationEvaluation; onRestart: () => void }) {
  const h = "text-base font-semibold";
  const final = s.outcome?.final ?? null;
  return (
    <section className="space-y-4" aria-labelledby="cierre-negociacion">
      <h2 id="cierre-negociacion" tabIndex={-1} className="text-lg font-bold">Cierre y evaluación</h2>
      <SimulatedNotice compact />
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <p className="font-medium">{s.outcome ? HOW[s.outcome.how] : ""} {s.outcome?.status === "acuerdo" ? "Hay acuerdo:" : "No hay acuerdo."}</p>
        {final && <OfferView sc={sc} o={final} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ev.dimensions.map((d) => (
          <div key={d.key} className="rounded-lg bg-white p-3 shadow-sm">
            <h3 className="text-sm font-semibold">{d.label}</h3>
            <p className="text-2xl font-bold text-indigo-700">{d.score === null ? "—" : `${d.score}/100`}</p>
            <p className="text-xs text-slate-600">{d.explain}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className={h}>Nota de conocimientos (preparación y proceso)</h3>
          <p className="text-3xl font-bold text-indigo-700">{fmtPctLearning(ev.knowledge.pct, 0)}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {ev.prep.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2"><span>{p.title}</span><GradeBadge grade={p.grade} /></li>)}
            {ev.process.map((p) => <li key={p.label}><span className="tabular-nums">{p.points}/{p.max}</span> · <b>{p.label}:</b> {p.explain}</li>)}
          </ul>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className={h}>Resultado económico</h3>
          {ev.economics ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt>Ingresos</dt><dd className="text-right tabular-nums">{fmtEur(ev.economics.revenue)}</dd>
              <dt>Producto</dt><dd className="text-right tabular-nums">−{fmtEur(ev.economics.product)}</dd>
              <dt>Logística ({final?.incoterm})</dt><dd className="text-right tabular-nums">−{fmtEur(ev.economics.logistics)}</dd>
              <dt>Garantía</dt><dd className="text-right tabular-nums">−{fmtEur(ev.economics.guarantee)}</dd>
              <dt>Financiación del cobro</dt><dd className="text-right tabular-nums">−{fmtEur(ev.economics.financing)}</dd>
              <dt>Comisión o seguro</dt><dd className="text-right tabular-nums">−{fmtEur(ev.economics.fee)}</dd>
              <dt>Pérdida esperada por impago</dt><dd className="text-right tabular-nums">−{fmtEur(ev.economics.expectedLoss)}</dd>
              <dt className="font-semibold">Margen</dt><dd className="text-right font-semibold tabular-nums">{fmtEur(ev.economics.margin)} ({fmtPctLearning(ev.economics.marginPct)})</dd>
            </dl>
          ) : <p className="text-sm">Sin acuerdo no hay ingresos ni costes.</p>}
          <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">La nota y el margen se valoran por separado: un buen precio no compensa una mala preparación, ni una concesión razonable es siempre un error. La pérdida esperada es el coste medio del riesgo, no un gasto seguro.</p>
        </div>
      </div>
      {(ev.errors.length > 0 || ev.recommendations.length > 0) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
          {ev.errors.length > 0 && <><h3 className={h}>Errores importantes</h3><ul className="mt-1 list-disc pl-5">{ev.errors.map((e) => <li key={e}>{e}</li>)}</ul></>}
          {ev.recommendations.length > 0 && <><h3 className={`${h} mt-2`}>Recomendaciones</h3><ul className="mt-1 list-disc pl-5">{ev.recommendations.map((e) => <li key={e}>{e}</li>)}</ul></>}
        </div>
      )}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className={h}>Comparación con una estrategia alternativa</h3>
        <p className="text-sm text-slate-700">{ev.reference.explanation} Se ha simulado con el mismo comprador y las mismas reglas.</p>
        <Comparison sc={sc} mine={final} ref={ev.reference.session.outcome?.final ?? null} label={ev.reference.label} />
      </div>
      <div className="rounded-lg bg-white p-4 shadow-sm text-sm">
        <h3 className={h}>Lo que el comprador no te dijo</h3>
        <ul className="mt-1 list-disc pl-5">{ev.hiddenReveal.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="mt-1 text-xs text-slate-500">Límites simulados del caso: se revelan al terminar para que puedas analizar la negociación.</p>
      </div>
      <div className="rounded-lg bg-white p-4 shadow-sm text-sm">
        <h3 className={h}>Revisión de la preparación</h3>
        <ul className="mt-1 space-y-2">{ev.prep.map((p) => <li key={p.id}><b>{p.title}:</b> {p.answer}. {p.feedback} {p.grade !== "correcta" && <span className="text-emerald-900">Más adecuado: {p.best}</span>}</li>)}</ul>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={onRestart} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Repetir el caso</button>
        <a href="/aprendizaje" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">Volver al Modo Aprendizaje</a>
      </div>
    </section>
  );
}
