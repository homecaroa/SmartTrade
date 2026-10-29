import { describe, expect, it } from "vitest";
import { criteria, deliveredPrice, respond, utility, validateOffer } from "@/lib/learning/negotiation/buyer-engine";
import { floorPrice, sellerEconomics, targetPrice } from "@/lib/learning/negotiation/economics";
import { evaluateNegotiation, gradeWalkaway } from "@/lib/learning/negotiation/evaluation";
import { ACEITE_MEXICO } from "@/lib/learning/negotiation/scenarios/aceite-mexico";
import { CALZADO_REINO_UNIDO } from "@/lib/learning/negotiation/scenarios/calzado-reino-unido";
import { NEGOTIATION_SCENARIOS } from "@/lib/learning/negotiation/scenarios";
import { acceptCounter, confirmPrep, newNegotiation, submitOffer, walkAway, type NegotiationSession } from "@/lib/learning/negotiation/session";
import type { NegotiationScenario, Offer } from "@/lib/learning/negotiation/types";

const MX = ACEITE_MEXICO;
const UK = CALZADO_REINO_UNIDO;
const base = (sc: NegotiationScenario, o: Partial<Offer> = {}): Offer => sc === MX
  ? { unitPrice: 46, quantity: 1200, incoterm: "CIP", deliveryDays: 50, payment: "abierta_90_seguro", exclusivity: false, guarantee: "ampliada", ...o }
  : { unitPrice: 55, quantity: 2400, incoterm: "DAP", deliveryDays: 35, payment: "abierta_60", exclusivity: false, guarantee: "ampliada", ...o };
function ready(sc: NegotiationScenario, prep: Record<string, string | number> = {}): NegotiationSession {
  let s = newNegotiation(sc.id, new Date(0));
  for (const q of sc.prep) s = confirmPrep(sc, s, q.id, prep[q.id] ?? (q.kind === "walkaway" ? floorPrice(sc, q.basis.incoterm, q.basis.payment, q.basis.guarantee) : q.best));
  return s;
}

describe("economía del vendedor", () => {
  it("aplica las fórmulas documentadas", () => {
    const o = base(MX, { unitPrice: 50, quantity: 1000 });
    const e = sellerEconomics(MX, o);
    expect(e.revenue).toBe(50000);
    expect(e.product).toBe(30000);
    expect(e.logistics).toBe(4400); // CIP 4,40 €
    expect(e.guarantee).toBe(600);
    expect(e.financing).toBeCloseTo(50000 * 0.07 * 90 / 365, 2);
    expect(e.fee).toBeCloseTo(50000 * 0.006, 2);
    expect(e.expectedLoss).toBeCloseTo(50000 * 0.005, 2); // riesgo medio × 1
    expect(e.margin).toBeCloseTo(e.revenue - e.product - e.logistics - e.guarantee - e.financing - e.fee - e.expectedLoss, 2);
  });
  it("el precio mínimo da margen cero y el objetivo da el margen objetivo", () => {
    for (const sc of NEGOTIATION_SCENARIOS) {
      const o = base(sc);
      expect(Math.abs(sellerEconomics(sc, { ...o, unitPrice: floorPrice(sc, o.incoterm, o.payment, o.guarantee) }).marginPct)).toBeLessThan(0.1);
      expect(sellerEconomics(sc, { ...o, unitPrice: targetPrice(sc, o.incoterm, o.payment, o.guarantee) }).marginPct).toBeCloseTo(sc.seller.targetMarginPct, 0);
    }
  });
  it("en cada caso existe una zona de acuerdo rentable para los dos", () => {
    for (const sc of NEGOTIATION_SCENARIOS) {
      const ok = sc.allowedIncoterms.some((inc) => !sc.seller.unfeasibleIncoterms[inc] && floorPrice(sc, inc, "abierta_60", "ampliada") + (sc.hidden.buyerExtraPerUnit[inc] ?? 0) < sc.hidden.maxPrice);
      expect(ok).toBe(true);
    }
  });
});

describe("comprador simulado: reglas deterministas", () => {
  it("a más precio, menos utilidad; el resto igual", () => {
    expect(utility(MX, base(MX, { unitPrice: 44 }))).toBeGreaterThan(utility(MX, base(MX, { unitPrice: 49 })));
  });
  it("compara en coste puesto en su almacén: el Incoterm cambia lo que paga él", () => {
    expect(deliveredPrice(MX, base(MX, { incoterm: "FCA", unitPrice: 40 }))).toBe(46.8);
    expect(deliveredPrice(MX, base(MX, { incoterm: "DAP", unitPrice: 40 }))).toBe(40.4);
  });
  it("límites duros: cantidad fuera de rango, plazo excesivo o pago inaceptable impiden aceptar", () => {
    const hard = (o: Offer) => criteria(MX, o).filter((c) => c.hard).map((c) => c.key);
    expect(hard(base(MX, { quantity: 100 }))).toContain("quantity");
    expect(hard(base(MX, { deliveryDays: 90 }))).toContain("delivery");
    expect(hard(base(MX, { payment: "anticipado" }))).toContain("payment");
    expect(respond(MX, base(MX, { unitPrice: 30, payment: "anticipado" }), 0, []).kind).not.toBe("acepta");
  });
  it("acepta una buena oferta y contraoferta una alta, acercándose a su objetivo", () => {
    expect(respond(MX, base(MX, { unitPrice: 43 }), 0, []).kind).toBe("acepta");
    const r = respond(MX, base(MX, { unitPrice: 49 }), 0, []);
    expect(r.kind).toBe("contraoferta");
    const dp = deliveredPrice(MX, r.counter!);
    expect(dp).toBeLessThan(deliveredPrice(MX, base(MX, { unitPrice: 49 })));
    expect(dp).toBeGreaterThanOrEqual(MX.hidden.targetPrice);
  });
  it("concede más en rondas posteriores (misma oferta → contraoferta más alta)", () => {
    const o = base(MX, { unitPrice: 49 });
    expect(respond(MX, o, 2, [0.5, 0.6]).counter!.unitPrice).toBeGreaterThan(respond(MX, o, 0, []).counter!.unitPrice);
  });
  it("pide exclusividad a cambio de más volumen si la valora; si no, no la pide", () => {
    const mx = respond(MX, base(MX, { unitPrice: 49 }), 0, []).counter!;
    expect(mx.exclusivity).toBe(true);
    expect(mx.quantity).toBe(Math.min(MX.hidden.maxQty, MX.hidden.desiredQty + MX.hidden.exclusivity.extraQty));
    const uk = respond(UK, base(UK, { unitPrice: 62 }), 0, []).counter!;
    expect(uk.exclusivity).toBe(false);
  });
  it("si cambia el Incoterm, la contraoferta conserva el coste puesto en almacén comparable", () => {
    const o = base(MX, { incoterm: "FCA", unitPrice: 44 });
    const c = respond(MX, o, 0, []).counter!;
    expect(c.incoterm).not.toBe("FCA");
    expect(deliveredPrice(MX, c)).toBeLessThanOrEqual(deliveredPrice(MX, o));
  });
  it("las razones son cualitativas: no revelan sus límites numéricos", () => {
    const r = respond(MX, base(MX, { unitPrice: 52 }), 0, []);
    const txt = r.reasons.join(" ");
    for (const n of [MX.hidden.targetPrice, MX.hidden.maxPrice, MX.hidden.maxDeliveryDays, MX.hidden.desiredQty]) expect(txt).not.toContain(String(n));
  });
  it("es determinista", () => {
    const o = base(UK, { unitPrice: 61 });
    expect(respond(UK, o, 1, [0.6])).toEqual(respond(UK, o, 1, [0.6]));
  });
});

describe("sesión de negociación", () => {
  it("no admite ofertas antes de preparar la estrategia", () => {
    expect(() => submitOffer(MX, newNegotiation(MX.id), base(MX))).toThrow();
  });
  it("valida la oferta: errores que bloquean y avisos de contradicción", () => {
    expect(validateOffer(MX, base(MX, { quantity: 5000 })).errors.length).toBeGreaterThan(0);
    expect(validateOffer(MX, base(MX, { unitPrice: -1 })).errors.length).toBeGreaterThan(0);
    expect(validateOffer(UK, base(UK, { deliveryDays: 20 })).warnings.join(" ")).toMatch(/no podrías cumplirlo/);
    expect(validateOffer(UK, base(UK, { incoterm: "DDP" })).warnings.join(" ")).toMatch(/registrada/);
    expect(validateOffer(MX, base(MX, { unitPrice: 30 })).warnings.join(" ")).toMatch(/pérdidas/);
    expect(() => submitOffer(MX, ready(MX), base(MX, { quantity: 5000 }))).toThrow();
  });
  it("aceptar la contraoferta cierra con acuerdo; rechazar, sin acuerdo", () => {
    const s = submitOffer(MX, ready(MX), base(MX, { unitPrice: 49 }));
    expect(s.outcome).toBeNull();
    expect(acceptCounter(s).outcome).toMatchObject({ status: "acuerdo", how: "alumno_acepta" });
    expect(walkAway(s).outcome).toMatchObject({ status: "sin_acuerdo", how: "alumno_rechaza" });
  });
  it("si el alumno no se mueve, el comprador se retira", () => {
    let s = ready(MX);
    const o = base(MX, { unitPrice: 51 });
    s = submitOffer(MX, s, o);
    s = submitOffer(MX, s, o);
    s = submitOffer(MX, s, o);
    expect(s.outcome).toMatchObject({ status: "sin_acuerdo", how: "comprador_rechaza" });
  });
  it("tras su última propuesta solo se puede aceptar o rechazar", () => {
    // Ofertas que mejoran un poco en cada ronda (sin estancarse) pero nunca llegan a su umbral: se agota la paciencia.
    let s = ready(MX);
    for (const p of [50.2, 49.8, 49.4, 49.0, 48.6]) s = submitOffer(MX, s, base(MX, { unitPrice: p, exclusivity: false }));
    expect(s.rounds).toHaveLength(MX.hidden.maxRounds);
    expect(s.outcome).toBeNull();
    expect(s.rounds.slice(0, -1).every((r) => !r.response.final)).toBe(true);
    expect(s.rounds.at(-1)!.response).toMatchObject({ kind: "contraoferta", final: true });
    expect(() => submitOffer(MX, s, base(MX))).toThrow(/última propuesta/);
    expect(acceptCounter(s).outcome?.status).toBe("acuerdo");
  });
});

describe("evaluación de la negociación", () => {
  it("el punto de retirada se califica contra el coste real", () => {
    const f = floorPrice(MX, "CIP", "abierta_90_seguro", "ampliada");
    expect(gradeWalkaway(MX, f).grade).toBe("correcta");
    expect(gradeWalkaway(MX, f * 1.1).grade).toBe("razonable");
    expect(gradeWalkaway(MX, f - 1).grade).toBe("grave");
    expect(gradeWalkaway(MX, f * 1.3).grade).toBe("grave");
  });
  it("no premia sin más el precio más alto: la rentabilidad se satura en el objetivo", () => {
    const close = (price: number) => { const s = ready(UK); return { ...s, step: "cierre" as const, rounds: [{ offer: base(UK, { unitPrice: price }), response: { kind: "acepta" as const, reasons: [], counter: null, final: true, utility: 1 } }], outcome: { status: "acuerdo" as const, final: base(UK, { unitPrice: price }), how: "comprador_acepta" as const } }; };
    const dim = (p: number) => evaluateNegotiation(UK, close(p)).dimensions;
    const r60 = dim(60), r56 = dim(56);
    expect(r60.find((d) => d.key === "rentabilidad")!.score).toBe(100);
    expect(r56.find((d) => d.key === "rentabilidad")!.score).toBe(100);
    expect(r56.find((d) => d.key === "adecuacion")!.score!).toBeGreaterThan(r60.find((d) => d.key === "adecuacion")!.score!);
  });
  it("una concesión con contrapartida puntúa; una gratuita, no", () => {
    const run = (second: Offer) => { let s = ready(MX); s = submitOffer(MX, s, base(MX, { unitPrice: 52, payment: "abierta_90" })); s = submitOffer(MX, s, second); return evaluateNegotiation(MX, s.outcome ? s : walkAway(s)); }; // sin aceptar su contraoferta: solo cuentan las dos ofertas del alumno
    const traded = run(base(MX, { unitPrice: 50, payment: "abierta_90_seguro", quantity: 1400 }));
    const gift = run(base(MX, { unitPrice: 50, payment: "abierta_90" }));
    const pts = (e: ReturnType<typeof evaluateNegotiation>) => e.process.find((p) => p.label === "Concesiones con contrapartida")!.points;
    expect(pts(traded)).toBe(10);
    expect(pts(gift)).toBe(0);
  });
  it("la nota de conocimientos y la economía se calculan por separado", () => {
    const s = acceptCounter(submitOffer(MX, ready(MX, { apertura: "minimo", contrapartida: "conceder" }), base(MX, { unitPrice: 49 })));
    const e = evaluateNegotiation(MX, s);
    expect(e.economics!.marginPct).toBeGreaterThan(0);
    expect(e.knowledge.pct).toBeLessThan(100);
    expect(e.errors.length).toBeGreaterThan(0);
  });
  it("la estrategia de referencia llega a un acuerdo con el margen objetivo en cada caso", () => {
    for (const sc of NEGOTIATION_SCENARIOS) {
      const ev = evaluateNegotiation(sc, ready(sc));
      expect(ev.reference.session.outcome?.status).toBe("acuerdo");
      expect(ev.reference.economics!.marginPct).toBeGreaterThanOrEqual(sc.seller.targetMarginPct);
    }
  });
  it("prometer un plazo imposible o un Incoterm inviable baja el cumplimiento", () => {
    const close = (o: Offer) => ({ ...ready(UK), step: "cierre" as const, outcome: { status: "acuerdo" as const, final: o, how: "comprador_acepta" as const } });
    const ok = evaluateNegotiation(UK, close(base(UK))).dimensions.find((d) => d.key === "cumplimiento")!.score;
    const bad = evaluateNegotiation(UK, close(base(UK, { deliveryDays: 20, incoterm: "DDP" }))).dimensions.find((d) => d.key === "cumplimiento")!.score;
    expect(ok).toBe(100);
    expect(bad).toBeLessThanOrEqual(10);
  });
});

describe("aceptar una contraoferta cuenta como concesión", () => {
  it("si la contraoferta aceptada es más barata pero con más volumen, es una concesión con contrapartida", () => {
    const s = acceptCounter(submitOffer(MX, ready(MX), base(MX, { unitPrice: 48.5, quantity: 1000 })));
    const c = evaluateNegotiation(MX, s).process.find((p) => p.label === "Concesiones con contrapartida")!;
    expect(c.explain).toMatch(/1 de 1/);
    expect(c.explain).toMatch(/más cantidad/);
    expect(c.points).toBe(10);
  });
});
