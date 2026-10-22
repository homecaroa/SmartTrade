import { fmtNum } from "@/lib/format";
import { topContributors, type ScoreResult } from "@/lib/scoring/score";

export function ScoreBadge({ score }: { score: ScoreResult }) {
  return <span className="inline-block min-w-12 rounded bg-slate-900 px-2 py-1 text-center text-sm font-bold text-white">{fmtNum(score.total)}</span>;
}

export function ScoreBreakdown({ score }: { score: ScoreResult }) {
  const top = topContributors(score, 2).map((c) => c.label);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Puntuación estadística 0-100 sobre un universo de <b>{score.universeSize}</b> oportunidades completas ({score.productUniverseSize} productos).
        No es una probabilidad de éxito ni una rentabilidad esperada. Mayor aporte: <b>{top.join(" y ")}</b>.
      </p>
      {score.components.map((c) => (
        <div key={c.key}>
          <div className="flex justify-between text-sm">
            <span>{c.label} <span className="text-slate-400">(peso {Math.round(c.weight * 100)} %)</span></span>
            <span>percentil {fmtNum(c.normalized, 0)} → <b>{fmtNum(c.contribution)}</b> pts</span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-indigo-600" style={{ width: `${c.normalized}%` }} /></div>
          {c.note && <p className="mt-1 text-xs text-amber-700">{c.note}</p>}
        </div>
      ))}
      <p className="text-xs text-slate-500">Puntuación = 0,35·tamaño + 0,30·crecimiento + 0,20·expansión de cuota + 0,15·posición exportadora.</p>
    </div>
  );
}
