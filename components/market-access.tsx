import { STATUS_LABEL, type MarketAccessInfo, type Verification } from "@/lib/market-access";

const BADGE: Record<Verification, string> = {
  verified: "bg-green-100 text-green-900",
  partial: "bg-amber-100 text-amber-900",
  pending: "bg-blue-100 text-blue-900",
  unavailable: "bg-slate-200 text-slate-700",
};

export function MarketAccess({ info }: { info: MarketAccessInfo }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm space-y-3" aria-labelledby="acceso-mercado">
      <h2 id="acceso-mercado" className="font-semibold">Acceso al mercado</h2>
      <p className="text-sm text-slate-600">
        Origen: <b>{info.originName}</b> · Destino: <b>{info.destinationName}</b> · Producto: <b>HS {info.hs6}</b>
        {" "}· Fecha de consulta: <b>sin consulta automática</b>
      </p>
      {info.demo && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Producto y mercado de demostración: la información de acceso es solo orientativa y no procede de estadísticas oficiales.
        </p>
      )}
      <ul className="divide-y divide-slate-100 text-sm">
        {info.items.map((it) => (
          <li key={it.topic} className="py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{it.label}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${BADGE[it.status]}`}>{STATUS_LABEL[it.status]}</span>
            </div>
            <p className="text-slate-800">{it.value ?? (it.status === "unavailable" ? "No disponible" : "Pendiente de consulta")}</p>
            {it.note && <p className="text-xs text-slate-500">{it.note}</p>}
            <p className="text-xs text-slate-400">Fuente: {it.source}</p>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="text-sm font-medium">Cómo comprobarlo</h3>
        <ol className="list-decimal pl-5 text-sm text-slate-700">{info.howTo.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>
      <ul className="space-y-1 text-sm">
        {info.links.map((l) => (
          <li key={l.url}><a className="underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a> <span className="text-xs text-slate-500">— {l.purpose}</span></li>
        ))}
      </ul>
      <ul className="list-disc pl-5 text-xs text-slate-600">{info.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
    </section>
  );
}
