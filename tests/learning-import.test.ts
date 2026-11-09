import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeImport, landedUnitFor } from "@/lib/learning/import/costs";
import { confirmImport, evaluateImport, gradeImport, importProgress, isImportSession, newImportSession, optionsOf, pendingImport, visibleImportDecisions } from "@/lib/learning/import/engine";
import { IMPORT_SCENARIOS, importScenario } from "@/lib/learning/import/scenarios";
import type { ImportAnswers } from "@/lib/learning/import/types";

/**
 * Simulador de importación (09/11/2026). Las reglas que se comprueban salen de fuentes primarias citadas en
 * lib/learning/import/costs.ts: valor en aduana (Código Aduanero, arts. 70-72), antidumping de bicicletas chinas y su
 * extensión a lo enviado desde Malasia (Reglamento de Ejecución 2019/1379, art. 1), base del IVA a la importación (Ley
 * del IVA, art. 83) e IVA diferido (Reglamento del IVA, art. 74.1). Los importes son simulados.
 */
const sc = importScenario("bicicletas-valencia")!;
const BEST: ImportAnswers = { proveedor: "taiwan", incoterm: "FOB", seguro: "a", pago: "carta_credito", representacion: "directa", iva_pago: "diferido" };
const line = (r: ReturnType<typeof computeImport>, key: string) => r.lines.find((l) => l.key === key)?.amount ?? 0;

describe("coste puesto en almacén", () => {
  it("el proveedor más barato en origen (China) es el más caro puesto en almacén por el antidumping", () => {
    expect(sc.suppliers.find((s) => s.id === "china")!.fobUnit).toBeLessThan(sc.suppliers.find((s) => s.id === "taiwan")!.fobUnit);
    expect(landedUnitFor(sc, "taiwan")).toBeLessThan(landedUnitFor(sc, "china"));
  });
  it("enviar desde Malasia no evita el antidumping (la medida se extendió a lo enviado desde allí)", () => {
    const r = computeImport(sc, { ...BEST, proveedor: "china_malasia" });
    expect(r.antidumping).toBeGreaterThan(0);
    expect(r.antidumping).toBeCloseTo(r.customsValue * 0.485, 1);
  });
  it("valor en aduana FOB = precio + flete + seguro hasta Valencia + canon; sin comisión de compra, transporte interior ni derechos", () => {
    const r = computeImport(sc, BEST);
    const goods = 400 * 88;
    expect(r.customsValue).toBeCloseTo(goods + line(r, "flete") + line(r, "seguro") + 400 * sc.royaltyUnit, 2);
    expect(line(r, "comision")).toBeGreaterThan(0); // existe, pero no entra en el valor
    expect(r.duty).toBeCloseTo(r.customsValue * 0.14, 1);
  });
  it("base del IVA = valor en aduana + derechos + gastos hasta el almacén (primer destino); IVA al 21 %", () => {
    for (const p of ["taiwan", "china"]) {
      const r = computeImport(sc, { ...BEST, proveedor: p });
      expect(r.vatBase).toBeCloseTo(r.customsValue + r.duty + r.antidumping + sc.destinationHandling + sc.inlandTransport, 1);
      expect(r.vat).toBeCloseTo(r.vatBase * 0.21, 1);
    }
  });
  it("en DAP el transporte tras la entrada va en el precio, pero se excluye del valor en aduana y entra en la base del IVA", () => {
    const r = computeImport(sc, { ...BEST, incoterm: "DAP" });
    const markup = 1 + sc.rates.supplierFreightMarkupPct / 100;
    const postEntry = (sc.destinationHandling + sc.inlandTransport) * markup;
    expect(r.customsValue).toBeCloseTo(400 * 88 + 3000 * markup + 400 * sc.royaltyUnit, 1);
    expect(r.vatBase).toBeCloseTo(r.customsValue + r.duty + postEntry, 1);
    expect(r.lines.some((l) => l.key === "transporte_interior")).toBe(false);
  });
  it("CIF incluye un seguro con cláusulas (C) en el precio y no hay seguro aparte", () => {
    const r = computeImport(sc, { ...BEST, incoterm: "CIF" });
    expect(r.lines.some((l) => l.key === "seguro")).toBe(false);
    expect(r.lines.find((l) => l.key === "compra")!.note).toMatch(/cláusulas \(C\)/);
  });
  it("el IVA es recuperable: solo cuesta su financiación si no se difiere; diferido, ninguna línea", () => {
    expect(computeImport(sc, BEST).lines.some((l) => l.key === "iva_financiero")).toBe(false);
    const paid = computeImport(sc, { ...BEST, iva_pago: "aduana" });
    expect(line(paid, "iva_financiero")).toBeGreaterThan(0);
    expect(line(paid, "iva_financiero")).toBeLessThan(paid.vat * 0.01);
    expect(paid.lines.some((l) => /^IVA/.test(l.label))).toBe(false);
  });
  it("la representación indirecta cuesta más que la directa", () => {
    expect(line(computeImport(sc, { ...BEST, representacion: "indirecta" }), "despacho")).toBeGreaterThan(line(computeImport(sc, BEST), "despacho"));
  });
  it("con las mejores decisiones el margen supera el objetivo; comprando a China, no", () => {
    expect(computeImport(sc, BEST).marginPct).toBeGreaterThan(sc.targetMarginPct);
    expect(computeImport(sc, { ...BEST, proveedor: "china" }).marginPct).toBeLessThan(sc.targetMarginPct);
  });
});

describe("decisiones y evaluación", () => {
  const play = (pick: (d: ReturnType<typeof visibleImportDecisions>[number], answers: ImportAnswers) => string | string[]) => {
    let s = newImportSession(sc.id);
    for (let i = 0; i < 30; i++) {
      const d = pendingImport(sc, s);
      if (!d) break;
      s = confirmImport(sc, s, d.id, pick(d, s.answers));
    }
    return s;
  };
  const bestPick = (d: ReturnType<typeof visibleImportDecisions>[number], answers: ImportAnswers): string | string[] => {
    const ctx = { scenario: sc, answers };
    if (d.kind === "single") return typeof d.best === "function" ? d.best(ctx) : d.best;
    const docs = typeof d.docs === "function" ? d.docs(ctx) : d.docs;
    return docs.filter((x) => x.need === "obligatorio" || x.need === "recomendado").map((x) => x.id);
  };
  it("eligiendo siempre lo más adecuado se completa el caso con un 100 % y sin errores graves", () => {
    const s = play(bestPick);
    expect(importProgress(sc, s).complete).toBe(true);
    const ev = evaluateImport(sc, s);
    expect(ev.knowledge.pct).toBe(100);
    expect(ev.graveErrors).toEqual([]);
    expect(ev.economics.lines.find((l) => l.key === "extra")!.amount).toBe(240); // incidencia del canal rojo
  });
  it("la elusión vía Malasia es un error grave", () => {
    const s = confirmImport(sc, newImportSession(sc.id), "proveedor", "china_malasia");
    expect(gradeImport(sc, sc.decisions.find((d) => d.id === "proveedor")!, s.answers)!.grade).toBe("grave");
  });
  it("valor en aduana: sumar la comisión de compra o el arancel, u olvidar el canon, es error grave", () => {
    const d = sc.decisions.find((x) => x.id === "valor_aduana")!;
    const g = (sel: string[]) => gradeImport(sc, d, { ...BEST, valor_aduana: sel })!.grade;
    expect(g(["precio", "flete", "seguro", "canon"])).toBe("correcta");
    expect(g(["precio", "flete", "seguro", "canon", "comision"])).toBe("grave");
    expect(g(["precio", "flete", "seguro", "canon", "arancel"])).toBe("grave");
    expect(g(["precio", "flete", "seguro"])).toBe("grave");
  });
  it("el seguro solo se pregunta en FOB; las opciones de origen dependen del proveedor", () => {
    const ids = (a: ImportAnswers) => visibleImportDecisions(sc, a).map((d) => d.id);
    expect(ids({ incoterm: "FOB" })).toContain("seguro");
    expect(ids({ incoterm: "CIF" })).not.toContain("seguro");
    const origen = sc.decisions.find((d) => d.id === "origen")!;
    if (origen.kind !== "single") throw new Error("tipo");
    expect(optionsOf(origen, { scenario: sc, answers: { proveedor: "taiwan" } }).map((o) => o.id)).toContain("eur1");
    expect(optionsOf(origen, { scenario: sc, answers: { proveedor: "china" } }).map((o) => o.id)).toContain("pagar");
  });
  it("la base del IVA correcta es la que ofrece la opción «completa» con las decisiones del alumno", () => {
    const d = sc.decisions.find((x) => x.id === "base_iva")!;
    if (d.kind !== "single") throw new Error("tipo");
    for (const p of ["taiwan", "china"]) {
      const a = { ...BEST, proveedor: p };
      const r = computeImport(sc, a);
      expect(optionsOf(d, { scenario: sc, answers: a }).find((o) => o.id === "completa")!.label.replace(/\D/g, "")).toBe(new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(r.vatBase).replace(/\D/g, ""));
    }
  });
  it("una decisión confirmada no cambia y las opciones inválidas se rechazan", () => {
    let s = confirmImport(sc, newImportSession(sc.id), "proveedor", "taiwan");
    s = confirmImport(sc, s, "proveedor", "china");
    expect(s.answers.proveedor).toBe("taiwan");
    expect(() => confirmImport(sc, s, "incoterm", "EXW")).toThrow();
  });
  it("la sesión guardada se valida por caso y versión", () => {
    const s = newImportSession(sc.id);
    expect(isImportSession(s, sc.id)).toBe(true);
    expect(isImportSession(s, "otro")).toBe(false);
    expect(isImportSession({ ...s, v: 2 }, sc.id)).toBe(false);
    expect(isImportSession({ ...s, module: "exportacion" }, sc.id)).toBe(false);
  });
});

describe("integridad del caso", () => {
  it("ids únicos, una opción «best» existente y cada decisión con al menos una opción grave o razonable", () => {
    for (const c of IMPORT_SCENARIOS) {
      expect(new Set(c.decisions.map((d) => d.id)).size).toBe(c.decisions.length);
      for (const d of c.decisions) {
        if (d.kind !== "single") continue;
        for (const p of c.suppliers) {
          const ctx = { scenario: c, answers: { ...BEST, proveedor: p.id } };
          const opts = optionsOf(d, ctx);
          const best = typeof d.best === "function" ? d.best(ctx) : d.best;
          expect(opts.some((o) => o.id === best), `${d.id}/${p.id}`).toBe(true);
          expect(opts.some((o) => (typeof o.grade === "function" ? o.grade(ctx) : o.grade) !== "correcta"), d.id).toBe(true);
        }
      }
    }
  });
  it("cada afirmación normativa de la ficha lleva fuente o «verificar»; las empresas son ficticias", () => {
    for (const f of sc.facts) expect(f.prov.kind === "real" ? !!f.prov.source : true, f.label).toBe(true);
    expect(sc.importer.name).toMatch(/ficticia/);
    expect(sc.facts.some((f) => /2019\/1379/.test(f.prov.source ?? ""))).toBe(true);
  });
  it("el caso se enlaza desde la portada y tiene su ruta", () => {
    expect(readFileSync("components/learning/learning-home.tsx", "utf8")).toMatch(/\/aprendizaje\/importacion\/\$\{sc\.id\}/);
    expect(readFileSync("app/aprendizaje/importacion/[caso]/page.tsx", "utf8")).toMatch(/ImportSimulator/);
  });
});

describe("textos de corrección", () => {
  it("el valor en aduana no se corrige hablando de «documentación»", () => {
    const d = sc.decisions.find((x) => x.id === "valor_aduana")!;
    expect(gradeImport(sc, d, { ...BEST, valor_aduana: ["precio", "flete", "seguro", "canon"] })!.feedback[0]).toBe("Has sumado exactamente lo que forma el valor en aduana.");
  });
});
