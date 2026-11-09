/**
 * Calculadora básica del simulador (petición del dueño, 09/11/2026). Evalúa expresiones con + − × ÷, paréntesis, signo
 * y decimales con coma o punto, SIN eval: analizador descendente recursivo. No conoce ninguna regla del juego.
 */
export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

export function evaluate(input: string): CalcResult {
  const src = input.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!src) return { ok: false, error: "Escribe una operación." };
  if (!/^[\d.,+\-*/()]+$/.test(src)) return { ok: false, error: "Solo números, + − × ÷ y paréntesis." };
  let i = 0;
  const peek = () => src[i];
  const number = (): number => {
    const m = /^\d+(?:[.,]\d+)?/.exec(src.slice(i));
    if (!m) throw new Error("Falta un número.");
    i += m[0].length;
    return Number(m[0].replace(",", "."));
  };
  const factor = (): number => {
    if (peek() === "-") { i++; return -factor(); }
    if (peek() === "+") { i++; return factor(); }
    if (peek() === "(") { i++; const v = expr(); if (peek() !== ")") throw new Error("Falta cerrar un paréntesis."); i++; return v; }
    return number();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = factor();
      if (op === "/" && r === 0) throw new Error("No se puede dividir entre cero.");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = src[i++]; const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  try {
    const value = expr();
    if (i < src.length) throw new Error("La operación no está bien escrita.");
    return { ok: true, value: Math.round(value * 1e6) / 1e6 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Operación no válida." };
  }
}
