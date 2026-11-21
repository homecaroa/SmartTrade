import { beforeAll, describe, expect, it } from "vitest";
import { apply, balanceGap, breakdownAt, newGame } from "@/lib/sim/engine";
import { CAREER_WEEKS, lastWeekOf, localWeek, semesterKey, semesterOf, semesterSeed, weekLabel, weekOfYear, yearOf, yearOfMonth } from "@/lib/sim/calendar";
import type { Action, SimState } from "@/lib/sim/model";
import { SEASON_WEEKS } from "@/lib/sim/params";
import { CONCEPTS, monthQuestions } from "@/lib/sim/questions";
import { parseSave, restore, toSave } from "@/lib/sim/save";
import { balanceAt, cashFlow, incomeStatement, periods } from "@/lib/sim/statements";
import { play } from "@/lib/sim/strategies";

/**
 * Carrera, fase A (21/11/2026; docs/simulador-carrera.md): calendario de 5 años con el mismo motor, reproducción sin
 * clonar en cada acción y estados financieros calculados. Que la Temporada no cambia lo comprueba, además, la
 * reproducción de 783 partidas guardadas con el motor anterior (docs/testing.md).
 */
let career: { state: SimState; actions: Action[]; maxGap: number };
let broke: { state: SimState; actions: Action[] };

beforeAll(() => {
  career = play(1, "negociadora", undefined, "carrera");
  // Una carrera que acaba en quiebra a mitad de un periodo (los estados de un periodo a medias tienen que cuadrar).
  broke = play(3, "codiciosa", undefined, "carrera");
}, 60_000);

describe("calendario", () => {
  it("la Temporada sigue siendo de 26 semanas y sin modo; la Carrera, de 5 años de 52 semanas", () => {
    const t = newGame(5);
    expect("mode" in t).toBe(false);
    expect(lastWeekOf(t)).toBe(SEASON_WEEKS);
    expect(lastWeekOf(newGame(5, undefined, "carrera"))).toBe(260);
    expect(CAREER_WEEKS).toBe(260);
  });
  it("semestres, años y claves: el primer semestre usa la semilla y las claves de siempre", () => {
    expect([semesterOf(1), semesterOf(26), semesterOf(27), semesterOf(260)]).toEqual([0, 0, 1, 9]);
    expect([localWeek(26), localWeek(27), localWeek(53)]).toEqual([26, 1, 1]);
    expect(semesterKey("dano", 26)).toBe("dano");
    expect(semesterKey("dano", 27)).toBe("dano@2");
    expect(semesterSeed(42, 0)).toBe(42);
    expect(semesterSeed(42, 1)).not.toBe(42);
    expect([yearOf(52), yearOf(53), weekOfYear(53), yearOfMonth(13), yearOfMonth(14)]).toEqual([1, 2, 1, 1, 2]);
    expect(weekLabel(newGame(1, undefined, "carrera"), 60)).toBe("Año 2, semana 8");
    expect(weekLabel(newGame(1), 6)).toBe("Semana 6");
  });
});

describe("una carrera completa", () => {
  it("llega a la semana 260 con la contabilidad cuadrada en cada paso", () => {
    expect(career.state.status).toBe("fin");
    expect(career.state.weeks).toHaveLength(260);
    expect(career.maxGap).toBe(0);
    expect(balanceGap(career.state)).toBe(0);
  });
  it("los sucesos de la temporada se repiten cada semestre, con su propia clave", () => {
    const keys = Object.keys(career.state.answers);
    // Averías en varios semestres (las de la Temporada no pasan de la semana 21).
    expect(keys.filter((k) => /^averia(-\d)?@\d+$/.test(k)).length).toBeGreaterThan(5);
    expect(keys.some((k) => /^reparto-\w+@\d+$/.test(k))).toBe(true);
    expect(career.state.weeks.filter((w) => w.week > SEASON_WEEKS && w.notes.some((n) => n.startsWith("Avería"))).length).toBeGreaterThan(5);
  });
  it("cada semestre sortea sus sucesos con su propia semilla (no repite las mismas semanas)", () => {
    let differs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const at = (k: number) => Array.from({ length: 26 }, (_, i) => breakdownAt(seed, k * 26 + i + 1)?.days ?? 0).join(",");
      if (at(0) !== at(1)) differs++;
      expect(breakdownAt(seed, 27 + 26 * 3) === null || breakdownAt(seed, 27 + 26 * 3)!.id.endsWith("@5")).toBe(true);
    }
    expect(differs).toBeGreaterThan(30);
  });
  it("las preguntas de concepto no se repiten dentro de un año, y el año 2 vuelve a tenerlas", () => {
    const qs = monthQuestions(career.state);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    const conceptKeys = new Set(CONCEPTS.map((c) => c.key));
    for (const y of [1, 2, 3, 4, 5]) {
      const keys = qs.filter((q) => yearOfMonth(q.month) === y && conceptKeys.has(q.key)).map((q) => q.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
    }
    // El mes 14 es el primero del año 2: vuelve a tener sus tres de concepto (antes del 21/11/2026 se habrían agotado).
    expect(qs.filter((q) => q.month === 14 && conceptKeys.has(q.key))).toHaveLength(3);
  });
});

describe("reproducción rápida (sin clonar en cada acción)", () => {
  it("da exactamente el mismo estado que aplicar las acciones una a una", () => {
    const save = toSave(career.state.seed, career.actions, career.state.version, new Date(0), "carrera");
    const p = parseSave(JSON.parse(JSON.stringify(save)));
    if (!p.ok) throw new Error(p.error);
    expect(p.save.mode).toBe("carrera");
    const r = restore(p.save);
    expect(r.dropped).toBe(0);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(career.state));
  });
  it("es rápida: una carrera de 5 años se carga en menos de 1,5 s (clonando en cada paso tardaba de 2,6 a 4,7 s)", () => {
    const save = toSave(career.state.seed, career.actions, career.state.version, new Date(0), "carrera");
    const t = performance.now();
    restore(save);
    expect(performance.now() - t).toBeLessThan(1500);
  });
  it("si una acción falla a mitad, se queda con el estado limpio de las anteriores", () => {
    const actions: Action[] = [{ t: "aceptar", oferta: "s1-1" }, { t: "cerrar" }, { t: "aceptar", oferta: "s2-1", docs: ["no-existe"] }, { t: "cerrar" }];
    const r = restore(toSave(11, actions));
    expect(r.dropped).toBe(2);
    const slow = actions.slice(0, 2).reduce(apply, newGame(11));
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(slow));
  });
});

describe("estados financieros", () => {
  const check = (s: SimState) => {
    for (let w = 0; w <= s.weeks.length; w++) expect(balanceAt(s, w).gap).toBe(0);
    for (const kind of ["trimestre", "año"] as const) for (const p of periods(s, kind)) {
      const f = cashFlow(s, p.from, p.to);
      expect(Math.abs(f.opening + f.operating + f.investing + f.financing - f.closing)).toBeLessThan(0.01);
      const sumWeeks = s.weeks.filter((x) => x.week >= p.from && x.week <= p.to).reduce((a, x) => a + x.result, 0);
      expect(Math.abs(incomeStatement(s, p.from, p.to).result - sumWeeks)).toBeLessThan(0.01);
    }
  };
  it("el balance cuadra en todas las semanas y los flujos explican la tesorería (carrera completa)", () => check(career.state));
  it("también en una carrera que acaba en quiebra a mitad de un periodo", () => {
    expect(broke.state.status).toBe("quiebra");
    expect(broke.state.weeks.at(-1)!.week % 13).not.toBe(0);
    check(broke.state);
  });
  it("también en temporadas con póliza, segundo camión comprado y nave ampliada", () => {
    for (let seed = 1; seed <= 15; seed++) check(play(seed * 7919 + 1, "crecedora").state);
  });
  it("con la póliza dispuesta: el balance la lleva al pasivo y su variación es el flujo de financiación", () => {
    // Semilla encontrada buscando una temporada que cierre semanas con la caja negativa y póliza (21/11/2026).
    const s = play(126705, "crecedora").state;
    const drawn = s.weeks.filter((w) => w.cashEnd < 0);
    expect(drawn.length).toBeGreaterThan(0);
    const w = drawn[0].week;
    expect(balanceAt(s, w).credit).toBe(-drawn[0].cashEnd);
    expect(balanceAt(s, w).cash).toBe(0);
    const f = cashFlow(s, w, w);
    expect(f.financing).toBeGreaterThan(0);
    check(s);
  });
  it("el balance de una semana aún sin cerrar es el de la última cerrada", () => {
    const s = broke.state, last = s.weeks.at(-1)!.week;
    expect(balanceAt(s, last + 5)).toEqual({ ...balanceAt(s, last) });
    expect(balanceAt(s, -3)).toEqual(balanceAt(s, 0));
  });
  it("el último balance coincide con el estado de la partida", () => {
    const s = career.state, b = balanceAt(s, s.weeks.at(-1)!.week);
    expect(b.truck).toBe(s.truckValue);
    expect(b.deposits).toBe(s.deposit);
    expect(b.accrued).toBe(s.accruedFixed);
    expect(b.retained).toBeCloseTo(s.result, 2);
  });
  it("periodos: 20 trimestres y 5 años en la carrera, con sus nombres", () => {
    const s = career.state;
    expect(periods(s, "trimestre")).toHaveLength(20);
    expect(periods(s, "año").map((p) => p.label)).toEqual(["Año 1", "Año 2", "Año 3", "Año 4", "Año 5"]);
    expect(periods(s, "trimestre")[5].label).toBe("T2 del año 2");
  });
});
