export interface StageItem { id: string; title: string; state: "hecha" | "actual" | "pendiente" }

/** Progreso por etapas, accesible: lista ordenada con la etapa actual marcada. */
export function StageProgress({ items, label }: { items: StageItem[]; label: string }) {
  const style = { hecha: "border-emerald-300 bg-emerald-50 text-emerald-900", actual: "border-indigo-400 bg-indigo-50 font-semibold text-indigo-900", pendiente: "border-slate-200 bg-white text-slate-500" } as const;
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap gap-2 text-xs">
        {items.map((s, i) => (
          <li key={s.id} aria-current={s.state === "actual" ? "step" : undefined} className={`rounded border px-2 py-1 ${style[s.state]}`}>
            {i + 1}. {s.title}{s.state === "hecha" ? " ✓" : ""}
          </li>
        ))}
      </ol>
    </nav>
  );
}
