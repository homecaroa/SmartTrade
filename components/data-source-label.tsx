import { fmtAge, fmtDate } from "@/lib/format";
import type { DataInfo } from "@/lib/service";

const MODE_LABEL = { demo: "DEMO · datos sintéticos", comext: "Eurostat Comext", comtrade: "UN Comtrade" } as const;

export function ModeBadge({ mode }: { mode: keyof typeof MODE_LABEL }) {
  const demo = mode === "demo";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${demo ? "bg-amber-100 text-amber-900 ring-1 ring-amber-400" : "bg-emerald-100 text-emerald-900"}`}>
      {MODE_LABEL[mode]}
    </span>
  );
}

export function DataSourceLabel({ info }: { info: DataInfo }) {
  return (
    <div className="space-y-2 text-sm text-slate-600">
      {info.synthetic && (
        <p className="rounded border border-amber-400 bg-amber-50 p-2 font-medium text-amber-900">
          Datos de demostración sintéticos: no son estadísticas oficiales y no deben usarse para decisiones comerciales.
        </p>
      )}
      {info.stale && (
        <p className="rounded border border-red-300 bg-red-50 p-2 font-medium text-red-900">
          La fuente no respondió. Se muestran datos de caché obtenidos {fmtAge(info.ageMs)}; pueden no estar actualizados.
        </p>
      )}
      {info.snapshot?.stale && (
        <p className="rounded border border-amber-400 bg-amber-50 p-2 font-medium text-amber-900">
          Los datos guardados tienen {info.snapshot.ageDays} días: se actualizan cada dos meses y la última actualización puede no haberse completado.
        </p>
      )}
      {info.snapshot ? (
        <p>
          Fuente: <b>{info.sourceLabel}</b> · Datos guardados el {fmtDate(info.snapshot.generatedAt)} ({fmtAge(info.ageMs)}; se actualizan cada dos meses)
          {info.snapshot.liveCodes.length ? <> · consultados en vivo: {info.snapshot.liveCodes.join(", ")}</> : null}
        </p>
      ) : (
        <p>
          Fuente: <b>{info.sourceLabel}</b> · Obtenido: {fmtDate(info.retrievedAt)} ({fmtAge(info.ageMs)}
          {info.fromCache ? ", desde caché" : ""})
        </p>
      )}
    </div>
  );
}
