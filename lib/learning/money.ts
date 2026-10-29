/** Importes del Modo Aprendizaje: siempre en euros y redondeados a céntimos, para que los cálculos sean reproducibles. */
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtEur = (v: number) => EUR.format(round2(v));
export const fmtPctLearning = (v: number, d = 1) => `${v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
