import type { Grade } from "@/lib/learning/export/types";

export const GRADE_LABEL: Record<Grade, string> = { correcta: "Decisión adecuada", razonable: "Razonable, con inconvenientes", grave: "Error importante" };
const STYLE: Record<Grade, string> = { correcta: "bg-emerald-100 text-emerald-900", razonable: "bg-amber-100 text-amber-900", grave: "bg-rose-100 text-rose-900" };

export function GradeBadge({ grade }: { grade: Grade }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STYLE[grade]}`}>{GRADE_LABEL[grade]}</span>;
}
