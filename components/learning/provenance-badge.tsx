import { PROVENANCE_LABEL, type Fact, type Provenance } from "@/lib/learning/provenance";

const STYLE: Record<Provenance["kind"], string> = {
  real: "bg-indigo-100 text-indigo-900",
  supuesto: "bg-slate-200 text-slate-800",
  estimacion: "bg-amber-100 text-amber-900",
  verificar: "bg-rose-100 text-rose-900",
};

export function ProvenanceBadge({ prov }: { prov: Provenance }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${STYLE[prov.kind]}`} title={prov.source}>{PROVENANCE_LABEL[prov.kind]}{prov.source ? ` · ${prov.source}` : ""}</span>;
}

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {facts.map((f) => (
        <div key={f.label} className="rounded border border-slate-200 p-2">
          <dt className="text-xs font-semibold text-slate-600">{f.label}</dt>
          <dd className="text-sm">{f.value}</dd>
          <dd className="mt-1"><ProvenanceBadge prov={f.prov} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function ProvenanceLegend() {
  return (
    <p className="flex flex-wrap gap-2 text-xs text-slate-600">
      <span>Procedencia de los datos:</span>
      {(["real", "supuesto", "estimacion", "verificar"] as const).map((k) => <ProvenanceBadge key={k} prov={{ kind: k }} />)}
    </p>
  );
}
