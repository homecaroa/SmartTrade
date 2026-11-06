import type { Caution } from "@/lib/trade/diagnosis";

/** Avisos sobre los datos de un mercado, con su explicación visible (no solo en un tooltip). */
export function MarketCautions({ cautions, compact = false }: { cautions: Caution[]; compact?: boolean }) {
  if (cautions.length === 0) return null;
  if (compact) {
    return (
      <ul className="flex flex-wrap gap-1" aria-label="Avisos sobre los datos">
        {cautions.map((c) => <li key={c.key} className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{c.label}</li>)}
      </ul>
    );
  }
  return (
    <ul className="space-y-1 text-sm" aria-label="Avisos sobre los datos">
      {cautions.map((c) => (
        <li key={c.key} className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-950"><b>{c.label}.</b> {c.detail}</li>
      ))}
    </ul>
  );
}
