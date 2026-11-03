import { fmtNum } from "@/lib/format";
import { LENSES, type RankingLens, type ScoreResult } from "@/lib/scoring/score";
import type { LensRanks } from "@/lib/trade/ranking";

/** Índice 0-100 de una oportunidad en uno de los dos rankings (el percentil de su componente). */
export function ScoreBadge({ score, lens }: { score: ScoreResult; lens: RankingLens }) {
  return <span className="inline-block min-w-12 rounded bg-slate-900 px-2 py-1 text-center text-sm font-bold text-white" title={LENSES[lens].label}>{fmtNum(score[lens], 0)}</span>;
}

const Bar = ({ value }: { value: number }) => <div className="mt-1 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-indigo-600" style={{ width: `${value}%` }} /></div>;

/**
 * Posición en los dos rankings y datos informativos. Desde el 03/11/2026 no hay puntuación única: cada ranking usa un
 * solo componente, validado en la comparación histórica (docs/methodology.md). Crecimiento y exportación se muestran,
 * pero no ordenan.
 */
export function ScoreBreakdown({ score, ranks }: { score: ScoreResult; ranks: LensRanks }) {
  const comp = (k: string) => score.components.find((c) => c.key === k)!;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Índices 0-100 (percentiles) sobre <b>{score.universeSize}</b> oportunidades completas ({score.productUniverseSize} productos). No son probabilidades de éxito ni rentabilidades esperadas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(LENSES) as RankingLens[]).map((lens) => {
          const c = comp(LENSES[lens].component);
          return (
            <div key={lens} className="rounded border border-slate-200 p-3">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{LENSES[lens].label}</span>
                <span>índice <b>{fmtNum(score[lens], 0)}</b>{ranks[lens] && <> · puesto <b>{ranks[lens]}</b></>}</span>
              </div>
              <Bar value={score[lens]} />
              <p className="mt-1 text-xs text-slate-600">{LENSES[lens].summary}</p>
              {c.note && <p className="mt-1 text-xs text-amber-700">{c.note}</p>}
            </div>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Datos informativos (no ordenan)</p>
        {(["growth", "export"] as const).map((k) => {
          const c = comp(k);
          return (
            <div key={k}>
              <div className="flex justify-between text-sm"><span>{c.label}</span><span>percentil {fmtNum(c.normalized, 0)}</span></div>
              <Bar value={c.normalized} />
              {c.note && <p className="mt-1 text-xs text-amber-700">{c.note}</p>}
            </div>
          );
        })}
        <p className="text-xs text-slate-500">El crecimiento pasado no anticipó el crecimiento posterior en la validación histórica: úsalo para entender el mercado, no para elegirlo. La posición exportadora es la misma en todos los mercados de un producto.</p>
      </div>
    </div>
  );
}
