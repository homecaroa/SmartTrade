import Link from "next/link";
import { METRICS, type RankMetric } from "@/lib/trade/ranking";

/**
 * Métrica por la que se ordenan los mercados de un producto. Sustituye al selector de los rankings por percentiles
 * (retirados el 06/11/2026): cada métrica es un dato en su unidad y se explica junto al selector.
 */
export function MetricSwitch({ current, hrefFor, currency }: { current: RankMetric; hrefFor: (m: RankMetric) => string; currency: string }) {
  const metrics = Object.keys(METRICS) as RankMetric[];
  return (
    <div className="space-y-1">
      <nav aria-label="Ordenar mercados por" className="flex flex-wrap gap-2">
        {metrics.map((m) => (
          <Link key={m} href={hrefFor(m)} aria-current={current === m ? "page" : undefined}
            className={`rounded border px-3 py-1.5 text-sm font-medium ${current === m ? "border-indigo-700 bg-indigo-700 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
            {METRICS[m].label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-slate-600"><b>{METRICS[current].label}</b> ({METRICS[current].unit(currency)}): {METRICS[current].explain}</p>
    </div>
  );
}
