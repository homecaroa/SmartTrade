import type { Tag } from "@/lib/scoring/labels";

const TONE = {
  positive: "bg-emerald-100 text-emerald-900",
  neutral: "bg-slate-100 text-slate-700",
  caution: "bg-amber-100 text-amber-900",
} as const;

export function OpportunityTags({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <li key={t.key} title={t.hint} className={`rounded px-1.5 py-0.5 text-xs ${TONE[t.tone]}`}>{t.label}</li>
      ))}
    </ul>
  );
}
