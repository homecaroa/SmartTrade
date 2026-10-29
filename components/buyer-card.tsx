import { LEVEL_LABEL, SOURCE_LABEL, TYPE_LABEL, type Company } from "@/lib/buyers/types";

const LEVEL_STYLE = { confirmado: "bg-emerald-100 text-emerald-900", probable: "bg-amber-100 text-amber-900", insuficiente: "bg-slate-200 text-slate-700" } as const;
const WEB_LABEL = { verificada: "web verificada", segun_listado: "web según listado, no visitada", sin_verificar: "web sin verificar" } as const;

export function BuyerCard({ c }: { c: Company }) {
  return (
    <li className="space-y-2 rounded-lg bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{c.name}</h3>
          {c.nameLocal && <p className="text-xs text-slate-500">{c.nameLocal}</p>}
          <p className="text-xs text-slate-600">{[c.city, c.country].filter(Boolean).join(", ")} · {TYPE_LABEL[c.type]}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={`rounded px-2 py-0.5 text-xs ${LEVEL_STYLE[c.evidenceLevel]}`}>{LEVEL_LABEL[c.evidenceLevel]}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{c.origin === "curado" ? "Curado a mano" : "Búsqueda automática, sin revisar"}</span>
        </div>
      </div>
      <p>{c.reason}</p>
      <p className="text-xs text-slate-600">{c.levelReason} Producto español: <b>{c.spainOriginVerified ? "verificado en fuente primaria u oficial" : "no verificado"}</b>.</p>
      {c.brands.length > 0 && <p className="text-xs">Marcas relacionadas: {c.brands.join(", ")}</p>}
      <div className="rounded border border-slate-200 p-2 text-xs">
        <p className="font-medium">Contacto público verificable</p>
        {c.website && <p>Web: <a className="underline" href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a> <span className="text-slate-500">({WEB_LABEL[c.websiteStatus]})</span></p>}
        {c.contact.contactPageUrl && <p>Formulario o página de contacto: <a className="underline" href={c.contact.contactPageUrl} target="_blank" rel="noopener noreferrer">{c.contact.contactPageUrl}</a></p>}
        {c.contact.phone && <p>Teléfono: {c.contact.phone} <a className="underline" href={c.contact.phoneSourceUrl ?? "#"} target="_blank" rel="noopener noreferrer">(fuente)</a></p>}
        {c.contact.email && <p>Correo general: {c.contact.email} <a className="underline" href={c.contact.emailSourceUrl ?? "#"} target="_blank" rel="noopener noreferrer">(fuente)</a></p>}
        {!c.contactVerified && <p className="text-slate-500">Sin contacto verificado.</p>}
      </div>
      <div>
        <p className="text-xs font-medium">Pruebas ({c.evidence.length})</p>
        <ul className="space-y-1 text-xs">
          {c.evidence.map((e) => (
            <li key={e.url}>
              <a className="underline" href={e.url} target="_blank" rel="noopener noreferrer">{e.title}</a>{" "}
              <span className="text-slate-500">· {SOURCE_LABEL[e.sourceType]} · {e.howConsulted === "pagina_leida" ? "página leída" : "solo extracto del buscador"} · consultada {e.consultedAt}{e.publishedAt ? ` · publicada ${e.publishedAt}` : ""}</span>
              <p className="text-slate-700">{e.summary}</p>
            </li>
          ))}
        </ul>
      </div>
      {c.pending.length > 0 && <div className="text-xs"><p className="font-medium text-amber-800">Pendiente de verificar</p><ul className="list-disc pl-5 text-slate-700">{c.pending.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {c.notes.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-600">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </li>
  );
}
