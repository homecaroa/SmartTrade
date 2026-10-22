export function fmtMoney(v: number | null, currency: string | null): string {
  if (v === null || !currency) return "n.d.";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
}
export const fmtPct = (v: number | null, d = 1) => (v === null ? "n.d." : `${v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d })} %`);
export const fmtNum = (v: number | null, d = 1) => (v === null ? "n.d." : v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtDate = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
export function fmtAge(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return "hace menos de 1 min";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}
