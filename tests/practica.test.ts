import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calificar, muestraFinal, repartoFinal, rng, semillaDe, barajar, TAM_FINAL } from "@/lib/practica/engine";
import { catalogo, modulosDisponibles, preguntasDe, totalPreguntas } from "@/lib/practica/catalog";

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("banco de tests (data/practica)", () => {
  const todas = modulosDisponibles().flatMap((m) => m.unidades.flatMap((u) => u.tests.map((t) => ({ m, t, qs: preguntasDe(t) }))));

  it("carga y valida los 4 módulos con todas sus preguntas", () => {
    expect(modulosDisponibles().map((m) => m.codigo)).toEqual(["0622", "0627", "0623", "0625"]);
    expect(todas.length).toBe(117);
    expect(todas.reduce((s, x) => s + x.qs.length, 0)).toBe(1887);
  });

  it("ids y enunciados únicos en todo el banco; cada id empieza por su módulo y su test", () => {
    const ids = new Set<string>(), enun = new Set<string>();
    for (const { m, t, qs } of todas) for (const q of qs) {
      expect(q.id.startsWith(`${m.codigo}-${t.id}-`)).toBe(true);
      expect(ids.has(q.id)).toBe(false); ids.add(q.id);
      const e = q.enunciado.trim().toLowerCase();
      expect(enun.has(e), q.id).toBe(false); enun.add(e);
    }
  });

  it("una pregunta «oficial» no puede decir en su fuente que no se ha leído", () => {
    for (const { qs } of todas) for (const q of qs) if (q.verificacion === "oficial") expect(q.fuente.toLowerCase()).not.toMatch(/no leíd|no contrastad|no verificad|conocimiento general|no he leído/);
  });

  // Umbrales medidos el 27/11/2026 en la web de origen: con 4 opciones de longitud independiente de la verdad, la correcta
  // es la más larga en ~25 % de los casos. Por encima del 40 %, «elegir la más larga» aprueba sin saber nada.
  it.each(modulosDisponibles().map((m) => [m.codigo] as const))("módulo %s: la longitud de la opción no delata la correcta", (codigo) => {
    const m = modulosDisponibles().find((x) => x.codigo === codigo)!;
    let n = 0, larga = 0, corta = 0;
    for (const u of m.unidades) for (const t of u.tests) for (const q of preguntasDe(t)) {
      n++;
      const L = q.opciones.map((o) => o.length), c = L[q.respuesta];
      if (c === Math.max(...L) && L.filter((x) => x === c).length === 1) larga++;
      if (c === Math.min(...L) && L.filter((x) => x === c).length === 1) corta++;
    }
    expect(larga / n).toBeLessThanOrEqual(0.4);
    expect(corta / n).toBeLessThanOrEqual(0.4);
    expect(totalPreguntas(m)).toBe(n);
  });
});

describe("motor de los tests", () => {
  it("misma semilla, mismo orden; semilla distinta, orden distinto", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    expect(barajar(xs, rng(semillaDe("0622:1.1", 0)))).toEqual(barajar(xs, rng(semillaDe("0622:1.1", 0))));
    expect(barajar(xs, rng(semillaDe("0622:1.1", 0)))).not.toEqual(barajar(xs, rng(semillaDe("0622:1.1", 1))));
    expect([...barajar(xs, rng(5))].sort((a, b) => a - b)).toEqual(xs);
  });

  it("reparto del test final: suma el total, mínimo 1 por unidad y nunca más que las preguntas de la unidad", () => {
    for (const m of modulosDisponibles()) {
      const cuentas = m.unidades.map((u) => u.tests.reduce((s, t) => s + preguntasDe(t).length, 0));
      const r = repartoFinal(cuentas, TAM_FINAL);
      expect(r.reduce((s, x) => s + x, 0)).toBe(Math.min(TAM_FINAL, cuentas.reduce((s, x) => s + x, 0)));
      r.forEach((x, i) => { expect(x).toBeGreaterThanOrEqual(1); expect(x).toBeLessThanOrEqual(cuentas[i]); });
    }
    // Una unidad diminuta sigue entrando en el examen aunque su cuota proporcional sea < 1 (esto es lo que ata el mínimo de 1).
    const pequena = repartoFinal([1, 100, 100], 60);
    expect(pequena[0]).toBe(1);
    expect(pequena.reduce((s, x) => s + x, 0)).toBe(60);
    expect(repartoFinal([3, 0, 5], 100)).toEqual([3, 0, 5]);
    expect(repartoFinal([], 10)).toEqual([]);
  });

  it("muestra final: tamaño correcto, sin repetidas y reproducible con la semilla", () => {
    const m = catalogo().modulos[0];
    const grupos = m.unidades.map((u) => u.tests.flatMap(preguntasDe));
    const a = muestraFinal(grupos, rng(7)), b = muestraFinal(grupos, rng(7));
    expect(a.length).toBe(TAM_FINAL);
    expect(new Set(a.map((q) => q.id)).size).toBe(TAM_FINAL);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("nota con penalización de medio acierto por fallo; blancos no puntúan; nunca negativa", () => {
    const r = calificar([true, true, false, false], [true, true, true, false]);
    expect(r).toMatchObject({ aciertos: 2, fallos: 1, blancos: 1, total: 4 });
    expect(r.sobre10).toBeCloseTo(3.75); // (2 − 0,5) / 4 · 10
    expect(r.sobre10SinPenalizar).toBeCloseTo(5);
    expect(calificar([false, false], [true, true]).sobre10).toBe(0);
    expect(calificar([], []).sobre10).toBe(0);
  });

  it("lib/practica no usa Math.random ni la hora: el azar siempre sale de una semilla", () => {
    for (const f of ["lib/practica/engine.ts", "lib/practica/catalog.ts", "components/practica/quiz.tsx"]) {
      expect(sinComentarios(readFileSync(f, "utf8")), f).not.toMatch(/Math\.random|Date\.now|new Date\(/);
    }
  });
});
