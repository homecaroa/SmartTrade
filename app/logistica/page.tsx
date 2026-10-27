import { INCOTERMS, QUOTE_CHECKLIST, TRANSPORT_MODES } from "@/lib/logistics/incoterms";

export const metadata = { title: "Transporte e Incoterms · SmarTrade" };

export default function Logistics() {
  const h = "mt-5 text-base font-semibold";
  const th = "px-2 py-1 text-left text-xs font-semibold uppercase text-slate-500";
  const td = "px-2 py-1 align-top";
  return (
    <article className="max-w-5xl space-y-2 rounded-lg bg-white p-6 text-sm shadow-sm">
      <h1 className="text-xl font-bold">Transporte e Incoterms®</h1>
      <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
        Guía orientativa. SmarTrade no estima tarifas, plazos ni costes de transporte: no dispone de datos verificados. Es un resumen parafraseado de las reglas Incoterms® 2020 de la ICC, no su texto oficial: consulta el texto oficial y comprueba si existe una versión posterior.
      </p>

      <h2 className={h}>Modos de transporte</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {TRANSPORT_MODES.map((m) => (
          <li key={m.id} className="rounded border border-slate-200 p-3">
            <p className="font-medium">{m.name}</p>
            <p className="mt-1 text-xs font-semibold text-emerald-800">Ventajas</p>
            <ul className="list-disc pl-5 text-slate-700">{m.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="mt-1 text-xs font-semibold text-amber-800">Límites</p>
            <ul className="list-disc pl-5 text-slate-700">{m.limits.map((s) => <li key={s}>{s}</li>)}</ul>
          </li>
        ))}
      </ul>

      <h2 className={h}>Las 11 reglas Incoterms® 2020</h2>
      <p>Un Incoterm fija en qué punto se entrega la mercancía, cuándo pasa el riesgo del vendedor al comprador y quién contrata, paga y despacha cada tramo. No regula el precio, la propiedad ni la forma de pago.</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="border-b bg-slate-50">
            <tr><th className={th}>Regla</th><th className={th}>Entrega</th><th className={th}>Riesgo</th><th className={th}>Transporte principal</th><th className={th}>Seguro</th><th className={th}>Exportación</th><th className={th}>Importación</th></tr>
          </thead>
          <tbody className="divide-y">
            {INCOTERMS.map((i) => (
              <tr key={i.code}>
                <td className={td}><b>{i.code}</b><div className="text-slate-500">{i.name}</div><div className="text-slate-400">{i.modes}</div></td>
                <td className={td}>{i.delivery}{i.note && <div className="mt-1 text-slate-500">{i.note}</div>}</td>
                <td className={td}>{i.risk}</td>
                <td className={td}>{i.carriage}</td>
                <td className={td}>{i.insurance}</td>
                <td className={td}>{i.exportClearance}</td>
                <td className={td}>{i.importClearance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={h}>Cómo elegir (preguntas útiles)</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>¿Quién controla mejor el transporte y tiene mejores condiciones con navieras o transportistas? Quien lo contrata decide ruta, plazos y seguro.</li>
        <li>¿Puede el comprador despachar la exportación en España? Si no, evita EXW.</li>
        <li>¿Es transporte marítimo en contenedor? FCA suele describir mejor la entrega que FOB cuando el vendedor entrega en una terminal.</li>
        <li>¿Aceptas los trámites e impuestos del país de destino? DDP los traslada al vendedor y exige poder cumplirlos allí.</li>
        <li>En reglas con seguro (CIP, CIF) comprueba la cobertura contratada; en las demás, decide si conviene asegurar aunque no sea obligatorio.</li>
      </ul>

      <h2 className={h}>Qué incluir al pedir un presupuesto de transporte</h2>
      <ul className="list-disc space-y-1 pl-5">{QUOTE_CHECKLIST.map((q) => <li key={q}>{q}</li>)}</ul>
    </article>
  );
}
