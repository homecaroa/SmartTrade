import Link from "next/link";
import { LENSES, type RankingLens } from "@/lib/scoring/score";

/**
 * Selector de los dos rankings. Desde el 03/11/2026 no hay puntuación única (ver docs/methodology.md): cada ranking
 * responde a una pregunta distinta y se explica junto al selector. Ordenar por crecimiento pasado sigue disponible,
 * pero se avisa de que no es un ranking validado.
 */
export function LensSwitch({ current, hrefFor }: { current: RankingLens | "growth"; hrefFor: (s: RankingLens) => string }) {
  const lenses = Object.keys(LENSES) as RankingLens[];
  return (
    <div className="space-y-2">
      <nav aria-label="Ranking" className="flex flex-wrap gap-2">
        {lenses.map((l) => (
          <Link key={l} href={hrefFor(l)} aria-current={current === l ? "page" : undefined}
            className={`rounded border px-3 py-1.5 text-sm font-semibold ${current === l ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 hover:bg-slate-50"}`}>
            {LENSES[l].label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-slate-600">
        {current === "growth"
          ? "Ordenado por crecimiento pasado: es un dato informativo, no un ranking. En la validación histórica no anticipó el crecimiento posterior."
          : LENSES[current].summary}{" "}
        Son señales estadísticas para decidir qué investigar, no previsiones. <Link href="/metodologia" className="underline">Cómo se validaron</Link>.
      </p>
    </div>
  );
}
