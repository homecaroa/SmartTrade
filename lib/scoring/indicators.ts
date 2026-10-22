/** Indicadores comerciales. Funciones puras; devuelven null cuando el cálculo no es válido (nunca 0 por defecto). */

const valid = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** CAGR en %. Requiere valores inicial y final > 0 y al menos 1 intervalo. */
export function cagr(initial: number | null, final: number | null, intervals: number): number | null {
  if (!valid(initial) || !valid(final) || !Number.isInteger(intervals) || intervals < 1) return null;
  if (initial <= 0 || final <= 0) return null;
  return (Math.pow(final / initial, 1 / intervals) - 1) * 100;
}

/** Variaciones anuales en %. null si algún extremo falta o el valor previo no es > 0. */
export function annualChanges(values: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    out.push(valid(prev) && valid(cur) && prev > 0 ? (cur / prev - 1) * 100 : null);
  }
  return out;
}

/** Cuota española en %. Requiere total > 0 y que España no supere el total. */
export function spanishShare(fromSpain: number | null, total: number | null): number | null {
  if (!valid(fromSpain) || !valid(total) || total <= 0 || fromSpain < 0) return null;
  if (fromSpain > total * 1.0000001) return null; // inconsistencia de definiciones
  return (fromSpain / total) * 100;
}

/** Proporción (%) de las importaciones que corresponde a los n mayores proveedores. */
export function topSuppliersShare(
  suppliers: { code: string; value: number }[],
  total: number | null,
  n = 3,
): number | null {
  if (!valid(total) || total <= 0 || suppliers.length === 0) return null;
  const top = [...suppliers].sort((a, b) => b.value - a.value).slice(0, n);
  const sum = top.reduce((s, x) => s + x.value, 0);
  return sum > total * 1.0000001 ? null : (sum / total) * 100;
}

/** Valor unitario estadístico (valor / kg). No es un precio de venta. */
export function unitValuePerKg(value: number | null, netWeightKg: number | null): number | null {
  if (!valid(value) || !valid(netWeightKg) || netWeightKg <= 0 || value < 0) return null;
  return value / netWeightKg;
}
