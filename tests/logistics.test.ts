import { describe, expect, it } from "vitest";
import { INCOTERMS, QUOTE_CHECKLIST, TRANSPORT_MODES } from "@/lib/logistics/incoterms";

const codes = (f: (i: (typeof INCOTERMS)[number]) => boolean) => INCOTERMS.filter(f).map((i) => i.code).sort();

describe("Incoterms 2020", () => {
  it("son 11 reglas únicas", () => {
    expect(INCOTERMS).toHaveLength(11);
    expect(new Set(INCOTERMS.map((i) => i.code)).size).toBe(11);
  });
  it("solo FAS, FOB, CFR y CIF son exclusivas del transporte marítimo y fluvial", () => {
    expect(codes((i) => i.modes === "solo marítimo y fluvial")).toEqual(["CFR", "CIF", "FAS", "FOB"]);
  });
  it("el despacho de exportación es del comprador solo en EXW; el de importación es del vendedor solo en DDP", () => {
    expect(codes((i) => i.exportClearance === "comprador")).toEqual(["EXW"]);
    expect(codes((i) => i.importClearance === "vendedor")).toEqual(["DDP"]);
  });
  it("el vendedor contrata el transporte principal en CPT, CIP, CFR, CIF, DAP, DPU y DDP", () => {
    expect(codes((i) => i.carriage === "vendedor")).toEqual(["CFR", "CIF", "CIP", "CPT", "DAP", "DDP", "DPU"]);
  });
  it("solo CIP y CIF obligan al vendedor a contratar seguro (A para CIP, C para CIF)", () => {
    expect(codes((i) => i.insurance !== "no obligatorio")).toEqual(["CIF", "CIP"]);
    expect(INCOTERMS.find((i) => i.code === "CIP")!.insurance).toMatch(/A/);
    expect(INCOTERMS.find((i) => i.code === "CIF")!.insurance).toMatch(/C/);
  });
});

describe("guía de transporte: sin datos inventados", () => {
  it("no contiene tarifas, plazos ni porcentajes", () => {
    const text = JSON.stringify([INCOTERMS, TRANSPORT_MODES, QUOTE_CHECKLIST]);
    expect(text).not.toMatch(/\d+\s?(€|\$|%|días|horas|semanas|USD|EUR)/i);
  });
  it("cada modo describe ventajas y límites", () => {
    expect(TRANSPORT_MODES.length).toBeGreaterThanOrEqual(5);
    expect(TRANSPORT_MODES.every((m) => m.strengths.length > 0 && m.limits.length > 0)).toBe(true);
  });
});
