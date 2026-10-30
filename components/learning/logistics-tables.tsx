import { CONCEPT_LABEL, payerOf, riskPoint, applicability, type LogisticsConcept } from "@/lib/learning/logistics/allocation";
import { DEADLINE_LABEL, type RouteAssessment } from "@/lib/learning/logistics/assess";
import { computeQuote, transitDays, type Quote } from "@/lib/learning/logistics/calculator";
import { fmtDays, fmtPctRange, fmtRangeEur } from "@/lib/learning/logistics/format";
import { LOGISTICS_NOTICE } from "@/lib/learning/logistics/params";
import { MODALITY_LABEL, VEHICLE_LABEL, type RouteOption, type Shipment } from "@/lib/learning/logistics/types";
import { incotermOf } from "@/lib/learning/export/costs";
import { ProvenanceBadge } from "./provenance-badge";

/** Aviso de las estimaciones logísticas: acompaña a la tabla de rutas y a cada presupuesto. */
export function LogisticsNotice() {
  return (
    <p role="note" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      <b>{LOGISTICS_NOTICE}.</b> Tarifas, plazos, distancias, aranceles e impuestos son rangos inventados para practicar: no son cotizaciones de transportistas ni datos oficiales. El valor central de cada rango sirve para comparar, no es una cifra exacta.
    </p>
  );
}

const STATUS_STYLE = { seguro: "bg-emerald-100 text-emerald-900", riesgo: "bg-amber-100 text-amber-900", no_llega: "bg-rose-100 text-rose-900" } as const;

/** Tabla de alternativas: tramos, transbordos, plazo, equipo y coste logístico total (lo paguen vendedor o comprador). */
export function RoutesTable({ c, rows }: { c: Shipment; rows: Pick<RouteAssessment, "route" | "status">[] }) {
  return (
    <div className="space-y-3">
      {rows.map(({ route, status }) => {
        const q = computeQuote(c, route, "DAP");
        return (
          <article key={route.id} className="space-y-1 rounded border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{route.label}</h3>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{MODALITY_LABEL[route.modality]}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[status]}`}>{DEADLINE_LABEL[status]}</span>
            </div>
            <ol className="list-decimal pl-5 text-xs text-slate-700">
              {route.legs.map((l, i) => <li key={i}>{VEHICLE_LABEL[l.vehicle]}: {l.from} → {l.to} ({fmtDays(l.days)}){l.note ? `. ${l.note}` : ""}</li>)}
            </ol>
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <div><dt className="inline font-semibold">Transbordos: </dt><dd className="inline">{route.transshipments.length ? route.transshipments.join("; ") : "ninguno"}</dd></div>
              <div><dt className="inline font-semibold">Espera hasta la salida: </dt><dd className="inline">{fmtDays(route.waitDays)}</dd></div>
              <div><dt className="inline font-semibold">Tránsito total: </dt><dd className="inline">{fmtDays(transitDays(route))} (entrega a los {fmtDays(q.deliveryDays)} con la preparación; plazo {c.deadlineDays} días)</dd></div>
              <div><dt className="inline font-semibold">Equipo y unidad de cobro: </dt><dd className="inline">{q.equipment.description} · {q.equipment.chargeable}</dd></div>
              <div><dt className="inline font-semibold">Coste logístico total: </dt><dd className="inline font-semibold">{fmtRangeEur(q.logistics.total)}</dd></div>
              <div><dt className="inline font-semibold">Por kg / por palé: </dt><dd className="inline">{fmtRangeEur(q.perKg, 2)} / {fmtRangeEur(q.perPallet, 2)}</dd></div>
            </dl>
            {route.suitability.map((s) => <p key={s.note} className="text-xs text-amber-900">⚠️ {s.note}</p>)}
          </article>
        );
      })}
    </div>
  );
}

const PARTY_STYLE = { vendedor: "bg-indigo-100 text-indigo-900", comprador: "bg-slate-200 text-slate-800" } as const;

/** Presupuesto: cada concepto una sola vez, con rango y pagador; aranceles e impuestos aparte. */
export function QuoteView({ c, q, title = "Presupuesto logístico" }: { c: Shipment; q: Quote; title?: string }) {
  const cg = c.cargo;
  const t = q.taxes;
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-semibold">{title} · {q.incoterm}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <caption className="sr-only">Conceptos logísticos con rango de coste y quién los paga</caption>
          <thead><tr className="border-b border-slate-300"><th className="py-1 pr-2">Concepto</th><th className="py-1 pr-2">Rango</th><th className="py-1 pr-2">Paga</th><th className="py-1">Detalle</th></tr></thead>
          <tbody>
            {q.lines.map((l) => (
              <tr key={l.concept} className="border-b border-slate-100 align-top">
                <td className="py-1 pr-2 font-medium">{l.label}</td>
                <td className="whitespace-nowrap py-1 pr-2">{fmtRangeEur(l.range)}</td>
                <td className="py-1 pr-2"><span className={`rounded px-1.5 py-0.5 ${PARTY_STYLE[l.payer]}`}>{l.payer}</span></td>
                <td className="py-1">{l.note} <ProvenanceBadge prov={l.prov} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold"><td className="py-1 pr-2">Coste logístico total</td><td className="whitespace-nowrap py-1 pr-2">{fmtRangeEur(q.logistics.total)}</td><td colSpan={2} className="py-1">vendedor {fmtRangeEur(q.logistics.seller)} · comprador {fmtRangeEur(q.logistics.buyer)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="rounded bg-slate-50 p-2 text-xs">
        <p className="font-semibold">Aranceles e impuestos (no son costes logísticos)</p>
        {t ? (
          <p>Arancel {fmtRangeEur(t.duty)} ({t.dutyPct} %{t.preferential ? ", preferencial con prueba de origen" : ", tipo general: sin prueba de origen acreditada o sin acuerdo preferencial"}; a cargo del {t.payer}). {t.vatPct === null ? "Sin impuesto de importación tipo IVA en este caso (los impuestos sobre ventas locales no se simulan)." : <>Impuesto de importación {fmtRangeEur(t.vat)} ({t.vatPct} %), a cargo del {t.payer}{t.vatRecoverable ? ": recuperable, por eso no se suma como coste." : ": no recuperable, se suma como coste."}</>} Valor en aduana ≈ mercancía + flete principal + seguro ({fmtRangeEur(t.customsValue)}), simplificación didáctica.</p>
        ) : <p>Operación dentro de la UE: sin despacho de aduanas, aranceles ni IVA de importación.</p>}
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <Metric label="Coste por kg" value={fmtRangeEur(q.perKg, 2)} />
        <Metric label="Coste por tonelada" value={fmtRangeEur(q.perTonne)} />
        <Metric label="Coste por palé" value={fmtRangeEur(q.perPallet, 2)} />
        <Metric label={`Coste logístico por ${cg.unit}`} value={fmtRangeEur(q.perUnit, 2)} />
        <Metric label={`Coste puesto en destino por ${cg.unit} (valor EXW + logística + impuestos no recuperables)`} value={fmtRangeEur(q.deliveredCostPerUnit, 2)} />
        <Metric label="% logístico sobre el valor" value={fmtPctRange(q.logisticsPct)} />
        <Metric label="Plazo de entrega (con preparación)" value={`${fmtDays(q.deliveryDays)} (máx. ${c.deadlineDays})`} />
        <Metric label="Equipo" value={`${q.equipment.description} · ${q.equipment.chargeable}`} />
      </dl>
      <p className="text-xs text-slate-600">La liquidación de la operación usa el valor central de cada rango; el margen final lo verás en el resumen.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-200 p-2"><dt className="text-slate-600">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}

const CONCEPTS: LogisticsConcept[] = ["recogida", "terminal_origen", "despacho_exportacion", "transporte_principal", "seguro", "terminal_destino", "ultima_milla", "despacho_importacion", "aranceles"];

/** Quién paga cada concepto con un Incoterm y si encaja con la ruta (se muestra tras decidir el Incoterm). */
export function IncotermObligations({ code, route }: { code: string; route: RouteOption }) {
  const i = incotermOf(code);
  const ap = applicability(code, route);
  return (
    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
      <p><b>{i.code} — {i.name}</b> · {i.modes}. {i.delivery}</p>
      <p><b>Riesgo:</b> {riskPoint(code)} <b>Seguro:</b> {i.insurance}.</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {CONCEPTS.map((k) => <li key={k}>{CONCEPT_LABEL[k]}: <b>{payerOf(k, code)}</b></li>)}
      </ul>
      {ap.level !== "ok" && <p className={ap.level === "contradiccion" ? "text-rose-900" : "text-amber-900"}><b>{ap.level === "contradiccion" ? "Contradicción" : "Aviso"}:</b> {ap.message}</p>}
      {i.note && <p className="text-slate-600">{i.note}</p>}
    </div>
  );
}

